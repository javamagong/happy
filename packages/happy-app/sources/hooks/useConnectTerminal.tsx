import * as React from 'react';
import { Modal as RNModal, View, StyleSheet, Pressable, Text, PermissionsAndroid, Platform } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { decodeBase64 } from '@/encryption/base64';
import { encryptBox } from '@/encryption/libsodium';
import { authApprove } from '@/auth/authApprove';
import { Modal } from '@/modal';
import { t } from '@/text';
import { getServerUrl } from '@/sync/serverConfig';
import { sync } from '@/sync/sync';
import { Camera, useCameraDevices, type CameraDevice, type CodeType, type Code } from 'react-native-vision-camera';

interface UseConnectTerminalOptions {
    onSuccess?: () => void;
    onError?: (error: any) => void;
}

// 扫码弹窗组件 - 内部使用 useCameraDevices hook
function QRScannerModal({
    visible,
    onScanned,
    onClose
}: {
    visible: boolean;
    onScanned: (data: string) => void;
    onClose: () => void;
}) {
    // 始终调用 hook，让 React 管理设备状态
    const devices = useCameraDevices();
    const cameraRef = React.useRef<Camera>(null);
    const [isActive, setIsActive] = React.useState(false);

    const cameraDevice = React.useMemo(
        () => devices.find(d => d.position === 'back'),
        [devices]
    );

    React.useEffect(() => {
        if (visible && cameraDevice) {
            setIsActive(true);
        } else {
            setIsActive(false);
        }
    }, [visible, cameraDevice]);

    const codeScanner = React.useMemo(() => ({
        codeTypes: ['qr'] as CodeType[],
        onCodeScanned: (codes: Code[]) => {
            const data = codes[0]?.value;
            if (data) {
                setIsActive(false);
                onScanned(data);
            }
        }
    }), [onScanned]);

    if (!visible) return null;

    if (!cameraDevice) {
        return (
            <RNModal
                visible={visible}
                animationType="slide"
                transparent={false}
                onRequestClose={onClose}
            >
                <View style={styles.container}>
                    <View style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>{t('common.loading')}</Text>
                    </View>
                </View>
            </RNModal>
        );
    }

    return (
        <RNModal
            visible={visible}
            animationType="slide"
            transparent={false}
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                <Camera
                    ref={cameraRef}
                    style={StyleSheet.absoluteFill}
                    device={cameraDevice}
                    isActive={isActive}
                    codeScanner={codeScanner}
                />
                <View style={styles.buttonContainer}>
                    <Pressable style={styles.cancelButton} onPress={onClose}>
                        <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
                    </Pressable>
                </View>
            </View>
        </RNModal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    buttonContainer: {
        position: 'absolute',
        bottom: 40,
        left: 20,
        right: 20,
    },
    cancelButton: {
        backgroundColor: 'rgba(255,255,255,0.3)',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    loadingContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    loadingText: {
        color: '#fff',
        fontSize: 16,
    },
});

async function checkCameraPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    return PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
}

async function requestCameraPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
            title: t('modals.cameraPermissionTitle'),
            message: t('modals.cameraPermissionMessage'),
            buttonPositive: t('common.allow'),
            buttonNegative: t('common.deny'),
        }
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
}

export function useConnectTerminal(options?: UseConnectTerminalOptions) {
    const auth = useAuth();
    const [isLoading, setIsLoading] = React.useState(false);
    const [showScanner, setShowScanner] = React.useState(false);

    const processAuthUrl = React.useCallback(async (url: string) => {
        if (!url.startsWith('happy://terminal?')) {
            Modal.alert(t('common.error'), t('modals.invalidAuthUrl'), [{ text: t('common.ok') }]);
            return false;
        }

        const tail = url.slice('happy://terminal?'.length);
        const searchParams = new URLSearchParams(tail);
        const keys = Array.from(searchParams.keys());
        const publicKey = keys.length > 0 ? decodeBase64(keys[0], 'base64url') : null;
        const qrServerUrl = searchParams.get('server');

        if (!publicKey) {
            Modal.alert(t('common.error'), t('modals.invalidAuthUrl'), [{ text: t('common.ok') }]);
            return false;
        }

        if (qrServerUrl) {
            const appServerUrl = getServerUrl();
            if (qrServerUrl !== appServerUrl) {
                Modal.alert(
                    t('common.error'),
                    t('modals.serverMismatch', {
                        cliServer: qrServerUrl,
                        appServer: appServerUrl,
                    }),
                    [{ text: t('common.ok') }]
                );
                return false;
            }
        }

        setIsLoading(true);
        try {
            const responseV1 = encryptBox(decodeBase64(auth.credentials!.secret, 'base64url'), publicKey);
            let responseV2Bundle = new Uint8Array(sync.encryption.contentDataKey.length + 1);
            responseV2Bundle[0] = 0;
            responseV2Bundle.set(sync.encryption.contentDataKey, 1);
            const responseV2 = encryptBox(responseV2Bundle, publicKey);
            await authApprove(auth.credentials!.token, publicKey, responseV1, responseV2);

            await new Promise(resolve => setTimeout(resolve, 3000));
            await sync.refreshMachines();

            Modal.alert(t('common.success'), t('modals.terminalConnectedSuccessfully'), [
                {
                    text: t('common.ok'),
                    onPress: () => options?.onSuccess?.()
                }
            ]);
            return true;
        } catch (e) {
            console.error(e);
            Modal.alert(t('common.error'), t('modals.failedToConnectTerminal'), [{ text: t('common.ok') }]);
            options?.onError?.(e);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [auth.credentials, options]);

    const connectTerminal = React.useCallback(async () => {
        const granted = await checkCameraPermission();
        if (granted) {
            setShowScanner(true);
        } else {
            const reqGranted = await requestCameraPermission();
            if (reqGranted) {
                setShowScanner(true);
            } else {
                Modal.alert(t('common.error'), t('modals.cameraPermissionsRequiredToConnectTerminal'), [{ text: t('common.ok') }]);
            }
        }
    }, []);

    const handleScanned = React.useCallback(async (data: string) => {
        setShowScanner(false);
        if (data.startsWith('happy://terminal?')) {
            await processAuthUrl(data);
        }
    }, [processAuthUrl]);

    const connectWithUrl = React.useCallback(async (url: string) => {
        return await processAuthUrl(url);
    }, [processAuthUrl]);

    return {
        connectTerminal,
        connectWithUrl,
        isLoading,
        processAuthUrl,
        showScanner,
        setShowScanner,
        QRScannerModal: () => (
            <QRScannerModal
                visible={showScanner}
                onScanned={handleScanned}
                onClose={() => setShowScanner(false)}
            />
        ),
    };
}

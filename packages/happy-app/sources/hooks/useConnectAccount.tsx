import * as React from 'react';
import { Modal as RNModal, View, StyleSheet, Pressable, Text, PermissionsAndroid, Platform } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { decodeBase64 } from '@/encryption/base64';
import { encryptBox } from '@/encryption/libsodium';
import { authAccountApprove } from '@/auth/authAccountApprove';
import { Modal } from '@/modal';
import { t } from '@/text';
import { sync } from '@/sync/sync';
import { Camera, useCameraDevices, useCodeScanner, type Code } from 'react-native-vision-camera';

interface UseConnectAccountOptions {
    onSuccess?: () => void;
    onError?: (error: any) => void;
}

// 扫码弹窗 - 使用 react-native-vision-camera
function QRScannerModal({
    visible,
    onScanned,
    onClose
}: {
    visible: boolean;
    onScanned: (data: string) => void;
    onClose: () => void;
}) {
    const devices = useCameraDevices();
    const cameraRef = React.useRef<Camera>(null);
    const [isActive, setIsActive] = React.useState(false);
    const [hasScanned, setHasScanned] = React.useState(false);

    const cameraDevice = React.useMemo(
        () => devices.find(d => d.position === 'back'),
        [devices]
    );

    React.useEffect(() => {
        if (visible && cameraDevice) {
            setIsActive(true);
            setHasScanned(false);
        } else {
            setIsActive(false);
        }
    }, [visible, cameraDevice]);

    const handleCodeScanned = React.useCallback((codes: Code[]) => {
        if (hasScanned) return;
        
        const data = codes[0]?.value;
        if (data) {
            console.log('[QRScanner] Scanned:', data);
            setHasScanned(true);
            setIsActive(false);
            onScanned(data);
        }
    }, [hasScanned, onScanned]);

    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned: handleCodeScanned,
    });

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

export function useConnectAccount(options?: UseConnectAccountOptions) {
    const auth = useAuth();
    const [isLoading, setIsLoading] = React.useState(false);
    const [showScanner, setShowScanner] = React.useState(false);

    const processAuthUrl = React.useCallback(async (url: string) => {
        if (!url.startsWith('happy:///account?')) {
            Modal.alert(t('common.error'), t('modals.invalidAuthUrl'), [{ text: t('common.ok') }]);
            return false;
        }

        const tail = url.slice('happy:///account?'.length);
        const publicKey = decodeBase64(tail, 'base64url');
        const response = encryptBox(decodeBase64(auth.credentials!.secret, 'base64url'), publicKey);
        await authAccountApprove(auth.credentials!.token, publicKey, response);

        await new Promise(resolve => setTimeout(resolve, 3000));
        await sync.refreshMachines();

        Modal.alert(t('common.success'), t('modals.deviceLinkedSuccessfully'), [
            {
                text: t('common.ok'),
                onPress: () => options?.onSuccess?.()
            }
        ]);
        return true;
    }, [auth.credentials, options]);

    const connectAccount = React.useCallback(async () => {
        const granted = await checkCameraPermission();
        if (granted) {
            setShowScanner(true);
        } else {
            const reqGranted = await requestCameraPermission();
            if (reqGranted) {
                setShowScanner(true);
            } else {
                Modal.alert(t('common.error'), t('modals.cameraPermissionsRequiredToScanQr'), [{ text: t('common.ok') }]);
            }
        }
    }, []);

    const handleScanned = React.useCallback(async (data: string) => {
        setShowScanner(false);
        if (data.startsWith('happy:///account?')) {
            await processAuthUrl(data);
        }
    }, [processAuthUrl]);

    const connectWithUrl = React.useCallback(async (url: string) => {
        return await processAuthUrl(url);
    }, [processAuthUrl]);

    return {
        connectAccount,
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

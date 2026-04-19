import * as React from 'react';
import { Modal as RNModal, View, StyleSheet, Pressable, Text } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { decodeBase64 } from '@/encryption/base64';
import { encryptBox } from '@/encryption/libsodium';
import { authAccountApprove } from '@/auth/authAccountApprove';
import { useCheckScannerPermissions } from '@/hooks/useCheckCameraPermissions';
import { Modal } from '@/modal';
import { t } from '@/text';
import { Camera, useCameraDevice } from 'react-native-vision-camera';

interface UseConnectAccountOptions {
    onSuccess?: () => void;
    onError?: (error: any) => void;
}

// 扫码弹窗 - 使用 react-native-vision-camera，不依赖 Google 服务
function QRScannerModal({
    visible,
    onScanned,
    onClose
}: {
    visible: boolean;
    onScanned: (data: string) => void;
    onClose: () => void;
}) {
    const device = useCameraDevice('back');
    const cameraRef = React.useRef<Camera>(null);
    const [isActive, setIsActive] = React.useState(false);

    const codeScanner = React.useMemo(() => ({
        formats: ['qr'] as const,
        onCodeScanned: (codes: any[]) => {
            const data = codes[0]?.value;
            if (data) {
                setIsActive(false);
                onScanned(data);
            }
        }
    }), [onScanned]);

    React.useEffect(() => {
        if (visible && device) {
            setIsActive(true);
        } else {
            setIsActive(false);
        }
    }, [visible, device]);

    if (!visible) return null;
    if (!device) return null;

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
                    device={device}
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
});

export function useConnectAccount(options?: UseConnectAccountOptions) {
    const auth = useAuth();
    const [isLoading, setIsLoading] = React.useState(false);
    const [showScanner, setShowScanner] = React.useState(false);
    const checkScannerPermissions = useCheckScannerPermissions();

    const processAuthUrl = React.useCallback(async (url: string) => {
        if (!url.startsWith('happy:///account?')) {
            Modal.alert(t('common.error'), t('modals.invalidAuthUrl'), [{ text: t('common.ok') }]);
            return false;
        }

        setIsLoading(true);
        try {
            const tail = url.slice('happy:///account?'.length);
            const publicKey = decodeBase64(tail, 'base64url');
            const response = encryptBox(decodeBase64(auth.credentials!.secret, 'base64url'), publicKey);
            await authAccountApprove(auth.credentials!.token, publicKey, response);

            Modal.alert(t('common.success'), t('modals.deviceLinkedSuccessfully'), [
                {
                    text: t('common.ok'),
                    onPress: () => options?.onSuccess?.()
                }
            ]);
            return true;
        } catch (e) {
            console.error(e);
            Modal.alert(t('common.error'), t('modals.failedToLinkDevice'), [{ text: t('common.ok') }]);
            options?.onError?.(e);
            return false;
        } finally {
            setIsLoading(false);
        }
    }, [auth.credentials, options]);

    const connectAccount = React.useCallback(async () => {
        if (await checkScannerPermissions()) {
            setShowScanner(true);
        } else {
            Modal.alert(t('common.error'), t('modals.cameraPermissionsRequiredToScanQr'), [{ text: t('common.ok') }]);
        }
    }, [checkScannerPermissions]);

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

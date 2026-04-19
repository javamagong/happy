import { useCameraPermission } from "react-native-vision-camera";
import { Platform } from "react-native";

export function useCheckScannerPermissions(): () => Promise<boolean> {
    const { hasPermission, requestPermission } = useCameraPermission();

    return async () => {
        if (hasPermission) {
            return true;
        }

        return await requestPermission();
    };
}
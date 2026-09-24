import * as LocalAuthentication from 'expo-local-authentication';
import { Platform } from 'react-native';

export interface BiometricCheckResult {
  available: boolean;
  hasHardware: boolean;
  isEnrolled: boolean;
  biometricType: 'fingerprint' | 'facial' | 'iris' | 'none';
  errorMessage?: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
}

class BiometricService {
  /**
   * Check if device supports biometrics and has enrolled fingerprint/face data
   */
  async checkBiometrics(): Promise<BiometricCheckResult> {
    if (Platform.OS === 'web') {
      return {
        available: false,
        hasHardware: false,
        isEnrolled: false,
        biometricType: 'none',
        errorMessage: 'Biometric authentication is not supported in the web browser preview.',
      };
    }

    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      if (!hasHardware) {
        return {
          available: false,
          hasHardware: false,
          isEnrolled: false,
          biometricType: 'none',
          errorMessage: 'This device does not have biometric hardware (fingerprint or face scanner).',
        };
      }

      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!isEnrolled) {
        return {
          available: false,
          hasHardware: true,
          isEnrolled: false,
          biometricType: 'none',
          errorMessage:
            'No biometrics registered on this device. Please set up fingerprint or face unlock in your device Settings first.',
        };
      }

      const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
      let biometricType: 'fingerprint' | 'facial' | 'iris' | 'none' = 'fingerprint';

      if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        biometricType = 'facial';
      } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        biometricType = 'fingerprint';
      } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.IRIS)) {
        biometricType = 'iris';
      }

      return {
        available: true,
        hasHardware: true,
        isEnrolled: true,
        biometricType,
      };
    } catch (err: any) {
      console.warn('[BiometricService] Error checking biometrics:', err);
      return {
        available: false,
        hasHardware: false,
        isEnrolled: false,
        biometricType: 'none',
        errorMessage: err?.message || 'Failed to detect biometric status on this device.',
      };
    }
  }

  /**
   * Prompt OS biometric scan dialog
   */
  async authenticate(promptMessage: string = 'Confirm fingerprint to unlock Regent Money'): Promise<AuthResult> {
    if (Platform.OS === 'web') {
      // In web browser preview, simulate unlock so user can test UI flows
      return { success: true };
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage,
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use Device PIN / Pattern',
        disableDeviceFallback: false,
      });

      if (result.success) {
        return { success: true };
      }

      return {
        success: false,
        error: result.error || 'Authentication cancelled or unsuccessful',
      };
    } catch (err: any) {
      console.warn('[BiometricService] Auth error:', err);
      return {
        success: false,
        error: err?.message || 'Biometric authentication failed',
      };
    }
  }

  /**
   * Cancel ongoing prompt if needed
   */
  async cancelAuthentication(): Promise<void> {
    try {
      if (Platform.OS === 'android') {
        await LocalAuthentication.cancelAuthenticate();
      }
    } catch {
      // Ignore cancellation errors
    }
  }
}

export const biometricService = new BiometricService();

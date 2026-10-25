import { PermissionsAndroid, Platform, NativeModules } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { mmkvStorage } from '../db/mmkv';

const PROMPTED_KEY = 'sms_permission_prompted_v1';
const GRANTED_KEY = 'sms_permission_granted_v1';
const SIM_MISMATCH_KEY = 'sms_tracking_disabled_sim_mismatch';

export const smsPermissionService = {
  /**
   * Has the user already been prompted for SMS permissions?
   */
  hasBeenPrompted(): boolean {
    if (Platform.OS !== 'android') return true;
    return mmkvStorage.getBoolean(PROMPTED_KEY) ?? false;
  },

  /**
   * Mark SMS permission as prompted
   */
  setPrompted(prompted = true): void {
    mmkvStorage.setBoolean(PROMPTED_KEY, prompted);
  },

  /**
   * Check if SMS tracking on this phone is disabled due to a SIM mismatch (e.g. Papa's phone)
   */
  isSmsTrackingDisabledOnDevice(): boolean {
    if (Platform.OS !== 'android') return false;
    return mmkvStorage.getBoolean(SIM_MISMATCH_KEY) ?? false;
  },

  /**
   * Reads 10-digit phone numbers detected from active SIM cards on this Android device (SIM 1, SIM 2)
   */
  async getDeviceSimPhoneNumbers(): Promise<string[]> {
    if (Platform.OS !== 'android') return [];
    try {
      const Sms = NativeModules.Sms;
      if (Sms && typeof Sms.getSimPhoneNumbers === 'function') {
        const jsonStr = await Sms.getSimPhoneNumbers();
        const parsed = JSON.parse(jsonStr || '[]');
        if (Array.isArray(parsed)) {
          return parsed.map((n: string) => String(n).replace(/\D/g, '').slice(-10)).filter(Boolean);
        }
      }
      return [];
    } catch (e) {
      console.warn('[smsPermissionService] Failed to read SIM numbers:', e);
      return [];
    }
  },

  /**
   * Verifies if the active SIM card on this device matches the registered user's phone number.
   * If a SIM phone number is detected and does NOT match the user's phone, disables SMS tracking on this device.
   */
  async checkDeviceSimMatchesUser(userPhone?: string | null): Promise<{ matches: boolean; reason?: 'mismatch' | 'no_sim_numbers'; detectedSims: string[] }> {
    if (Platform.OS !== 'android' || !userPhone) {
      return { matches: true, detectedSims: [] };
    }

    const cleanUser = userPhone.replace(/\D/g, '').slice(-10);
    if (!cleanUser || cleanUser.length < 10) {
      return { matches: true, detectedSims: [] };
    }

    try {
      const detectedSims = await this.getDeviceSimPhoneNumbers();

      // If active SIM card(s) reported phone numbers, verify against the user's registered phone
      if (detectedSims.length > 0) {
        const hasMatchingSim = detectedSims.some((simNum) => simNum.endsWith(cleanUser) || cleanUser.endsWith(simNum));

        if (!hasMatchingSim) {
          // MISMATCH: Account belongs to user A, but this phone has Papa's/someone else's SIM
          mmkvStorage.setBoolean(SIM_MISMATCH_KEY, true);
          try {
            NativeModules.NativeStorage?.setSmsTrackingDisabled?.(true);
          } catch {}
          return { matches: false, reason: 'mismatch', detectedSims };
        }
      }

      // SIM matches or telecom didn't expose line number: allow tracking
      mmkvStorage.setBoolean(SIM_MISMATCH_KEY, false);
      try {
        NativeModules.NativeStorage?.setSmsTrackingDisabled?.(false);
      } catch {}
      return { matches: true, detectedSims };
    } catch (e) {
      console.warn('[smsPermissionService] SIM match check error:', e);
      return { matches: true, detectedSims: [] };
    }
  },

  /**
   * Check if both RECEIVE_SMS and READ_SMS are already granted
   */
  async isPermissionGranted(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      const receive = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS
      );
      const read = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_SMS
      );
      const granted = receive && read;
      mmkvStorage.setBoolean(GRANTED_KEY, granted);
      return granted;
    } catch (e) {
      return false;
    }
  },

  /**
   * Request native runtime SMS permissions
   */
  async requestSmsPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    try {
      this.setPrompted(true);
      const permsToRequest = [
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      ];

      // Optionally request READ_PHONE_NUMBERS if available
      if ((PermissionsAndroid.PERMISSIONS as any).READ_PHONE_NUMBERS) {
        permsToRequest.push((PermissionsAndroid.PERMISSIONS as any).READ_PHONE_NUMBERS);
      }

      const results = await PermissionsAndroid.requestMultiple(permsToRequest);

      const receiveGranted =
        results['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED;
      const readGranted =
        results['android.permission.READ_SMS'] === PermissionsAndroid.RESULTS.GRANTED;

      const allGranted = receiveGranted && readGranted;
      mmkvStorage.setBoolean(GRANTED_KEY, allGranted);
      return allGranted;
    } catch (e) {
      console.warn('[smsPermissionService] Permission request failed:', e);
      return false;
    }
  },

  /**
   * Opens Battery Optimization Settings so user can optionally allow background execution without restricted permissions
   */
  async requestBatteryOptimizationExemption(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
      );
    } catch (e) {
      // Fallback silently if manufacturer disables direct action
    }
  },
};

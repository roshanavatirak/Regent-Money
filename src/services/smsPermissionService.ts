import { PermissionsAndroid, Platform, Linking, Alert } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { mmkvStorage } from '../db/mmkv';

const PROMPTED_KEY = 'sms_permission_prompted_v1';
const GRANTED_KEY = 'sms_permission_granted_v1';

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
      const results = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      ]);

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
   * Request Battery Optimization exemption so the OS does not kill or delay SMS background tasks
   */
  async requestBatteryOptimizationExemption(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      await IntentLauncher.startActivityAsync(
        IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
        { data: 'package:com.anonymous.regentmoney' }
      );
    } catch (e) {
      try {
        await IntentLauncher.startActivityAsync(
          IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
        );
      } catch (err) {
        // Fallback silently if manufacturer disables direct action
      }
    }
  },
};

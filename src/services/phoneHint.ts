import { NativeModules, Platform } from 'react-native';
import { toIndianMobile } from '../utils/indianMobile';

/**
 * Shows Google's "Choose a phone number" sheet (Android only) and returns the picked number
 * as 10 digits, or null when there is nothing to fill: iOS or web, an app build without the
 * native module, no number on the SIM, or the sheet was closed.
 */
export async function requestPhoneHint(): Promise<string | null> {
  if (Platform.OS !== 'android') return null;
  const mod = NativeModules.PhoneHint;
  if (!mod?.request) return null;
  try {
    return toIndianMobile(await mod.request());
  } catch {
    return null;
  }
}

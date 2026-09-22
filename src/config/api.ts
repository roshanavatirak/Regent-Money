import { Platform } from 'react-native';

/**
 * Returns the appropriate backend URL based on the runtime platform.
 * - On Web (Chrome/Edge): uses localhost:3000 (or window.location host) because 10.0.2.2 is unreachable from browsers.
 * - On Native/Android: uses EXPO_PUBLIC_BACKEND_URL or falls back to http://10.0.2.2:3000
 */
export const getBackendUrl = (): string => {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    return 'http://localhost:3000';
  }
  return process.env.EXPO_PUBLIC_BACKEND_URL || 'http://10.0.2.2:3000';
};

export const BACKEND_URL = getBackendUrl();

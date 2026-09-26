import { Platform } from 'react-native';

const PRODUCTION_RENDER_URL = 'https://regent-money.onrender.com';

/**
 * Automatically chooses the appropriate backend URL:
 * - Production Release APK (!__DEV__): Always connects to Render (https://regent-money.onrender.com)
 * - Local Development (__DEV__): Connects to your local backend (localhost / 10.0.2.2)
 */
export const getBackendUrl = (): string => {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();

  // In Production Release APK: Always use Render URL
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('10.0.2.2')) {
      return envUrl.replace(/\/+$/, '');
    }
    return PRODUCTION_RENDER_URL;
  }

  // In Web Browser: NEVER use 10.0.2.2 (10.0.2.2 is Android emulator only)
  if (Platform.OS === 'web') {
    if (envUrl && !envUrl.includes('10.0.2.2')) {
      return envUrl.replace(/\/+$/, '');
    }
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      return `${window.location.protocol}//${window.location.hostname}:3000`;
    }
    return 'http://localhost:3000';
  }

  // In Native (Android / iOS):
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }

  // Android emulator loopback to host machine
  return 'http://10.0.2.2:3000';
};

export const BACKEND_URL = {
  toString: () => getBackendUrl(),
  valueOf: () => getBackendUrl(),
} as unknown as string;

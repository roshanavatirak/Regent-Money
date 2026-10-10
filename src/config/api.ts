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

  // In Web Browser: match the browser's current hostname (localhost, 127.0.0.1, or LAN IP)
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.location && window.location.hostname) {
      const port = (envUrl && envUrl.match(/:(\d+)/)?.[1]) || '3000';
      return `${window.location.protocol}//${window.location.hostname}:${port}`;
    }
    if (envUrl && !envUrl.includes('10.0.2.2')) {
      return envUrl.replace(/\/+$/, '');
    }
    return 'http://localhost:3000';
  }

  // In Native (Android / iOS):
  if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('10.0.2.2')) {
    return envUrl.replace(/\/+$/, '');
  }

  // On native device, localhost is unreachable; fallback to live Render backend
  return PRODUCTION_RENDER_URL;
};

export const BACKEND_URL = {
  toString: () => getBackendUrl(),
  valueOf: () => getBackendUrl(),
} as unknown as string;

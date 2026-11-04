import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let storage: any;
let isNativeMMKV = false;
const fallbackMap = new Map<string, string>();

if (Platform.OS === 'web') {
  storage = {
    set: (key: string, value: any) => localStorage.setItem(key, String(value)),
    getString: (key: string) => localStorage.getItem(key) || undefined,
    getNumber: (key: string) => {
      const val = localStorage.getItem(key);
      return val ? Number(val) : undefined;
    },
    getBoolean: (key: string) => {
      const val = localStorage.getItem(key);
      return val === 'true' ? true : val === 'false' ? false : undefined;
    },
    delete: (key: string) => localStorage.removeItem(key),
    clearAll: () => localStorage.clear(),
  };
} else {
  try {
    const MMKVModule = require('react-native-mmkv');
    const createMMKV = MMKVModule?.createMMKV;
    const MMKVClass = MMKVModule?.MMKV;

    // 64-hex-char key generated and wrapped by the hardware Keystore. Null when the Keystore
    // could not unwrap it this launch: we then stay in memory rather than write plaintext.
    const nativeKey =
      NativeModules?.NativeStorage?.getConstants?.()?.MMKV_KEY ||
      NativeModules?.NativeStorage?.MMKV_KEY;
    const hasNativeKey = typeof nativeKey === 'string' && nativeKey.length >= 32;

    // Builds before 1.0.57 used the first 16 chars as an AES-128 key (64 bits of entropy).
    // Stores are upgraded once to AES-256 with 32 chars (128 bits); the format marker lives
    // in a separate unencrypted instance because it must be read before the store is opened.
    const legacyKey = hasNativeKey ? nativeKey.slice(0, 16) : '';
    const strongKey = hasNativeKey ? nativeKey.slice(0, 32) : '';
    const KEY_FORMAT_MARKER = 'settings_key_format';
    const KEY_FORMAT_AES256 = 'aes256-v2';

    if (hasNativeKey && typeof createMMKV === 'function') {
      try {
        const meta = createMMKV({ id: 'regent-money-meta' });
        if (meta.getString(KEY_FORMAT_MARKER) === KEY_FORMAT_AES256) {
          storage = createMMKV({ id: 'regent-money-settings', encryptionKey: strongKey, encryptionType: 'AES-256' });
        } else {
          storage = createMMKV({ id: 'regent-money-settings', encryptionKey: legacyKey });
          try {
            storage.encrypt(strongKey, 'AES-256');
            meta.set(KEY_FORMAT_MARKER, KEY_FORMAT_AES256);
          } catch (err: any) {
            console.warn('[MMKV] AES-256 upgrade deferred:', err?.message || err);
          }
        }
      } catch (err: any) {
        console.warn('[MMKV] Encrypted storage unavailable this launch:', err?.message || err);
        storage = undefined;
      }
    } else if (hasNativeKey && typeof MMKVClass === 'function') {
      try {
        storage = new MMKVClass({ id: 'regent-money-settings', encryptionKey: legacyKey });
      } catch {
        storage = undefined;
      }
    }

    if (storage) {
      isNativeMMKV = true;
      console.log('[MMKV] Initialized hardware-backed native MMKV storage.');
    }
  } catch (e: any) {
    console.warn('[MMKV] Native module unavailable, using memory/AsyncStorage fallback:', e?.message || e);
  }

  if (!storage) {
    console.warn('[SessionStorage] Native MMKV unavailable. Using secure volatile in-memory session cache (zero plaintext disk writes).');
    storage = {
      set: (key: string, value: any) => {
        fallbackMap.set(key, String(value));
      },
      getString: (key: string) => fallbackMap.get(key),
      getNumber: (key: string) => {
        const val = fallbackMap.get(key);
        return val ? Number(val) : undefined;
      },
      getBoolean: (key: string) => {
        const val = fallbackMap.get(key);
        return val === 'true' ? true : val === 'false' ? false : undefined;
      },
      delete: (key: string) => {
        fallbackMap.delete(key);
      },
      remove: (key: string) => {
        fallbackMap.delete(key);
      },
      clearAll: () => {
        fallbackMap.clear();
      },
      getAllKeys: () => Array.from(fallbackMap.keys()),
    };
  }
}

export const mmkvStorage = {
  isNative: (): boolean => isNativeMMKV,
  getAllKeys: (): string[] => {
    if (!storage) return [];
    if (typeof storage.getAllKeys === 'function') {
      return storage.getAllKeys();
    }
    return Array.from(fallbackMap.keys());
  },
  initialize: async (): Promise<void> => {
    // Non-destructive initialization: no plain-text AsyncStorage writes or destructive clears
    return;
  },
  setString: (key: string, value: string) => {
    storage.set(key, value);
  },
  getString: (key: string): string | undefined => {
    return storage.getString(key);
  },
  setNumber: (key: string, value: number) => {
    storage.set(key, value);
  },
  getNumber: (key: string): number | undefined => {
    return storage.getNumber(key);
  },
  setBoolean: (key: string, value: boolean) => {
    storage.set(key, value);
  },
  getBoolean: (key: string): boolean | undefined => {
    return storage.getBoolean(key);
  },
  setObject: (key: string, value: object) => {
    storage.set(key, JSON.stringify(value));
  },
  getObject: <T>(key: string): T | null => {
    const data = storage.getString(key);
    if (!data) return null;
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  },
  delete: (key: string) => {
    if (!storage) return;
    if (typeof storage.delete === 'function') {
      storage.delete(key);
    } else if (typeof storage.remove === 'function') {
      storage.remove(key);
    }
  },
  clearAll: () => {
    storage.clearAll();
  },
};

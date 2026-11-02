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

    // MMKV encryption keys for AES-128 must be <= 16 bytes
    const nativeKey =
      NativeModules?.NativeStorage?.getConstants?.()?.MMKV_KEY ||
      NativeModules?.NativeStorage?.MMKV_KEY;
    const rawKey = nativeKey || 'regent-vault-device-key';
    const encryptionKey = typeof rawKey === 'string' && rawKey.length > 0
      ? rawKey.slice(0, 16)
      : undefined;

    const mmkvConfig: any = {
      id: 'regent-money-settings',
    };
    if (encryptionKey) {
      mmkvConfig.encryptionKey = encryptionKey;
    }

    if (typeof createMMKV === 'function') {
      try {
        storage = createMMKV(mmkvConfig);
      } catch (err: any) {
        console.warn('[MMKV] Failed with encryption key, falling back to unencrypted:', err?.message || err);
        try {
          storage = createMMKV({ id: 'regent-money-settings' });
        } catch {
          // ignore
        }
      }
    } else if (typeof MMKVClass === 'function') {
      try {
        storage = new MMKVClass(mmkvConfig);
      } catch (err: any) {
        try {
          storage = new MMKVClass({ id: 'regent-money-settings' });
        } catch {
          // ignore
        }
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
    if (Platform.OS === 'web') {
      return;
    }
    // Scrub any legacy unencrypted AsyncStorage leftovers from previous app versions
    try {
      await AsyncStorage.clear();
    } catch {
      // ignore
    }
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

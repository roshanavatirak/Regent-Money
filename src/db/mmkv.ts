import { Platform } from 'react-native';

let storage: any;

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
    const { MMKV } = require('react-native-mmkv');
    storage = new MMKV({
      id: 'regent-money-settings',
      encryptionKey: 'bank-level-mmkv-encryption-key-for-local-cache', // Encrypted locally
    });
    console.log('[MMKV] Initialized native MMKV storage.');
  } catch (e: any) {
    // react-native-mmkv is not compiled in the current client build; using memory storage fallback
  }

  if (!storage) {
    console.log('[SessionStorage] Session cache initialized.');
    const fallbackMap = new Map<string, string>();
    storage = {
      set: (key: string, value: any) => fallbackMap.set(key, String(value)),
      getString: (key: string) => fallbackMap.get(key),
      getNumber: (key: string) => {
        const val = fallbackMap.get(key);
        return val ? Number(val) : undefined;
      },
      getBoolean: (key: string) => {
        const val = fallbackMap.get(key);
        return val === 'true' ? true : val === 'false' ? false : undefined;
      },
      delete: (key: string) => fallbackMap.delete(key),
      clearAll: () => fallbackMap.clear(),
    };
  }
}

export const mmkvStorage = {
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
    storage.delete(key);
  },
  clearAll: () => {
    storage.clearAll();
  },
};

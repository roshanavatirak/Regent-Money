import { create } from 'zustand';
import { getBackendUrl } from '../config/api';
import { mmkvStorage } from '../db/mmkv';
import { ContactInfo, DEFAULT_CONTACT_INFO, parseContactInfo } from '../constants/contactInfo';

const CACHE_KEY = 'app_contact_info_v1';

function readCache(): ContactInfo {
  try {
    const raw = mmkvStorage.getString(CACHE_KEY);
    return raw ? parseContactInfo(JSON.parse(raw)) : DEFAULT_CONTACT_INFO;
  } catch {
    return DEFAULT_CONTACT_INFO;
  }
}

/**
 * Contact addresses and legal links, kept current from GET /app/contact.
 * Starts from the last saved copy (or the built-in defaults), so screens never wait or go blank.
 */
export const useContactInfo = create<ContactInfo>(() => readCache());

let refreshing: Promise<void> | null = null;

/** Fetches the latest addresses once per call (concurrent calls share one request). Never throws. */
export function refreshContactInfo(): Promise<void> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${getBackendUrl()}/app/contact`, { headers: { accept: 'application/json' } });
      if (!res.ok) return;
      const info = parseContactInfo(await res.json());
      useContactInfo.setState(info, true);
      try {
        mmkvStorage.setString(CACHE_KEY, JSON.stringify(info));
      } catch {
        // storage unavailable this launch: the in-memory copy still works
      }
    } catch {
      // offline or server asleep: keep the saved copy
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

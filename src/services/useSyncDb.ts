import { useCallback } from 'react';
import { syncService } from './syncService';

export const useSyncDb = () => {
  const sync = useCallback(async () => {
    try {
      await syncService.sync();
    } catch (error) {
      console.warn('[useSyncDb] Offline sync notice:', error);
    }
  }, []);

  /** For focus effects: skips when the data is under a minute old. */
  const syncIfStale = useCallback(async () => {
    try {
      await syncService.syncIfStale();
    } catch (error) {
      console.warn('[useSyncDb] Offline sync notice:', error);
    }
  }, []);

  return { sync, syncIfStale };
};

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

  return { sync };
};

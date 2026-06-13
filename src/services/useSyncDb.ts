import { useCallback } from 'react';
import { syncService } from './syncService';

export const useSyncDb = () => {
  const sync = useCallback(async () => {
    try {
      await syncService.sync();
    } catch (error) {
      console.error('Error in useSyncDb wrapper calling syncService:', error);
    }
  }, []);

  return { sync };
};

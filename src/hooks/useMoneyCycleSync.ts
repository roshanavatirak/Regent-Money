import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store';
import { useMoneyCycleStore, type MoneyCycleData } from '../store/moneyCycleStore';
import { authService } from '../services/authService';

/**
 * Keeps yearly costs and "Salary received" marks in step with the profile on the server:
 * takes the server copy when it is newer, and sends this phone's copy after it changes.
 * Mount once while signed in (Home does).
 */
export function useMoneyCycleSync(): void {
  const serverData = useAuthStore((s) => s.user?.moneyCycleData) as MoneyCycleData | null | undefined;
  const signedIn = useAuthStore((s) => !!s.user);
  const updatedAt = useMoneyCycleStore((s) => s.updatedAt);
  const sentAt = useRef(0);

  // Server copy newer (another phone, or a reinstall): take it.
  useEffect(() => {
    if (serverData) useMoneyCycleStore.getState().hydrate(serverData);
  }, [serverData]);

  // This phone changed it: send it (a short wait folds several quick edits into one request).
  useEffect(() => {
    if (!signedIn || !updatedAt) return;
    if (serverData && serverData.updatedAt >= updatedAt) return;
    if (sentAt.current === updatedAt) return;
    const id = setTimeout(() => {
      const { yearlyCosts, salaryMarks, updatedAt: at } = useMoneyCycleStore.getState();
      sentAt.current = at;
      authService.updateProfile({ moneyCycleData: { yearlyCosts, salaryMarks, updatedAt: at } }).catch(() => {
        sentAt.current = 0; // try again on the next change or launch
      });
    }, 1500);
    return () => clearTimeout(id);
  }, [signedIn, updatedAt, serverData]);
}

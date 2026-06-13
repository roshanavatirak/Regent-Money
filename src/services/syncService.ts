import { 
  useAuthStore, 
  useTransactionStore, 
  useBudgetStore, 
  useGoalsStore, 
  useBankStore 
} from '../store';
import { authService } from './authService';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

export const syncService = {
  /**
   * Fetches all financial data directly from NestJS and updates the in-memory Zustand stores.
   */
  async sync(): Promise<void> {
    const user = useAuthStore.getState().user;
    if (!user) {
      console.warn('[Sync] No user session found. Skipping synchronization.');
      return;
    }

    const token = authService.getAccessToken();
    if (!token) {
      console.warn('[Sync] No auth token found. Skipping synchronization.');
      return;
    }

    console.log('[Sync] Starting direct NestJS sync for user:', user.email || user.phone);

    try {
      useTransactionStore.getState().setLoading(true);

      const response = await fetch(`${BACKEND_URL}/sync`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Sync API returned status ${response.status}`);
      }

      const data = await response.json();

      // 1. Map Transactions
      const sortedTxs = [...(data.transactions || [])].sort((a: any, b: any) => b.timestamp - a.timestamp);
      const mappedTxs = sortedTxs.map((t: any) => ({
        id: t.id,
        amount: parseFloat(t.amount || 0),
        category: t.category,
        merchant: t.merchant,
        timestamp: Number(t.timestamp || 0),
        bankProfileId: t.bankProfileId ?? t.bank_profile_id,
        smsId: t.smsId ?? t.sms_id,
        isAnomaly: t.isAnomaly ?? t.is_anomaly,
        status: t.status,
      }));
      useTransactionStore.getState().setTransactions(mappedTxs);

      // 2. Map Budgets
      const mappedBudgets = (data.budgets || []).map((b: any) => ({
        id: b.id,
        category: b.category,
        limitAmount: parseFloat(b.limitAmount ?? b.limit_amount ?? 0),
        spentAmount: parseFloat(b.spentAmount ?? b.spent_amount ?? 0),
        period: b.period,
      }));
      useBudgetStore.getState().setBudgets(mappedBudgets);

      // 3. Map Goals
      const mappedGoals = (data.goals || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        targetAmount: parseFloat(g.targetAmount ?? g.target_amount ?? 0),
        currentAmount: parseFloat(g.currentAmount ?? g.current_amount ?? 0),
        targetDate: Number(g.targetDate ?? g.target_date ?? 0),
        status: g.status,
      }));
      useGoalsStore.getState().setGoals(mappedGoals);

      // 4. Map Bank Profiles
      const mappedBanks = (data.bankProfiles || []).map((b: any) => ({
        id: b.id,
        bankName: b.bankName ?? b.bank_name,
        accountNumberSuffix: b.accountNumberSuffix ?? b.account_number_suffix,
        currentBalance: parseFloat(b.currentBalance ?? b.current_balance ?? 0),
        lastSyncTimestamp: Number(b.lastSyncTimestamp ?? b.last_sync_timestamp ?? 0),
      }));
      useBankStore.getState().setBankProfiles(mappedBanks);

      console.log('[Sync] NestJS sync finished successfully.');
    } catch (err) {
      console.error('[Sync] Error during database synchronization:', err);
      throw err;
    } finally {
      useTransactionStore.getState().setLoading(false);
    }
  },
};

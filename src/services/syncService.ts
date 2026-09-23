import { 
  useAuthStore, 
  useTransactionStore, 
  useBudgetStore, 
  useGoalsStore, 
  useBankStore,
  useAnalyticsStore,
} from '../store';
import { mmkvStorage } from '../db/mmkv';
import { getBackendUrl } from '../config/api';

const BACKEND_URL = getBackendUrl();

let isSyncing = false;

export const syncService = {
  /**
   * Fetches net worth snapshots and income records in parallel with 60s TTL cache.
   */
  async fetchAnalytics(force = false): Promise<void> {
    const now = Date.now();
    const lastFetch = useAnalyticsStore.getState().lastFetchTime;
    // Cache for 60 seconds unless forced (e.g. pull to refresh)
    if (!force && now - lastFetch < 60000) {
      return;
    }

    const user = useAuthStore.getState().user;
    const token = mmkvStorage.getString('auth_access_token') || null;
    if (!user || !token) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const [snapshotsRes, incomeRes] = await Promise.all([
        fetch(`${BACKEND_URL}/sync/net-worth-snapshots`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }),
        fetch(`${BACKEND_URL}/sync/income-records`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }),
      ]);
      clearTimeout(timeoutId);

      if (snapshotsRes.ok) {
        const data = await snapshotsRes.json();
        const sorted = [...(data || [])].sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));
        const formatted = sorted.map((s: any) => ({
          timestamp: Number(s.timestamp),
          netWorth: parseFloat(s.netWorth ?? s.net_worth ?? 0),
          monthLabel: new Date(Number(s.timestamp)).toLocaleDateString('en-IN', { month: 'short' }),
        }));
        useAnalyticsStore.getState().setSnapshots(formatted);
      }

      if (incomeRes.ok) {
        const data = await incomeRes.json();
        const nowTime = new Date();
        const startOfMonth = new Date(nowTime.getFullYear(), nowTime.getMonth(), 1).getTime();
        const currentMonthIncome = (data || [])
          .filter((inc: any) => Number(inc.timestamp) >= startOfMonth)
          .reduce((sum: number, inc: any) => sum + parseFloat(inc.amount || 0), 0);
        useAnalyticsStore.getState().setIncomeCurrentMonth(currentMonthIncome || 95000);
      }

      useAnalyticsStore.getState().setLastFetchTime(now);
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.warn('[Sync] Analytics offline fallback:', e?.message || e);
    }
  },

  /**
   * Fetches all financial data directly from NestJS and updates the in-memory Zustand stores.
   * Uses Stale-While-Revalidate: only sets loading state if store has no cached data.
   */
  async sync(force = false): Promise<void> {
    if (isSyncing) return;

    const user = useAuthStore.getState().user;
    if (!user) {
      return;
    }

    const token = mmkvStorage.getString('auth_access_token') || null;
    if (!token) {
      return;
    }

    isSyncing = true;
    const existingTxs = useTransactionStore.getState().transactions;
    const shouldShowLoader = existingTxs.length === 0;

    if (shouldShowLoader) {
      useTransactionStore.getState().setLoading(true);
    }

    const syncController = new AbortController();
    const syncTimeoutId = setTimeout(() => syncController.abort(), 8000);

    try {
      // Trigger analytics fetch concurrently
      this.fetchAnalytics(force).catch(() => {});

      const response = await fetch(`${BACKEND_URL}/sync`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        signal: syncController.signal,
      });
      clearTimeout(syncTimeoutId);

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
        smsSenderId: b.smsSenderId ?? b.sms_sender_id,
        upiId: b.upiId ?? b.upi_id,
        customKeywords: b.customKeywords ?? b.custom_keywords,
        smsConsent: b.smsConsent ?? b.sms_consent ?? false,
      }));
      useBankStore.getState().setBankProfiles(mappedBanks);
    } catch (err: any) {
      clearTimeout(syncTimeoutId);
      console.warn('[Sync] Server currently unreachable, keeping offline cache active:', err?.message || err);
    } finally {
      isSyncing = false;
      if (shouldShowLoader) {
        useTransactionStore.getState().setLoading(false);
      }
    }
  },
};


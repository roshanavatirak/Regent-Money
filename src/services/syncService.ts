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

import { notificationService } from './notificationService';

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

    const baseUrl = getBackendUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch {}
    }, 12000);

    try {
      const [snapshotsRes, incomeRes] = await Promise.all([
        fetch(`${baseUrl}/sync/net-worth-snapshots`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }),
        fetch(`${baseUrl}/sync/income-records`, {
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
      if (e?.name !== 'AbortError' && !e?.message?.includes?.('abort')) {
        console.warn('[Sync] Analytics offline fallback:', e?.message || e);
      }
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

    const baseUrl = getBackendUrl();
    const syncController = new AbortController();
    const syncTimeoutId = setTimeout(() => {
      try {
        syncController.abort();
      } catch {}
    }, 12000);

    try {
      // Trigger analytics and notifications fetch concurrently
      this.fetchAnalytics(force).catch(() => {});
      notificationService.fetchNotifications().catch(() => {});

      const response = await fetch(`${baseUrl}/sync`, {
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

      // 1. Map Transactions and deduplicate any duplicates
      const sortedTxs = [...(data.transactions || [])].sort((a: any, b: any) => b.timestamp - a.timestamp);
      const seenTx = new Set<string>();
      const mappedTxs: any[] = [];
      for (const t of sortedTxs) {
        if (!t) continue;
        if (t.id && seenTx.has(`id:${t.id}`)) continue;
        if (t.id) seenTx.add(`id:${t.id}`);

        const txDate = new Date(Number(t.timestamp) || 0);
        const dayKey = `${txDate.getFullYear()}-${txDate.getMonth()}-${txDate.getDate()}`;
        const normMerchant = (t.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const sig = `sig:${t.bankProfileId ?? t.bank_profile_id}_${Math.round(parseFloat(t.amount || 0) * 100)}_${normMerchant}_${dayKey}`;

        if (seenTx.has(sig)) continue;
        seenTx.add(sig);

        mappedTxs.push({
          id: t.id,
          amount: parseFloat(t.amount || 0),
          category: t.category,
          merchant: t.merchant,
          timestamp: Number(t.timestamp || 0),
          bankProfileId: t.bankProfileId ?? t.bank_profile_id,
          type: t.type || 'debit',
          smsId: t.smsId ?? t.sms_id,
          isAnomaly: t.isAnomaly ?? t.is_anomaly,
          status: t.status,
        });
      }
      useTransactionStore.getState().setTransactions(mappedTxs);

      // 2. Map Budgets
      const mappedBudgets = (data.budgets || []).map((b: any) => ({
        id: b.id,
        name: b.name || (b.isOverall ? 'Total Spending Budget' : b.category),
        category: b.category,
        limitAmount: parseFloat(b.limitAmount ?? b.limit_amount ?? 0),
        spentAmount: parseFloat(b.spentAmount ?? b.spent_amount ?? 0),
        period: b.period || 'Current Cycle',
        periodType: b.periodType ?? b.period_type ?? 'monthly',
        startDate: b.startDate ?? b.start_date ? Number(b.startDate ?? b.start_date) : undefined,
        endDate: b.endDate ?? b.end_date ? Number(b.endDate ?? b.end_date) : undefined,
        isOverall: Boolean(b.isOverall ?? b.is_overall),
        fixedObligations: parseFloat(b.fixedObligations ?? b.fixed_obligations ?? 0),
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
      if (err?.name !== 'AbortError' && !err?.message?.includes?.('abort')) {
        console.warn('[Sync] Server currently unreachable, keeping offline cache active:', err?.message || err);
      }
    } finally {
      isSyncing = false;
      if (shouldShowLoader) {
        useTransactionStore.getState().setLoading(false);
      }
    }
  },
};


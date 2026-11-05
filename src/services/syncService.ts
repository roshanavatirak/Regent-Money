import {
  useAuthStore,
  useTransactionStore,
  useBudgetStore,
  useGoalsStore,
  useBankStore,
  useAnalyticsStore,
  useIncomeStore,
  useSyncStatusStore,
  parseDebitCardSuffixes,
} from '../store';
import { mmkvStorage } from '../db/mmkv';
import { getBackendUrl } from '../config/api';
import { notificationService } from './notificationService';
import { tokenStore } from './tokenStore';
import { apiFetch } from './apiClient';
import { outbox, isOutboxEnabled } from '../db/outbox';

const BACKEND_URL = getBackendUrl();

let isSyncing = false;
let isFlushingOutbox = false;

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
    const token = tokenStore.getAccessToken();
    if (!user || !token || user.role === 'admin' || user.role === 'superadmin') return;

    const baseUrl = getBackendUrl();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      try {
        controller.abort();
      } catch { }
    }, 12000);

    try {
      const [snapshotsRes, incomeRes] = await Promise.all([
        apiFetch('/sync/net-worth-snapshots', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }),
        apiFetch('/sync/income-records', {
          method: 'GET',
          headers: {
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
          .filter((inc: any) => {
            if ((inc as any).isDeleted) return false;
            if (inc.amount === 95000 && /^income_\d+_/.test(inc.id)) return false;
            return Number(inc.timestamp) >= startOfMonth;
          })
          .reduce((sum: number, inc: any) => sum + parseFloat(inc.amount || 0), 0);
        useAnalyticsStore.getState().setIncomeCurrentMonth(currentMonthIncome ?? 0);
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
   * Flushes pending offline outbox operations to the backend before pulling new state.
   * Serialized with single-flight mutex to prevent concurrent flush interleaving.
   */
  async flushOutbox(): Promise<void> {
    if (!isOutboxEnabled() || isFlushingOutbox) return;

    const user = useAuthStore.getState().user;
    const token = tokenStore.getAccessToken();
    if (!user || !token || user.role === 'admin' || user.role === 'superadmin') return;

    const pending = outbox.listPending(user.id, 100);
    if (pending.length === 0) return;

    isFlushingOutbox = true;
    try {
      const response = await apiFetch('/sync/outbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ops: pending.map((p) => p.op) }),
      });

      if (!response.ok) {
        // HTTP-level network/server error: back off all ops in this batch
        for (const item of pending) {
          outbox.markFailed(item.key, item.op);
        }
        return;
      }

      const data = await response.json();
      const results: {
        idemKey: string;
        status: 'applied' | 'duplicate' | 'rejected' | 'retry';
        reason?: string;
      }[] = data?.results || [];

      const resultMap = new Map(results.map((r) => [r.idemKey, r]));

      for (const item of pending) {
        const r = resultMap.get(item.op.idemKey);
        if (!r) {
          outbox.markFailed(item.key, item.op);
          continue;
        }

        if (r.status === 'applied' || r.status === 'duplicate') {
          outbox.removeOp(item.key);
        } else if (r.status === 'rejected') {
          outbox.moveToDead(item.key, item.op, r.reason || 'rejected');
        } else if (r.status === 'retry') {
          outbox.markFailed(item.key, item.op);
        }
      }
    } catch {
      for (const item of pending) {
        outbox.markFailed(item.key, item.op);
      }
    } finally {
      isFlushingOutbox = false;
    }
  },

  /**
   * Fetches all financial data directly from NestJS and updates the in-memory Zustand stores.
   * Uses Stale-While-Revalidate: only sets loading state if store has no cached data.
   */
  async sync(force = false): Promise<void> {
    if (isSyncing) return;

    const user = useAuthStore.getState().user;
    if (!user || user.role === 'admin' || user.role === 'superadmin') {
      return;
    }

    const token = tokenStore.getAccessToken();
    if (!token) {
      return;
    }

    // 1. Drain offline outbox changes before pulling latest state
    await this.flushOutbox().catch(() => {});

    isSyncing = true;
    useSyncStatusStore.getState().setSyncStatus('loading', null);
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
      } catch { }
    }, 12000);

    try {
      // Trigger analytics and notifications fetch concurrently
      this.fetchAnalytics(force).catch(() => { });
      notificationService.fetchNotifications().catch(() => { });

      const response = await apiFetch('/sync', {
        method: 'GET',
        headers: {
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
        if (t.id) {
          if (seenTx.has(`id:${t.id}`)) continue;
          seenTx.add(`id:${t.id}`);
        }

        const smsIdStr = String(t.smsId ?? t.sms_id ?? '');
        const isUserConfirmed = smsIdStr.startsWith('user_confirmed');

        // Only apply signature-based deduplication for draft items without a database ID
        if (!isUserConfirmed && !t.id) {
          const txDate = new Date(Number(t.timestamp) || 0);
          const dayKey = `${txDate.getFullYear()}-${txDate.getMonth()}-${txDate.getDate()}`;
          const normMerchant = (t.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          const hasTime = txDate.getHours() !== 12 || txDate.getMinutes() !== 0 || txDate.getSeconds() !== 0;
          const timeKey = hasTime ? `${txDate.getHours()}:${txDate.getMinutes()}` : 'default';
          const sig = `sig:${t.bankProfileId ?? t.bank_profile_id}_${Math.round(parseFloat(t.amount || 0) * 100)}_${normMerchant}_${dayKey}_${timeKey}`;

          if (seenTx.has(sig)) continue;
          seenTx.add(sig);
        }

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

      // Preserve local pending offline transactions not yet reflected on the server
      const pendingIds = outbox.pendingEntityIds(user.id);
      const serverTxIds = new Set(mappedTxs.map((t) => t.id).filter(Boolean));
      const localPendingTxs = existingTxs.filter(
        (t) => t && t.id && pendingIds.has(t.id) && !serverTxIds.has(t.id),
      );
      const finalTxs = [...localPendingTxs, ...mappedTxs].sort(
        (a, b) => Number(b.timestamp) - Number(a.timestamp),
      );
      useTransactionStore.getState().setTransactions(finalTxs);

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
      if (Array.isArray(data.excludedTransactionIds)) {
        useBudgetStore.getState().setExcludedTransactionIds(data.excludedTransactionIds);
      }

      // 3. Map Goals
      const mappedGoals = (data.goals || []).map((g: any) => ({
        id: g.id,
        name: g.name,
        targetAmount: parseFloat(g.targetAmount ?? g.target_amount ?? 0),
        currentAmount: parseFloat(g.currentAmount ?? g.current_amount ?? 0),
        targetDate: Number(g.targetDate ?? g.target_date ?? 0),
        status: g.status,
        category: g.category,
        coverPresetKey: g.coverPresetKey ?? g.cover_preset_key,
        coverImageUri: g.coverImageUri ?? g.cover_image_uri,
      }));
      useGoalsStore.getState().setGoals(mappedGoals);

      // 4. Map Bank Profiles
      const mappedBanks = (data.bankProfiles || []).map((b: any) => ({
        id: b.id,
        bankName: b.bankName ?? b.bank_name,
        accountNumberSuffix: b.accountNumberSuffix ?? b.account_number_suffix,
        currentBalance: Math.round(parseFloat(String(b.currentBalance ?? b.current_balance ?? 0)) * 100) / 100,
        lastSyncTimestamp: Number(b.lastSyncTimestamp ?? b.last_sync_timestamp ?? 0),
        smsSenderId: b.smsSenderId ?? b.sms_sender_id,
        upiId: b.upiId ?? b.upi_id,
        customKeywords: b.customKeywords ?? b.custom_keywords,
        smsConsent: b.smsConsent ?? b.sms_consent ?? false,
        debitCardSuffixes: parseDebitCardSuffixes(b.debitCardSuffixes ?? b.debit_card_suffixes),
      }));
      useBankStore.getState().setBankProfiles(mappedBanks);

      // 5. Map Income Records (Credits)
      const rawIncome = (data.incomeRecords || []).filter(
        (inc: any) => !(inc.amount === 95000 && /^income_\d+_/.test(inc.id)),
      );
      const mappedIncome = rawIncome.map((inc: any) => ({
        id: inc.id,
        amount: parseFloat(inc.amount || 0),
        category: inc.category && inc.category !== 'income' ? inc.category : 'money_received',
        merchant: inc.source || inc.merchant || 'Income',
        source: inc.source || inc.merchant || 'Income',
        timestamp: Number(inc.timestamp || Date.now()),
        bankProfileId: inc.bankProfileId ?? inc.bank_profile_id ?? null,
        updatedAt: inc.updatedAt ? Number(inc.updatedAt) : undefined,
        type: 'credit' as const,
      }));

      // Preserve local pending offline income records not yet reflected on the server
      const existingIncome = useIncomeStore.getState().incomeRecords;
      const serverIncIds = new Set(mappedIncome.map((i: any) => i.id).filter(Boolean));
      const localPendingIncome = (existingIncome || []).filter(
        (i: any) => i && i.id && pendingIds.has(i.id) && !serverIncIds.has(i.id),
      );
      const finalIncome = [...localPendingIncome, ...mappedIncome].sort(
        (a: any, b: any) => Number(b.timestamp) - Number(a.timestamp),
      );
      useIncomeStore.getState().setIncomeRecords(finalIncome);
      useSyncStatusStore.getState().setSyncStatus('success', null);
    } catch (err: any) {
      clearTimeout(syncTimeoutId);
      useSyncStatusStore.getState().setSyncStatus('error', err?.message || 'Server currently unreachable');
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


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
import { TRACKING_SETUP_KEY } from '../constants/trackingSetup';
import { getBackendUrl } from '../config/api';
import { notificationService } from './notificationService';
import { tokenStore } from './tokenStore';
import { apiFetch } from './apiClient';
import { outbox, isOutboxEnabled } from '../db/outbox';
import { mergeChangedRows, deltaLooksComplete, shouldAskForChangesOnly } from '../utils/syncMerge';

const BACKEND_URL = getBackendUrl();

let isSyncing = false;
let syncInFlight: Promise<void> | null = null;
let isFlushingOutbox = false;
/** When the last sync finished successfully (ms). Used to skip syncs on quick tab switches. */
let lastSyncSuccessAt = 0;
/** Screens re-check the server at most this often when they come into view. */
export const FOCUS_SYNC_MIN_GAP_MS = 60_000;
let lastNotificationsFetchAt = 0;

/**
 * Render's server takes 30-60 s to start after a deploy or restart. Until the server has
 * answered once in this app session (or after a request timed out), wait up to 60 s instead
 * of 12 s, so the first open after a deploy loads instead of failing.
 */
const NORMAL_TIMEOUT_MS = 12_000;
const WAKE_UP_TIMEOUT_MS = 60_000;
/** After this long without an answer, show "Connecting…". */
const SLOW_NOTICE_AFTER_MS = 4_000;
let serverReached = false;
let slowRequests = 0;

export const requestTimeoutMs = () => (serverReached ? NORMAL_TIMEOUT_MS : WAKE_UP_TIMEOUT_MS);

/**
 * Wraps one server request: picks the timeout, shows "Connecting…" if it's slow, and
 * remembers whether the server is awake.
 */
async function withServerPatience<T>(run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    try {
      controller.abort();
    } catch { }
  }, requestTimeoutMs());
  let shownSlow = false;
  const slowId = setTimeout(() => {
    shownSlow = true;
    slowRequests++;
    useSyncStatusStore.getState().setConnecting(true);
  }, SLOW_NOTICE_AFTER_MS);

  try {
    const result = await run(controller.signal);
    serverReached = true;
    return result;
  } catch (err) {
    // Timed out or no network: be patient again on the next try
    serverReached = false;
    throw err;
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(slowId);
    if (shownSlow) {
      slowRequests = Math.max(0, slowRequests - 1);
      if (slowRequests === 0) useSyncStatusStore.getState().setConnecting(false);
    }
  }
}

/**
 * The account that is logging in. Set while its data loads, before it becomes the signed-in
 * user, so the dashboard can appear already filled in (no ₹0 flash).
 */
let loggingInUser: { id: string; role?: string | null } | null = null;
const currentUser = (): any => useAuthStore.getState().user || loggingInUser;

/** The server's version of this user's data from the last full sync (sent back as If-None-Match). */
const etagKey = (userId: string) => `sync_etag_v1_${userId}`;
/** Where this phone's last pull ended (a server time), and when it last downloaded everything. */
const cursorKey = (userId: string) => `sync_cursor_v1_${userId}`;
const fullSyncAtKey = (userId: string) => `sync_full_at_v1_${userId}`;
/**
 * If the self-check fails on two changed-only pulls in a row, this phone stops asking for
 * changes only for a day (each failure costs a second, full download).
 */
const deltaMissKey = (userId: string) => `sync_delta_miss_v1_${userId}`;
const deltaPausedUntilKey = (userId: string) => `sync_delta_paused_until_v1_${userId}`;
const DELTA_PAUSE_MS = 24 * 60 * 60 * 1000;
export const clearSyncEtag = (userId?: string | null) => {
  if (userId) {
    mmkvStorage.delete(etagKey(userId));
    // Without these the next pull downloads everything, which is the safe default
    mmkvStorage.delete(cursorKey(userId));
    mmkvStorage.delete(fullSyncAtKey(userId));
    mmkvStorage.delete(deltaMissKey(userId));
    mmkvStorage.delete(deltaPausedUntilKey(userId));
  }
};

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

    const user = currentUser();
    const token = tokenStore.getAccessToken();
    if (!user || !token || user.role === 'admin' || user.role === 'superadmin') return;

    const baseUrl = getBackendUrl();

    try {
      const [snapshotsRes, incomeRes] = await withServerPatience((signal) =>
        Promise.all([
          apiFetch('/sync/net-worth-snapshots', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal,
          }),
          apiFetch('/sync/income-records', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
            signal,
          }),
        ]),
      );

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

    const user = currentUser();
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
  /**
   * For screens that sync when they come into view: skips the sync if the data is less
   * than a minute old, so quick tab switches don't reload everything. Pull-to-refresh
   * and saves keep calling sync(), which always runs.
   */
  syncIfStale(maxAgeMs = FOCUS_SYNC_MIN_GAP_MS): Promise<void> {
    if (syncInFlight) return syncInFlight;
    if (Date.now() - lastSyncSuccessAt < maxAgeMs) return Promise.resolve();
    return this.sync();
  },

  /**
   * Loads everything the dashboard shows (transactions, banks, budgets, goals, income and
   * net-worth history) for an account that has just logged in, before it is signed in.
   */
  async loadForLogin(profile: { id: string; role?: string | null }): Promise<void> {
    loggingInUser = profile;
    try {
      await Promise.all([this.sync(true), this.fetchAnalytics(true)]);
    } finally {
      loggingInUser = null;
    }
  },

  sync(force = false): Promise<void> {
    // A second caller waits for the sync already running instead of returning at once, so
    // "await sync()" always means the stores hold the server's data (the first-screen hold relies on it)
    if (!syncInFlight) {
      syncInFlight = this.runSync(force).finally(() => {
        syncInFlight = null;
      });
    }
    return syncInFlight;
  },

  async runSync(force = false): Promise<void> {
    if (isSyncing) return;

    const user = currentUser();
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

    try {
      // Trigger analytics and notifications fetch concurrently
      this.fetchAnalytics(force).catch(() => { });
      // Notifications: at most once a minute unless forced (pushes refresh them directly)
      if (force || Date.now() - lastNotificationsFetchAt >= FOCUS_SYNC_MIN_GAP_MS) {
        lastNotificationsFetchAt = Date.now();
        notificationService.fetchNotifications().catch(() => { });
      }

      // Ask "did anything change?" only when this phone already holds data to keep.
      // A forced sync (pull-to-refresh) always downloads everything.
      const savedEtag = mmkvStorage.getString(etagKey(user.id));
      const hasLocalData =
        existingTxs.length > 0 ||
        useBankStore.getState().bankProfiles.length > 0 ||
        useBudgetStore.getState().budgets.length > 0 ||
        useGoalsStore.getState().goals.length > 0;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (savedEtag && hasLocalData && !force) headers['If-None-Match'] = savedEtag;

      // Ask for "only what changed since my last pull" when this phone has a cursor, data to
      // apply the changes to, and downloaded everything within the last day. Otherwise (and
      // on pull-to-refresh) download everything.
      const savedCursor = mmkvStorage.getNumber(cursorKey(user.id));
      const deltaPaused = Date.now() < (mmkvStorage.getNumber(deltaPausedUntilKey(user.id)) || 0);
      const askChangesOnly = !deltaPaused && shouldAskForChangesOnly({
        force,
        cursor: savedCursor,
        lastFullSyncAt: mmkvStorage.getNumber(fullSyncAtKey(user.id)),
        hasLocalData,
        now: Date.now(),
      });
      const syncPath = askChangesOnly ? `/sync?since=${Math.floor(savedCursor as number)}` : '/sync';

      const response = await withServerPatience((signal) =>
        apiFetch(syncPath, {
          method: 'GET',
          headers,
          signal,
        }),
      );

      if (response.status === 304) {
        // Nothing changed on the server: keep what's on the phone.
        useSyncStatusStore.getState().setSyncStatus('success', null);
        lastSyncSuccessAt = Date.now();
        return;
      }

      if (!response.ok) {
        throw new Error(`Sync API returned status ${response.status}`);
      }

      let newEtag = response.headers.get('ETag');
      let data = await response.json();

      // Changed-only reply: check it before using it. The server says how many transactions
      // and credits it holds; if this phone would end up with a different number, a change
      // was missed or the phone's copy was incomplete, so download everything instead.
      const pendingIds = outbox.pendingEntityIds(user.id);
      if (data?.delta === true) {
        const complete =
          deltaLooksComplete({
            existingIds: existingTxs.map((t: any) => t?.id),
            changedIds: (data.transactions || []).map((t: any) => t?.id),
            deletedIds: data.deletedTransactionIds,
            localOnlyIds: pendingIds,
            serverTotal: data.totals?.transactions,
          }) &&
          deltaLooksComplete({
            existingIds: (useIncomeStore.getState().incomeRecords || []).map((i: any) => i?.id),
            changedIds: (data.incomeRecords || []).map((i: any) => i?.id),
            deletedIds: data.deletedIncomeIds,
            localOnlyIds: pendingIds,
            serverTotal: data.totals?.incomeRecords,
          });
        if (complete) {
          mmkvStorage.delete(deltaMissKey(user.id));
        } else {
          const misses = (mmkvStorage.getNumber(deltaMissKey(user.id)) || 0) + 1;
          if (misses >= 2) {
            mmkvStorage.setNumber(deltaPausedUntilKey(user.id), Date.now() + DELTA_PAUSE_MS);
            mmkvStorage.delete(deltaMissKey(user.id));
          } else {
            mmkvStorage.setNumber(deltaMissKey(user.id), misses);
          }
          const full = await withServerPatience((signal) =>
            apiFetch('/sync', { method: 'GET', headers: { 'Content-Type': 'application/json' }, signal }),
          );
          if (!full.ok) throw new Error(`Sync API returned status ${full.status}`);
          newEtag = full.headers.get('ETag');
          data = await full.json();
        }
      }
      const isDelta = data?.delta === true;

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

      // Changed-only reply: what the phone had, minus deleted rows, with changed rows replaced
      if (isDelta) {
        const merged = mergeChangedRows(existingTxs as any[], mappedTxs, data.deletedTransactionIds);
        mappedTxs.length = 0;
        mappedTxs.push(...merged);
      }

      // Preserve local pending offline transactions not yet reflected on the server
      const serverTxIds = new Set(mappedTxs.map((t) => t.id).filter(Boolean));
      const localPendingTxs = existingTxs.filter(
        (t) => t && t.id && pendingIds.has(t.id) && !serverTxIds.has(t.id),
      );
      const finalTxs = [...localPendingTxs, ...mappedTxs].sort(
        (a, b) => Number(b.timestamp) - Number(a.timestamp),
      );
      useTransactionStore.getState().setTransactions(finalTxs);

      // Reconcile Borrow & Lend ledger with synced transactions (e.g. Lent to friend)
      try {
        const { usePeerStore } = require('../store/peerStore');
        usePeerStore.getState().reconcileWithTransactions(finalTxs);
      } catch (peerErr) {
        console.warn('[Sync] Peer ledger reconciliation notice:', peerErr);
      }

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
        accountType: b.accountType ?? b.account_type,
        currentBalance: Math.round(parseFloat(String(b.currentBalance ?? b.current_balance ?? 0)) * 100) / 100,
        lastSyncTimestamp: Number(b.lastSyncTimestamp ?? b.last_sync_timestamp ?? 0),
        smsSenderId: b.smsSenderId ?? b.sms_sender_id,
        upiId: b.upiId ?? b.upi_id,
        customKeywords: b.customKeywords ?? b.custom_keywords,
        smsConsent: b.smsConsent ?? b.sms_consent ?? false,
        debitCardSuffixes: parseDebitCardSuffixes(b.debitCardSuffixes ?? b.debit_card_suffixes),
      }));
      useBankStore.getState().setBankProfiles(mappedBanks);
      if (mappedBanks.length > 0) {
        mmkvStorage.setBoolean(TRACKING_SETUP_KEY, true);
      }

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
      if (isDelta) {
        const merged = mergeChangedRows(existingIncome as any[], mappedIncome, data.deletedIncomeIds);
        mappedIncome.length = 0;
        mappedIncome.push(...merged);
      }
      const serverIncIds = new Set(mappedIncome.map((i: any) => i.id).filter(Boolean));
      const localPendingIncome = (existingIncome || []).filter(
        (i: any) => i && i.id && pendingIds.has(i.id) && !serverIncIds.has(i.id),
      );
      const finalIncome = [...localPendingIncome, ...mappedIncome].sort(
        (a: any, b: any) => Number(b.timestamp) - Number(a.timestamp),
      );
      useIncomeStore.getState().setIncomeRecords(finalIncome);
      useSyncStatusStore.getState().setSyncStatus('success', null);
      lastSyncSuccessAt = Date.now();
      // Remember the version only after everything above was stored
      if (newEtag) mmkvStorage.setString(etagKey(user.id), newEtag);
      else clearSyncEtag(user.id);
      // Same for the cursor. A server without changed-only sync sends none: forget ours.
      if (typeof data.cursor === 'number' && data.cursor > 0) {
        mmkvStorage.setNumber(cursorKey(user.id), data.cursor);
        if (!isDelta) mmkvStorage.setNumber(fullSyncAtKey(user.id), Date.now());
      } else {
        mmkvStorage.delete(cursorKey(user.id));
        mmkvStorage.delete(fullSyncAtKey(user.id));
      }
    } catch (err: any) {
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


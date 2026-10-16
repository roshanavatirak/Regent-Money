import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { parseSMS, detectBankFromSender } from './smsParser';
import { authService } from './authService';
import { getBackendUrl } from '../config/api';
import { useBankStore, useAuthStore, useTransactionStore } from '../store';
import { syncService } from './syncService';
import { matchesSmsSender } from '../constants/bankSmsSenders';
import { tagLearningService } from './tagLearningService';
import { checkAndDispatchBudgetAlert } from './budgetService';

import { mmkvStorage } from '../db/mmkv';

const BACKEND_URL = getBackendUrl();
const SMS_LAST_APP_OPEN_KEY = 'sms_last_app_open_timestamp';
let isReconciling = false;
let lastReconcileTime = 0;

export const smsCatchupService = {
  /**
   * Records the current timestamp as the last time the app was opened or active.
   */
  recordLastOpenTime(): void {
    try {
      mmkvStorage.setNumber(SMS_LAST_APP_OPEN_KEY, Date.now());
    } catch (e) {
      console.warn('[SMS Catch-up] Failed to record last open time:', e);
    }
  },

  /**
   * Retrieves the last recorded open timestamp or undefined.
   */
  getLastOpenTime(): number | undefined {
    try {
      return mmkvStorage.getNumber(SMS_LAST_APP_OPEN_KEY);
    } catch {
      return undefined;
    }
  },

  /**
   * Computes the dynamic lookback hours needed on app startup or resume.
   * - If user opened the app at 11 AM and opens again at 2 PM, elapsed time is 3 hours -> scans 3 hours (+15m buffer).
   * - If user last opened 30 days ago, scans 30 days.
   * - If first install / no record, defaults to 720 hours (30 days).
   * Clamped between 0.25h (15 minutes) and 720h (30 days).
   */
  getDynamicStartupLookback(): number {
    const lastOpen = this.getLastOpenTime();
    const now = Date.now();

    if (!lastOpen || isNaN(lastOpen)) {
      return 720; // 30 days on first run
    }

    const elapsedMs = Math.max(0, now - lastOpen);
    const elapsedHours = elapsedMs / (1000 * 60 * 60);
    // Add 15-minute safety buffer (+0.25 hr) so no transaction right around app close/kill is missed
    const bufferedHours = elapsedHours + 0.25;

    return Math.min(720, Math.max(0.25, bufferedHours));
  },

  /**
   * Scans Android SMS Inbox for recent financial SMS messages
   * and syncs any missing transactions that arrived while the app was asleep or killed.
   * Can be invoked manually for a specific bank profile or across all banks.
   */
  async reconcile(
    force = false,
    lookbackHours = 168,
    targetBankId?: string
  ): Promise<{ syncedCount: number; matchedCandidateCount: number } | null> {
    if (Platform.OS !== 'android') {
      return null;
    }

    const currentUser = useAuthStore.getState().user;
    if (currentUser?.role === 'admin' || currentUser?.role === 'superadmin') {
      return null;
    }

    const now = Date.now();
    // Throttle automatic scans to at most once per 60 seconds unless forced (manual is always forced)
    if (!force && now - lastReconcileTime < 60000) {
      return null;
    }

    if (isReconciling) {
      return null;
    }

    const token = authService.getAccessToken();
    if (!token) {
      return null;
    }

    // Check READ_SMS permission
    try {
      const hasPermission = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.READ_SMS
      );
      if (!hasPermission) {
        return null;
      }
    } catch {
      return null;
    }

    const Sms = NativeModules.Sms;
    if (!Sms || typeof Sms.list !== 'function') {
      console.warn('[SMS Catch-up] Native Sms module not available.');
      return null;
    }

    isReconciling = true;
    lastReconcileTime = now;

    try {
      const minDate = now - lookbackHours * 60 * 60 * 1000;
      // Dynamically scale maxCount based on lookback timeframe
      // 10 minutes (~0.17h) -> 100 max
      // 24 hours -> 500 max
      // 30 days (720h) -> up to 2500 max
      const maxCount = Math.min(2500, Math.max(100, Math.ceil(lookbackHours * 40)));

      const filter = JSON.stringify({
        box: 'inbox',
        minDate,
        maxCount,
      });

      const rawMessages: any[] = await new Promise((resolve) => {
        Sms.list(
          filter,
          (err: any) => {
            console.warn('[SMS Catch-up] Error reading SMS inbox:', err);
            resolve([]);
          },
          (count: number, smsList: string) => {
            try {
              const parsed = JSON.parse(smsList || '[]');
              resolve(parsed);
            } catch (e) {
              console.warn('[SMS Catch-up] Error parsing SMS list JSON:', e);
              resolve([]);
            }
          }
        );
      });

      if (!rawMessages || rawMessages.length === 0) {
        if (targetBankId) {
          const bank = useBankStore.getState().bankProfiles.find((b: any) => b.id === targetBankId);
          if (bank) {
            useBankStore.getState().updateBankProfileState({
              ...bank,
              lastSyncTimestamp: Date.now(),
            });
          }
        }
        return { syncedCount: 0, matchedCandidateCount: 0 };
      }

      // Fetch active bank profiles
      let bankProfiles = useBankStore.getState().bankProfiles;
      if (!bankProfiles || bankProfiles.length === 0) {
        try {
          const syncRes = await fetch(`${BACKEND_URL}/sync`, {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          if (syncRes.ok) {
            const syncData = await syncRes.json();
            bankProfiles = syncData.bankProfiles || [];
          }
        } catch {
          // ignore
        }
      }

      if (!bankProfiles || bankProfiles.length === 0) {
        return { syncedCount: 0, matchedCandidateCount: 0 };
      }

      // Group candidate transactions by matched bankProfileId
      const bankTxsMap = new Map<string, any[]>();

      for (const msg of rawMessages) {
        const sender = msg.address || '';
        const body = msg.body || '';
        if (!body) continue;

        const parsed = parseSMS(sender, body);
        if (!parsed) continue;

        const parsedSuffix = (parsed.accountSuffix || '').replace(/\D/g, '').slice(-4);

        // Strict Bank Confidence Matching:
        // Priority 1: Match from Sender ID DLT code or parsed bankName
        const senderBank = detectBankFromSender(sender) || (parsed.bankName !== 'Bank' ? parsed.bankName : null);

        // Filter profiles that belong to this sender's bank
        const candidateBanks = bankProfiles.filter((b: any) => {
          const profileBankName = (b.bankName || '').toLowerCase();
          const senderMatches = matchesSmsSender(sender, b.smsSenderId || b.sms_sender_id);
          const bankNameMatches = senderBank && profileBankName.includes(senderBank.toLowerCase());
          return senderMatches || bankNameMatches;
        });

        let matchedBank: any = null;

        // Condition A: Suffix matches an account at the same bank
        if (parsedSuffix && parsedSuffix !== 'XXXX') {
          matchedBank = candidateBanks.find((b: any) => {
            const dbSuffix = (b.accountNumberSuffix || b.account_number_suffix || '')
              .replace(/\D/g, '')
              .slice(-4);
            return dbSuffix === parsedSuffix;
          });
          // If a suffix was present in the SMS but did not match any account at this bank,
          // do NOT assign to any other bank. Leave matchedBank as null (Review Queue).
        } else if (candidateBanks.length === 1) {
          // Condition B: No suffix mentioned in SMS (e.g. UPI), but user has EXACTLY ONE account at this bank
          matchedBank = candidateBanks[0];
        }

        // If not 100% confident, group under 'unassigned' (Review Queue)
        const targetGroupKey = matchedBank ? matchedBank.id : 'unassigned';

        if (targetBankId && targetGroupKey !== targetBankId) {
          continue;
        }

        if (matchedBank) {
          // Verify SMS consent
          const hasConsent = matchedBank.smsConsent !== false && (matchedBank as any).sms_consent !== false;
          if (!hasConsent) continue;
        }

        const msgTimestamp = Number(msg.date) || now;
        const dateStr = new Date(msgTimestamp).toISOString().split('T')[0];

        if (!bankTxsMap.has(targetGroupKey)) {
          bankTxsMap.set(targetGroupKey, []);
        }

        const predictedCategory = tagLearningService.predict(
          parsed.merchant,
          body,
          parsed.type,
          parsed.isSalary
        );

        const cleanBody = (body || '').replace(/\s+/g, ' ').trim();
        let bodyHash = 0;
        for (let i = 0; i < cleanBody.length; i++) {
          bodyHash = ((bodyHash << 5) - bodyHash) + cleanBody.charCodeAt(i);
          bodyHash |= 0;
        }
        const candidateSmsId = parsed.referenceId
          ? `ref_${parsed.referenceId}`
          : `sms_${Math.abs(bodyHash)}`;

        bankTxsMap.get(matchedBank.id)!.push({
          amount: parsed.amount,
          type: parsed.type,
          merchant: parsed.merchant,
          category: predictedCategory,
          date: dateStr,
          timestamp: msgTimestamp,
          availableBalance: parsed.availableBalance,
          referenceId: parsed.referenceId,
          smsId: candidateSmsId,
        });

        // Check if this transaction already exists in our local store
        const existingTransactions = useTransactionStore.getState().transactions || [];
        const normIncoming = (parsed.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isTxExisting = existingTransactions.some((tx: any) => {
          // 1. Authoritative UPI Ref / RRN comparison
          if (parsed.referenceId && (tx.smsId === `ref_${parsed.referenceId}` || (tx as any).referenceId === parsed.referenceId)) {
            return true;
          }
          // 2. Deterministic content hash match (unified with direct native worker) or legacy inbox ID
          if (candidateSmsId && tx.smsId && (tx.smsId === candidateSmsId || tx.smsId === `sms_${msg.id}`)) {
            return true;
          }
          if (parsed.referenceId && tx.smsId && tx.smsId.startsWith('ref_') && tx.smsId !== `ref_${parsed.referenceId}`) {
            return false;
          }

          const txTime = Number(tx.timestamp || 0);
          const sameAmount = Math.abs(Number(tx.amount || 0) - parsed.amount) < 0.01;
          const sameType = tx.type === parsed.type;
          const isDateClose = Math.abs(txTime - msgTimestamp) < 86400000 || tx.date === dateStr;
          if (!sameAmount || !sameType || !isDateClose) return false;

          const normTx = (tx.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (normTx && normIncoming && normTx !== normIncoming) return false;

          // Deduplicate if within 10 minutes of matching transaction
          return Math.abs(txTime - msgTimestamp) < 600000;
        });

        // Only trigger real-time budget nudge & salary cycle detection for NEW transactions
        if (!isTxExisting) {
          try {
            checkAndDispatchBudgetAlert(
              {
                amount: parsed.amount,
                type: parsed.type,
                merchant: parsed.merchant,
                category: predictedCategory,
                isSalary: parsed.isSalary,
                timestamp: msgTimestamp,
                date: dateStr,
              },
              existingTransactions
            );
          } catch (alertErr) {
            console.warn('[Budget Nudge] Error checking budget alert:', alertErr);
          }
        }
      }

      let totalIngested = 0;
      let totalCandidates = 0;
      for (const list of bankTxsMap.values()) {
        totalCandidates += list.length;
      }

      // Submit extracted transactions to backend (backend deduplicates against active AND soft-deleted transactions)
      for (const [bankProfileId, txList] of bankTxsMap.entries()) {
        if (txList.length === 0) continue;

        // If any transaction in this bank batch has an authoritative available balance from SMS,
        // take the newest one by timestamp to anchor the bank's live balance.
        const txsWithBal = txList
          .filter((t: any) => t.availableBalance !== undefined && !isNaN(t.availableBalance) && t.availableBalance >= 0)
          .sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
        const latestAvailableBalance = txsWithBal.length > 0 ? txsWithBal[0].availableBalance : undefined;

        const isUnassigned = bankProfileId === 'unassigned';
        const bodyPayload: any = {
          bankProfileId: isUnassigned ? null : bankProfileId,
          transactions: txList,
        };
        // Unassigned review queue transactions MUST NEVER update any bank balance
        if (!isUnassigned && latestAvailableBalance !== undefined) {
          bodyPayload.updatedBalance = latestAvailableBalance;
        }

        try {
          const res = await fetch(`${BACKEND_URL}/sync/ocr-sync`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(bodyPayload),
          });

          if (res.ok) {
            const resJson = await res.json();
            const addedCount =
              (resJson.addedTransactionsCount || 0) + (resJson.addedIncomeCount || 0);
            totalIngested += addedCount;
          }
        } catch (e: any) {
          console.warn(`[SMS Catch-up] Error syncing for bank ${bankProfileId}:`, e?.message);
        }
      }

      if (targetBankId) {
        const bank = bankProfiles.find((b: any) => b.id === targetBankId);
        if (bank) {
          useBankStore.getState().updateBankProfileState({
            ...bank,
            lastSyncTimestamp: Date.now(),
          });
        }
      }

      if (totalIngested > 0) {
        console.log(`[SMS Catch-up] Reconciled and synced ${totalIngested} missing transactions.`);
        await syncService.sync(true);
      } else if (targetBankId) {
        // Trigger a background sync to keep states consistent
        await syncService.sync().catch(() => {});
      }

      this.recordLastOpenTime();
      return { syncedCount: totalIngested, matchedCandidateCount: totalCandidates };
    } catch (err: any) {
      console.warn('[SMS Catch-up] Error during reconciliation:', err?.message || err);
      return null;
    } finally {
      isReconciling = false;
    }
  },
};

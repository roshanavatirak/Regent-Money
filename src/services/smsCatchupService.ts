import { NativeModules, PermissionsAndroid, Platform } from 'react-native';
import { parseSMS } from './smsParser';
import { authService } from './authService';
import { getBackendUrl } from '../config/api';
import { useBankStore, useAuthStore, useTransactionStore } from '../store';
import { syncService } from './syncService';
import { matchesSmsSender } from '../constants/bankSmsSenders';
import { tagLearningService } from './tagLearningService';
import { checkAndDispatchBudgetAlert } from './budgetService';

const BACKEND_URL = getBackendUrl();
let isReconciling = false;
let lastReconcileTime = 0;

export const smsCatchupService = {
  /**
   * Scans Android SMS Inbox for recent financial SMS messages (last 48 hours by default)
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
      const filter = JSON.stringify({
        box: 'inbox',
        minDate,
        maxCount: 500,
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

        // 1. Try matching with suffix + sender
        let matchedBank = bankProfiles.find((b: any) => {
          const dbSuffix = (b.accountNumberSuffix || b.account_number_suffix || '')
            .replace(/\D/g, '')
            .slice(-4);
          const suffixMatches = parsedSuffix && dbSuffix && dbSuffix === parsedSuffix;
          const senderMatches = matchesSmsSender(sender, b.smsSenderId || b.sms_sender_id);
          return suffixMatches && senderMatches;
        });

        // 2. Try matching by suffix alone
        if (!matchedBank && parsedSuffix) {
          matchedBank = bankProfiles.find((b: any) => {
            const dbSuffix = (b.accountNumberSuffix || b.account_number_suffix || '')
              .replace(/\D/g, '')
              .slice(-4);
            return dbSuffix && dbSuffix === parsedSuffix;
          });
        }

        // 3. Try matching by sender ID or bank name (crucial for UPI transactions with no suffix)
        if (!matchedBank) {
          matchedBank = bankProfiles.find((b: any) => {
            const senderMatches = matchesSmsSender(sender, b.smsSenderId || b.sms_sender_id);
            const nameMatches =
              parsed.bankName &&
              parsed.bankName !== 'Bank' &&
              (b.bankName || '').toLowerCase().includes(parsed.bankName.toLowerCase());
            return senderMatches || nameMatches;
          });
        }

        // 4. Fallback to primary or any active bank profile
        if (!matchedBank && bankProfiles.length > 0) {
          matchedBank = bankProfiles.find((b: any) => b.isPrimary) || bankProfiles[0];
        }

        if (!matchedBank) continue;

        if (targetBankId && matchedBank.id !== targetBankId) {
          continue;
        }

        // Verify SMS consent
        const hasConsent = matchedBank.smsConsent !== false && (matchedBank as any).sms_consent !== false;
        if (!hasConsent) continue;

        const msgTimestamp = Number(msg.date) || now;
        const dateStr = new Date(msgTimestamp).toISOString().split('T')[0];

        if (!bankTxsMap.has(matchedBank.id)) {
          bankTxsMap.set(matchedBank.id, []);
        }

        const predictedCategory = tagLearningService.predict(
          parsed.merchant,
          body,
          parsed.type,
          parsed.isSalary
        );

        bankTxsMap.get(matchedBank.id)!.push({
          amount: parsed.amount,
          type: parsed.type,
          merchant: parsed.merchant,
          category: predictedCategory,
          date: dateStr,
        });

        // Trigger real-time budget nudge & salary cycle detection
        try {
          checkAndDispatchBudgetAlert(
            {
              amount: parsed.amount,
              type: parsed.type,
              merchant: parsed.merchant,
              category: predictedCategory,
              isSalary: parsed.isSalary,
            },
            useTransactionStore.getState().transactions
          );
        } catch (alertErr) {
          console.warn('[Budget Nudge] Error checking budget alert:', alertErr);
        }
      }

      let totalIngested = 0;
      let totalCandidates = 0;
      for (const list of bankTxsMap.values()) {
        totalCandidates += list.length;
      }

      // Submit extracted transactions to backend (backend deduplicates by date + amount)
      for (const [bankProfileId, txList] of bankTxsMap.entries()) {
        if (txList.length === 0) continue;

        try {
          const res = await fetch(`${BACKEND_URL}/sync/ocr-sync`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              bankProfileId,
              transactions: txList,
            }),
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

      return { syncedCount: totalIngested, matchedCandidateCount: totalCandidates };
    } catch (err: any) {
      console.warn('[SMS Catch-up] Error during reconciliation:', err?.message || err);
      return null;
    } finally {
      isReconciling = false;
    }
  },
};

import { registerRootComponent } from 'expo';
import { AppRegistry, Platform } from 'react-native';
import App from './App';
import { parseSMS } from './src/services/smsParser';
import { useBankStore } from './src/store';
import { authService } from './src/services/authService';

// Suppress unhandled promise rejections from web font observers
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    const msg = typeof reason === 'string' ? reason : (reason?.message || '');
    if (msg.includes('12000ms timeout exceeded') || msg.includes('timeout exceeded')) {
      event.preventDefault?.();
      if (typeof (event as any).stopImmediatePropagation === 'function') {
        (event as any).stopImmediatePropagation();
      }
    }
  });

  // Prevent Chrome "Blocked aria-hidden on an element because its descendant retained focus"
  if (typeof Element !== 'undefined' && Element.prototype && Element.prototype.setAttribute) {
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name: string, value: string) {
      if (name === 'aria-hidden' && (value === 'true' || value === '')) {
        if (typeof document !== 'undefined' && document.activeElement && this.contains(document.activeElement)) {
          try {
            (document.activeElement as HTMLElement).blur?.();
          } catch {}
        }
      }
      return originalSetAttribute.apply(this, arguments as any);
    };
  }
}

const SmsBackgroundSyncTask = async (taskData: any) => {
  console.log('[SMS Headless JS] Triggered task with data:', taskData);
  const { sender, body } = taskData;
  if (!body) return;

  try {
    const { mmkvStorage } = require('./src/db/mmkv');
    await mmkvStorage.initialize();

    const parsed = parseSMS(sender, body);
    if (!parsed) {
      console.log('[SMS Headless JS] SMS did not match any transaction pattern.');
      return;
    }

    console.log('[SMS Headless JS] Matched transaction:', parsed);

    const token = authService.getAccessToken();
    if (!token) {
      console.warn('[SMS Headless JS] User accessToken missing.');
      return;
    }

    const { getBackendUrl } = require('./src/config/api');
    const BACKEND_URL = getBackendUrl();

    // 1. Fetch active bank profiles directly from backend database
    const syncRes = await fetch(`${BACKEND_URL}/sync`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!syncRes.ok) {
      console.warn('[SMS Headless JS] Failed to fetch sync data from server.');
      return;
    }
    const syncData = await syncRes.json();
    const bankProfiles = syncData.bankProfiles || [];

    const { matchesSmsSender } = require('./src/constants/bankSmsSenders');

    // 2. Suffix + SMS Sender Tag match
    const matchedBank = bankProfiles.find((bank: any) => {
      const dbSuffix = (bank.accountNumberSuffix || bank.account_number_suffix || '').replace(/\D/g, '').slice(-4);
      const parsedSuffix = (parsed.accountSuffix || '').replace(/\D/g, '').slice(-4);
      const suffixMatches = dbSuffix && parsedSuffix && dbSuffix === parsedSuffix;
      const senderMatches = matchesSmsSender(sender, bank.smsSenderId || bank.sms_sender_id);
      return suffixMatches && senderMatches;
    }) || bankProfiles.find((bank: any) => {
      const dbSuffix = (bank.accountNumberSuffix || bank.account_number_suffix || '').replace(/\D/g, '').slice(-4);
      const parsedSuffix = (parsed.accountSuffix || '').replace(/\D/g, '').slice(-4);
      return dbSuffix && parsedSuffix && dbSuffix === parsedSuffix;
    });

    if (!matchedBank) {
      console.log('[SMS Headless JS] No linked bank accounts match suffix:', parsed.accountSuffix);
      return;
    }

    // 3. CHECK CONSENT (Defaults to true once SMS permission is granted, unless explicitly disabled)
    const hasConsent = matchedBank.smsConsent !== false && matchedBank.sms_consent !== false;
    if (!hasConsent) {
      console.log(`[SMS Headless JS] Blocked: Background SMS sync is disabled for bank ${matchedBank.bankName || matchedBank.bank_name}.`);
      return;
    }

    console.log('[SMS Headless JS] Consent verified. Ingesting transaction...');

    const dateStr = new Date().toISOString().split('T')[0];

    const response = await fetch(`${BACKEND_URL}/sync/ocr-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bankProfileId: matchedBank.id,
        transactions: [{
          amount: parsed.amount,
          type: parsed.type,
          merchant: parsed.merchant,
          date: dateStr,
        }],
      }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('[SMS Headless JS] Dynamic balance synced successfully:', result);

      // Trigger syncService to update local SQLite/MMKV database and Zustand UI state
      try {
        const { syncService } = require('./src/services/syncService');
        await syncService.sync();
        console.log('[SMS Headless JS] Local store synced successfully after SMS ingestion.');
      } catch (syncErr: any) {
        console.warn('[SMS Headless JS] Local store sync notice:', syncErr?.message);
      }
    } else {
      console.error('[SMS Headless JS] Synced failed:', await response.text());
    }
  } catch (error) {
    console.error('[SMS Headless JS] Error during headless SMS ingestion:', error);
  }
};

if (Platform.OS !== 'web') {
  AppRegistry.registerHeadlessTask('SmsBackgroundSync', () => SmsBackgroundSyncTask);
}

registerRootComponent(App);

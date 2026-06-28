import { registerRootComponent } from 'expo';
import { AppRegistry } from 'react-native';
import App from './App';
import { parseSMS } from './src/services/smsParser';
import { useBankStore } from './src/store';
import { authService } from './src/services/authService';

const SmsBackgroundSyncTask = async (taskData: any) => {
  console.log('[SMS Headless JS] Triggered task with data:', taskData);
  const { sender, body } = taskData;
  if (!body) return;

  try {
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

    const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

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

    // 2. Suffix match (last 4 digits)
    const matchedBank = bankProfiles.find((bank: any) => {
      const dbSuffix = (bank.accountNumberSuffix || bank.account_number_suffix || '').slice(-4);
      const parsedSuffix = (parsed.accountSuffix || '').slice(-4);
      return dbSuffix && parsedSuffix && dbSuffix === parsedSuffix;
    });

    if (!matchedBank) {
      console.log('[SMS Headless JS] No linked bank accounts match suffix:', parsed.accountSuffix);
      return;
    }

    // 3. CHECK CONSENT FIRST
    const hasConsent = matchedBank.smsConsent ?? matchedBank.sms_consent ?? false;
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
    } else {
      console.error('[SMS Headless JS] Synced failed:', await response.text());
    }
  } catch (error) {
    console.error('[SMS Headless JS] Error during headless SMS ingestion:', error);
  }
};

AppRegistry.registerHeadlessTask('SmsBackgroundSync', () => SmsBackgroundSyncTask);

registerRootComponent(App);

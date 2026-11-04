// src/services/bankDiscoveryService.ts
//
// 100% on-device SMS bank account discovery.
// Reads recent financial SMS messages from the Android inbox and detects
// distinct bank accounts with their last 4 digits and latest available balance.
// Raw SMS text NEVER leaves the device.

import { NativeModules, Platform } from 'react-native';
import { parseSMS, detectBankFromSender, extractAccountSuffix, isOtpMessage } from './smsParser';
import { isBankSmsSender } from '../constants/bankSmsSenders';
import { resolveBankCode, POPULAR_BANKS } from '../constants/bankBrand';

export interface DiscoveredBank {
  tempId: string;
  bankCode: string;
  bankName: string;
  accountNumberSuffix: string;
  currentBalance: string;
  accountType: 'Savings' | 'Current' | 'Credit Card';
  smsSenderId: string;
  lastSmsDate: number;
}

/**
 * Extracts distinct bank accounts from a list of raw SMS messages.
 * Pure function so it can be tested without native Android modules.
 */
export function extractDiscoveredBanksFromMessages(rawMessages: Array<{ address?: string; body?: string; date?: number | string }>): DiscoveredBank[] {
  const map = new Map<string, DiscoveredBank>();

  for (const msg of rawMessages) {
    const sender = (msg.address || '').trim();
    const body = (msg.body || '').trim();
    if (!body || !sender) continue;

    // Filter out non-bank senders and OTPs strictly on device
    if (!isBankSmsSender(sender)) continue;
    if (isOtpMessage(body)) continue;

    const detectedBank = detectBankFromSender(sender);
    const parsed = parseSMS(sender, body);

    // Bank identification
    const bankCandidate = detectedBank || (parsed?.bankName && parsed.bankName !== 'Bank' ? parsed.bankName : null);
    if (!bankCandidate) continue;

    // Resolve canonical bank name and code
    const popularMatch = POPULAR_BANKS.find(
      (b) =>
        b.short.toLowerCase() === bankCandidate.toLowerCase() ||
        b.name.toLowerCase().includes(bankCandidate.toLowerCase()) ||
        bankCandidate.toLowerCase().includes(b.short.toLowerCase())
    );
    const canonicalName = popularMatch ? popularMatch.name : bankCandidate;
    const bankCode = resolveBankCode(canonicalName, sender);

    // Extract 4-digit suffix
    let suffix = parsed?.accountSuffix || extractAccountSuffix(body);
    suffix = (suffix || '').replace(/\D/g, '').slice(-4);
    if (!suffix || suffix.length < 3 || suffix === '0000' || suffix === 'XXXX') {
      continue;
    }
    if (suffix.length === 3) {
      suffix = '0' + suffix;
    }

    // Determine account type
    const lowerBody = body.toLowerCase();
    let accountType: 'Savings' | 'Current' | 'Credit Card' = 'Savings';
    if (lowerBody.includes('credit card') || lowerBody.includes('card ending') || lowerBody.includes('card xx') || lowerBody.includes('card no')) {
      accountType = 'Credit Card';
    } else if (lowerBody.includes('current a/c') || lowerBody.includes('current account')) {
      accountType = 'Current';
    }

    const availableBal = parsed?.availableBalance;
    const msgDate = Number(msg.date) || Date.now();

    // Clean sender tag (e.g. "AD-HDFCBK" -> "HDFCBK")
    const cleanSender = sender.toUpperCase().replace(/^[A-Z]{2}-/i, '').replace(/[^A-Z0-9]/g, '');

    const key = `${canonicalName.toLowerCase()}_${suffix}`;
    const existing = map.get(key);

    if (!existing) {
      map.set(key, {
        tempId: `disc_${bankCode.toLowerCase()}_${suffix}`,
        bankCode,
        bankName: canonicalName,
        accountNumberSuffix: suffix,
        currentBalance: availableBal !== undefined ? String(availableBal) : '',
        accountType,
        smsSenderId: cleanSender,
        lastSmsDate: msgDate,
      });
    } else {
      // If this message is newer, update timestamp and latest available balance
      if (msgDate > existing.lastSmsDate) {
        existing.lastSmsDate = msgDate;
        if (availableBal !== undefined) {
          existing.currentBalance = String(availableBal);
        }
      } else if (!existing.currentBalance && availableBal !== undefined) {
        existing.currentBalance = String(availableBal);
      }
    }
  }

  // Return sorted by most recent bank alert first
  return Array.from(map.values()).sort((a, b) => b.lastSmsDate - a.lastSmsDate);
}

export const bankDiscoveryService = {
  /**
   * Scans Android SMS Inbox (default 30 days / 720 hours) and returns
   * unique discovered bank accounts.
   */
  async discoverBanksFromSms(lookbackHours = 720): Promise<DiscoveredBank[]> {
    if (Platform.OS !== 'android') {
      return [];
    }

    const Sms = NativeModules.Sms;
    if (!Sms || typeof Sms.list !== 'function') {
      console.warn('[BankDiscovery] Native Sms module unavailable.');
      return [];
    }

    try {
      const minDate = Date.now() - lookbackHours * 60 * 60 * 1000;
      const filter = JSON.stringify({
        box: 'inbox',
        minDate,
        maxCount: 2500,
      });

      const rawMessages: any[] = await new Promise((resolve) => {
        Sms.list(
          filter,
          (err: any) => {
            console.warn('[BankDiscovery] Error listing SMS:', err);
            resolve([]);
          },
          (count: number, smsList: string) => {
            try {
              const parsed = JSON.parse(smsList || '[]');
              resolve(parsed);
            } catch (e) {
              console.warn('[BankDiscovery] Failed to parse SMS list JSON:', e);
              resolve([]);
            }
          }
        );
      });

      if (!rawMessages || rawMessages.length === 0) {
        return [];
      }

      return extractDiscoveredBanksFromMessages(rawMessages);
    } catch (e) {
      console.warn('[BankDiscovery] Discovery error:', e);
      return [];
    }
  },
};

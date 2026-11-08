/**
 * Cash wallet.
 *
 * Cash is stored as one ordinary account in the bank-profile list, marked with
 * accountType 'Cash'. Because it is just an account, everything that already reads
 * accounts works with it: net worth (sum of balances), manual entry (pick Cash as the
 * account), money in / out, budgets, sync and the offline outbox.
 *
 * It has no SMS sender, no account suffix and smsConsent false, so the SMS matcher
 * never routes bank messages to it.
 */

import { BankProfileType, useAuthStore, useBankStore } from '../store';
import { authService } from './authService';
import { getBackendUrl } from '../config/api';

export const CASH_ACCOUNT_TYPE = 'Cash';
export const CASH_NAME = 'Cash';

/** True for the cash wallet account (accountType 'Cash', or an id made by createCashAccount). */
export const isCashProfile = (b?: Partial<BankProfileType> | null): boolean =>
  !!b &&
  ((b.accountType || '').toLowerCase() === 'cash' || (typeof b.id === 'string' && b.id.startsWith('cash_')));

export const getCashProfile = (profiles?: BankProfileType[]): BankProfileType | undefined =>
  (profiles ?? useBankStore.getState().bankProfiles).find(isCashProfile);

/** Bank accounts only (the cash wallet left out), for screens that are about banks. */
export const bankAccountsOnly = (profiles: BankProfileType[]) => profiles.filter((b) => !isCashProfile(b));

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

async function saveCashProfile(profile: BankProfileType): Promise<void> {
  const token = authService.getAccessToken();
  if (!token) throw new Error('Sign in again to update your cash.');
  const response = await fetch(`${getBackendUrl()}/sync/bank-profile`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: profile.id,
      bankName: CASH_NAME,
      accountType: CASH_ACCOUNT_TYPE,
      accountNumberSuffix: '',
      currentBalance: round2(profile.currentBalance),
      smsConsent: false,
    }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Could not save your cash. Try again.');
  }
}

/** Creates the cash wallet with an opening balance. Returns the existing one if it is already there. */
export async function createCashAccount(openingBalance: number): Promise<BankProfileType> {
  const existing = getCashProfile();
  if (existing) return existing;

  const userId = useAuthStore.getState().user?.id;
  if (!userId) throw new Error('Sign in again to track cash.');

  const profile: BankProfileType = {
    id: `cash_${userId}`,
    bankName: CASH_NAME,
    accountType: CASH_ACCOUNT_TYPE,
    accountNumberSuffix: '',
    currentBalance: round2(openingBalance),
    lastSyncTimestamp: Date.now(),
    smsConsent: false,
  };
  await saveCashProfile(profile);
  useBankStore.getState().addBankProfileState(profile);
  return profile;
}

/** "Set balance": corrects the cash in hand after counting it. Not counted as income or spending. */
export async function setCashBalance(newBalance: number): Promise<void> {
  const cash = getCashProfile();
  if (!cash) throw new Error('Set up your cash first.');
  const next = { ...cash, currentBalance: round2(newBalance) };
  await saveCashProfile(next);
  useBankStore.getState().updateBankBalance(cash.id, next.currentBalance);
}

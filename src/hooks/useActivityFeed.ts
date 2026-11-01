import { useMemo } from 'react';
import { useBankStore, useIncomeStore, useTransactionStore, BankProfileType } from '../store';
import { resolveBankCode } from '../components/BankIcon';

/**
 * Unified credit + debit feed.
 *
 * Debits live in the transaction store and credits in the income store; both carry a
 * `bankProfileId`. This merges them into one newest-first list (same de-duplication rules as
 * BankDetailsModal) and exposes the linked bank accounts for bank-wise filtering.
 */

export type ActivityFilter = 'all' | 'credit' | 'debit' | { bankId: string };

export interface ActivityItem {
  id: string;
  type: 'credit' | 'debit';
  merchant?: string;
  amount: number | string;
  category?: string;
  timestamp: number | string;
  bankProfileId?: string | null;
  [key: string]: any;
}

export interface ActivityBank {
  id: string;
  /** Bank code for the logo (e.g. HDFC, SBIN); never rendered as text. */
  code: string;
  /** Only used to resolve the logo; never rendered as text. */
  bankName: string;
  /** Masked account number, e.g. "••1234". */
  mask: string;
}

export const maskAccount = (suffix?: string | null) => {
  const digits = String(suffix ?? '').replace(/\D/g, '').slice(-4);
  return digits ? `••${digits}` : '••••';
};

export const toActivityBank = (b: BankProfileType): ActivityBank => ({
  id: b.id,
  code: resolveBankCode(b.bankName, b.smsSenderId),
  bankName: b.bankName,
  mask: maskAccount(b.accountNumberSuffix),
});

export const filterActivity = (items: ActivityItem[], filter: ActivityFilter) => {
  if (filter === 'all') return items;
  if (filter === 'credit' || filter === 'debit') return items.filter((i) => i.type === filter);
  return items.filter((i) => i.bankProfileId === filter.bankId);
};

export const isSameFilter = (a: ActivityFilter, b: ActivityFilter) =>
  typeof a === 'string' || typeof b === 'string' ? a === b : a.bankId === b.bankId;

const EMPTY: any[] = [];

export const useActivityFeed = () => {
  // Cached MMKV payloads can be missing on first launch; never let the feed crash on them.
  const transactions = useTransactionStore((s) => s.transactions) ?? EMPTY;
  const incomeRecords = useIncomeStore((s) => s.incomeRecords) ?? EMPTY;
  const bankProfiles = useBankStore((s) => s.bankProfiles) ?? EMPTY;

  const banks = useMemo(() => bankProfiles.map(toActivityBank), [bankProfiles]);

  const items = useMemo(() => {
    const activeBankIds = new Set(bankProfiles.map((b) => b.id));
    const fromActiveBank = (bankId?: string | null) =>
      activeBankIds.size === 0 || !bankId || activeBankIds.has(bankId);

    const debits: ActivityItem[] = transactions
      .filter((tx) => tx && !tx.isDeleted)
      .map((tx) => ({
        ...tx,
        type: tx.type === 'credit' ? 'credit' : 'debit',
        bankProfileId: tx.bankProfileId ?? tx.bank_profile_id ?? null,
      }));
    const credits: ActivityItem[] = incomeRecords
      .filter((inc) => inc && !(inc as any).isDeleted)
      .map((inc) => ({
        ...inc,
        merchant: inc.merchant || inc.source || 'Income',
        source: inc.source || inc.merchant || 'Income',
        type: 'credit' as const,
        bankProfileId: inc.bankProfileId ?? (inc as any).bank_profile_id ?? null,
      }));

    const sorted = [...debits, ...credits]
      .filter((i) => fromActiveBank(i.bankProfileId))
      .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));

    const seenIds = new Set<string>();
    const seenRefs = new Set<string>();
    const out: ActivityItem[] = [];
    for (const item of sorted) {
      if (item.id) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
      }
      const ref = item.referenceId || (typeof item.smsId === 'string' && item.smsId.startsWith('ref_') ? item.smsId : null);
      if (ref) {
        if (seenRefs.has(ref)) continue;
        seenRefs.add(ref);
      }
      out.push(item);
    }
    return out;
  }, [transactions, incomeRecords, bankProfiles]);

  return { items, banks };
};

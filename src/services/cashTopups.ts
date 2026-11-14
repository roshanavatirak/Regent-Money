/**
 * What the Cash wallet screen lists: entries saved on the cash account, plus ATM withdrawals
 * the server added to the wallet (tagged Cash withdrawal, made after the wallet started
 * tracking them; see backend cash-wallet-topups.ts). Those are shown as cash coming in.
 *
 * Pure (no React Native imports) so it runs under `npm run test:unit`.
 */
import { CASH_WITHDRAWAL_ALIASES, CASH_WITHDRAWAL_ID } from '../constants/nonSpendingCategories';

const KEYS = new Set([CASH_WITHDRAWAL_ID, ...CASH_WITHDRAWAL_ALIASES]);

export const isCashWithdrawalCategory = (category?: string | null) =>
  KEYS.has(
    String(category || '')
      .toLowerCase()
      .trim()
      .replace(/[\s-]+/g, '_'),
  );

interface FeedItem {
  id: string;
  type: 'credit' | 'debit';
  category?: string;
  timestamp: number | string;
  bankProfileId?: string | null;
  [key: string]: any;
}

export type CashFeedItem<T extends FeedItem> = T & {
  /** True for an ATM withdrawal shown as cash coming into the wallet. */
  atmTopup?: boolean;
  /** The bank transaction behind an ATM row, for opening its details. */
  source?: T;
};

/** Keeps the feed's order (newest first). */
export function cashWalletItems<T extends FeedItem>(
  items: T[],
  cash: { id: string; cashTrackingSince?: number } | null | undefined,
): CashFeedItem<T>[] {
  if (!cash) return [];
  const since = Number(cash.cashTrackingSince) || 0;
  const out: CashFeedItem<T>[] = [];
  for (const tx of items) {
    if (tx.bankProfileId === cash.id) {
      out.push(tx);
    } else if (
      since > 0 &&
      tx.type === 'debit' &&
      isCashWithdrawalCategory(tx.category) &&
      Number(tx.timestamp) >= since
    ) {
      out.push({ ...tx, type: 'credit', atmTopup: true, source: tx });
    }
  }
  return out;
}

import { isNonSpendingCategory } from '../constants/nonSpendingCategories';

/** Categories that never count as spending or income: money moving between your own accounts. */
const SELF_TRANSFER_CATEGORIES = new Set(['self_transfer', 'self transfer', 'self-transfer', 'own_account']);

// The store's excluded-id list as a Set, rebuilt only when the list itself changes.
// Summary loops call isExcludedFromBudget once per transaction, so this keeps each check O(1).
let storeIdsRef: string[] | null = null;
let storeIdsSet: Set<string> = new Set();
const storeExcludedSet = (): Set<string> => {
  try {
    const { useBudgetStore } = require('../store');
    const ids: string[] = useBudgetStore.getState().excludedTransactionIds || [];
    if (ids !== storeIdsRef) {
      storeIdsRef = ids;
      storeIdsSet = new Set(ids);
    }
  } catch {}
  return storeIdsSet;
};

/**
 * Decides whether a transaction is left out of Money in / Money out and budgets.
 *
 * The decision is made from the category only (plus the user's own manual choices),
 * never from the SMS wording, the merchant name or whether it was credited or debited:
 *  - category is Self transfer (or the isSelfTransfer flag is set)
 *  - category is a Borrow & Lend entry (peer_*), which is tracked separately
 *  - category is Cash withdrawal or Card bill (money moved, not spent), unless
 *    `keepNonSpending` is set: a budget made for that category still counts it
 *  - the user excluded this transaction by hand (excludedFromBudget flag or excluded id list)
 */
export function isExcludedFromBudget(
  tx: any,
  explicitExcludedIds?: string[] | Set<string>,
  options?: { keepNonSpending?: boolean },
): boolean {
  if (!tx) return false;
  if (tx.isSelfTransfer === true || tx.excludedFromBudget === true) return true;

  const category = String(tx.category || tx.tag || '').toLowerCase().trim();
  if (SELF_TRANSFER_CATEGORIES.has(category) || category.startsWith('peer_')) return true;
  if (!options?.keepNonSpending && isNonSpendingCategory(category)) return true;

  if (tx.id && explicitExcludedIds) {
    const has = explicitExcludedIds instanceof Set ? explicitExcludedIds.has(tx.id) : explicitExcludedIds.includes(tx.id);
    if (has) return true;
  }

  return !!tx.id && storeExcludedSet().has(tx.id);
}

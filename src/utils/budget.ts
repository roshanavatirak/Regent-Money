/** Categories that never count as spending or income: money moving between your own accounts. */
const SELF_TRANSFER_CATEGORIES = new Set(['self_transfer', 'self transfer', 'self-transfer', 'own_account']);

/**
 * Decides whether a transaction is left out of Money in / Money out and budgets.
 *
 * The decision is made from the category only (plus the user's own manual choices),
 * never from the SMS wording, the merchant name or whether it was credited or debited:
 *  - category is Self transfer (or the isSelfTransfer flag is set)
 *  - category is a Borrow & Lend entry (peer_*), which is tracked separately
 *  - the user excluded this transaction by hand (excludedFromBudget flag or excluded id list)
 */
export function isExcludedFromBudget(tx: any, explicitExcludedIds?: string[]): boolean {
  if (!tx) return false;
  if (tx.isSelfTransfer === true || tx.excludedFromBudget === true) return true;

  const category = String(tx.category || tx.tag || '').toLowerCase().trim();
  if (SELF_TRANSFER_CATEGORIES.has(category) || category.startsWith('peer_')) return true;

  if (explicitExcludedIds && tx.id && explicitExcludedIds.includes(tx.id)) return true;

  try {
    const { useBudgetStore } = require('../store');
    const excludedIds: string[] = useBudgetStore.getState().excludedTransactionIds || [];
    if (tx.id && excludedIds.includes(tx.id)) return true;
  } catch {}

  return false;
}

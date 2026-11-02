/**
 * Pure helper to determine if a transaction should be excluded from spending budgets.
 * Excludes self-transfers, peer lending, credit card bill payments, and explicitly excluded IDs.
 */
export function isExcludedFromBudget(tx: any, explicitExcludedIds?: string[]): boolean {
  if (!tx) return false;
  if (tx.isSelfTransfer === true || tx.excludedFromBudget === true) return true;
  const category = (tx.category || tx.tag || '').toLowerCase().trim();
  if (
    category === 'transfer' ||
    category === 'self_transfer' ||
    category === 'self transfer' ||
    category === 'self-transfer' ||
    category === 'peer_lent' ||
    category === 'peer_lent_repaid' ||
    category === 'peer_borrowed' ||
    category === 'peer_borrow_repaid' ||
    category.startsWith('peer_')
  ) return true;

  if (explicitExcludedIds && tx.id && explicitExcludedIds.includes(tx.id)) {
    return true;
  }

  try {
    const { useBudgetStore } = require('../store');
    const excludedIds: string[] = useBudgetStore.getState().excludedTransactionIds || [];
    if (tx.id && excludedIds.includes(tx.id)) return true;
  } catch { }

  const note = (tx.merchant || tx.source || tx.note || '').toUpperCase();
  const excludedPatterns = [
    'CRED',
    'CHEQ',
    'BILLDESK',
    'CREDIT CARD',
    'CC PYMT',
    'CC PAYMENT',
    'AUTOPAY CARD',
    'CARD PAYMENT',
    'SELF TRANSFER',
    'TRANSFER TO OWN',
    'SELF TRF',
    'OWN A/C',
  ];

  return excludedPatterns.some((pattern) => note.includes(pattern));
}


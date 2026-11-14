/**
 * Tags for money that moves rather than gets spent. They are left out of Money in / Money out
 * and the overall budget, the same way Self transfer is:
 *  - Cash withdrawal: ATM cash goes into your pocket; spending it is what counts.
 *  - Card bill: paying the credit-card bill; the purchases were counted when you swiped.
 *
 * Kept free of React Native imports so plain Node tests can load it.
 */

export const CASH_WITHDRAWAL_ID = 'cash_withdrawals';
export const CARD_BILL_ID = 'card_bill';

/** Other names each one may be stored under (also used as the tag's aliases in categories.ts). */
export const CASH_WITHDRAWAL_ALIASES = ['cash_withdrawal', 'atm', 'atm_withdrawal'];
export const CARD_BILL_ALIASES = ['credit_card_bill', 'cc_bill', 'credit_card', 'credit_card_payment'];

const KEYS = new Set([CASH_WITHDRAWAL_ID, ...CASH_WITHDRAWAL_ALIASES, CARD_BILL_ID, ...CARD_BILL_ALIASES]);

/** True when a stored category means Cash withdrawal or Card bill ("Card Bill", "card-bill" too). */
export const isNonSpendingCategory = (category?: string | null): boolean =>
  KEYS.has(
    String(category || '')
      .toLowerCase()
      .trim()
      .replace(/[\s-]+/g, '_'),
  );

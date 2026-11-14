import assert from 'node:assert';
import { test } from 'node:test';
import { isExcludedFromBudget } from './budget.ts';
import { monthSummary } from './monthSummary.ts';

const getColor = () => '#ffffff';

test('only the Self transfer category (and its flag) is left out', () => {
  assert.strictEqual(isExcludedFromBudget({ id: '1', category: 'self_transfer' }), true);
  assert.strictEqual(isExcludedFromBudget({ id: '2', category: 'own_account' }), true);
  assert.strictEqual(isExcludedFromBudget({ id: '3', category: 'food', isSelfTransfer: true }), true);
});

test('SMS / merchant wording never decides it', () => {
  const merchants = ['Self transfer', 'TRF TO OWN A/C', 'Transfer to own account', 'CRED', 'Google Pay', 'TRF TO RAHUL'];
  for (const merchant of merchants) {
    assert.strictEqual(isExcludedFromBudget({ id: 'x', category: 'money_transfer', merchant }), false, merchant);
  }
});

test('Sent (money_transfer / legacy "transfer") counts as spending', () => {
  assert.strictEqual(isExcludedFromBudget({ id: 's1', category: 'money_transfer' }), false);
  assert.strictEqual(isExcludedFromBudget({ id: 's2', category: 'transfer' }), false);
});

test('Borrow & Lend categories and manual exclusions are still left out', () => {
  assert.strictEqual(isExcludedFromBudget({ id: 'p', category: 'peer_lent' }), true);
  assert.strictEqual(isExcludedFromBudget({ id: 'm', category: 'food', excludedFromBudget: true }), true);
  assert.strictEqual(isExcludedFromBudget({ id: 'e', category: 'food' }, ['e']), true);
});

test('Cash withdrawal and Card bill are money moved, not spent', () => {
  for (const category of ['cash_withdrawals', 'atm', 'Cash withdrawal', 'card_bill', 'credit_card_bill', 'Card Bill', 'card-bill']) {
    assert.strictEqual(isExcludedFromBudget({ id: category, category }), true, category);
  }
  // The other new tags count as spending
  for (const category of ['emi_loans', 'subscriptions', 'household_help', 'family_support', 'gifts', 'fitness', 'festivals', 'tax', 'business_expense']) {
    assert.strictEqual(isExcludedFromBudget({ id: category, category }), false, category);
  }
});

test('a budget made for Card bill still counts it; manual exclusions still win', () => {
  const keep = { keepNonSpending: true };
  assert.strictEqual(isExcludedFromBudget({ id: 'c1', category: 'card_bill' }, undefined, keep), false);
  assert.strictEqual(isExcludedFromBudget({ id: 'c2', category: 'card_bill', excludedFromBudget: true }, undefined, keep), true);
  assert.strictEqual(isExcludedFromBudget({ id: 'c3', category: 'self_transfer' }, undefined, keep), true);
});

test('Money out leaves out ATM cash and card bills', () => {
  const monthStart = 1_000_000;
  const txs = [
    { id: 'f', type: 'debit', amount: 300, category: 'food', bankProfileId: 'b', timestamp: monthStart + 1 },
    { id: 'a', type: 'debit', amount: 2000, category: 'cash_withdrawals', bankProfileId: 'b', timestamp: monthStart + 2 },
    { id: 'k', type: 'debit', amount: 9000, category: 'card_bill', bankProfileId: 'b', timestamp: monthStart + 3 },
    { id: 'e', type: 'debit', amount: 4000, category: 'emi_loans', bankProfileId: 'b', timestamp: monthStart + 4 },
  ];
  const res = monthSummary(txs, [], monthStart, new Set(), false, getColor);
  assert.strictEqual(res.out, 4300);
});

test('same-amount debit and credit both count; nothing is guessed as a transfer', () => {
  const monthStart = 1_000_000;
  const txs = [{ id: 'd', type: 'debit', amount: 500, category: 'money_transfer', bankProfileId: 'bank_1', timestamp: monthStart + 10 }];
  const incomes = [{ id: 'c', type: 'credit', amount: 500, category: 'money_received', bankProfileId: 'bank_2', timestamp: monthStart + 20 }];
  const res = monthSummary(txs, incomes, monthStart, new Set(), false, getColor);
  assert.strictEqual(res.out, 500);
  assert.strictEqual(res.in, 500);
});

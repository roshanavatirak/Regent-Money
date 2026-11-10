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

test('same-amount debit and credit both count; nothing is guessed as a transfer', () => {
  const monthStart = 1_000_000;
  const txs = [{ id: 'd', type: 'debit', amount: 500, category: 'money_transfer', bankProfileId: 'bank_1', timestamp: monthStart + 10 }];
  const incomes = [{ id: 'c', type: 'credit', amount: 500, category: 'money_received', bankProfileId: 'bank_2', timestamp: monthStart + 20 }];
  const res = monthSummary(txs, incomes, monthStart, new Set(), false, getColor);
  assert.strictEqual(res.out, 500);
  assert.strictEqual(res.in, 500);
});

import assert from 'node:assert';
import { test } from 'node:test';
import { cashWalletItems } from './cashTopups.ts';

const SINCE = 1_000_000;
const cash = { id: 'cash_u1', cashTrackingSince: SINCE };

const items = [
  { id: 'atm_new', type: 'debit' as const, amount: 2000, category: 'cash_withdrawals', timestamp: SINCE + 50, bankProfileId: 'hdfc' },
  { id: 'tea', type: 'debit' as const, amount: 20, category: 'food', timestamp: SINCE + 40, bankProfileId: 'cash_u1' },
  { id: 'atm_alias', type: 'debit' as const, amount: 500, category: 'ATM', timestamp: SINCE + 30, bankProfileId: 'sbi' },
  { id: 'food_bank', type: 'debit' as const, amount: 300, category: 'food', timestamp: SINCE + 20, bankProfileId: 'hdfc' },
  { id: 'atm_old', type: 'debit' as const, amount: 1000, category: 'cash_withdrawals', timestamp: SINCE - 10, bankProfileId: 'hdfc' },
];

test('lists cash entries plus ATM withdrawals made after tracking started, newest first', () => {
  const out = cashWalletItems(items, cash);
  assert.deepStrictEqual(out.map((i) => i.id), ['atm_new', 'tea', 'atm_alias']);
});

test('ATM rows show as cash coming in and keep the bank transaction to open', () => {
  const [atm, tea] = cashWalletItems(items, cash);
  assert.strictEqual(atm.type, 'credit');
  assert.strictEqual(atm.atmTopup, true);
  assert.strictEqual(atm.source?.id, 'atm_new');
  assert.strictEqual(atm.source?.type, 'debit');
  assert.strictEqual(tea.atmTopup, undefined);
});

test('no ATM rows until the server has started tracking', () => {
  const out = cashWalletItems(items, { id: 'cash_u1' });
  assert.deepStrictEqual(out.map((i) => i.id), ['tea']);
});

test('no cash wallet, nothing to list', () => {
  assert.deepStrictEqual(cashWalletItems(items, undefined), []);
});

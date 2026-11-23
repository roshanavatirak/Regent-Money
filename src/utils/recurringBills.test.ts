import assert from 'node:assert';
import { test } from 'node:test';
import { detectRecurringBills, attributedTime, billsDueBetween } from './recurringBills.ts';
import { billAwarePacing, safeToSpend } from './billPacing.ts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const mid = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const debit = (merchant: string, amount: number, y: number, m: number, d: number, category = '') => ({
  id: `${merchant}-${m}-${d}-${amount}`,
  merchant,
  amount,
  category,
  type: 'debit',
  timestamp: at(y, m, d),
});

const history = [
  debit('Landlord Sharma', 15000, 2026, 8, 1, 'rent'),
  debit('Landlord Sharma', 15000, 2026, 9, 1, 'rent'),
  debit('Landlord Sharma', 15000, 2026, 10, 1, 'rent'),
  debit('Bajaj Finance', 6200, 2026, 9, 5, 'emi_loans'),
  debit('Bajaj Finance', 6200, 2026, 10, 5, 'emi_loans'),
  debit('Netflix', 649, 2026, 9, 12),
  debit('Netflix', 649, 2026, 10, 12),
  // Frequent merchant: many orders a month, not a bill.
  ...[3, 9, 15, 22].flatMap((d) => [debit('Swiggy', 400, 2026, 9, d, 'food'), debit('Swiggy', 380, 2026, 10, d, 'food')]),
  // Paid twice, amounts all over the place, not a bill category.
  debit('Croma', 2000, 2026, 9, 20),
  debit('Croma', 18000, 2026, 10, 20),
];

test('finds rent, EMI and a steady subscription; skips food delivery and one-off shops', () => {
  const bills = detectRecurringBills(history, at(2026, 10, 25));
  const byKey = Object.fromEntries(bills.map((b) => [b.key, b]));
  assert.deepStrictEqual(Object.keys(byKey).sort(), ['bajaj finance', 'landlord sharma', 'netflix']);
  assert.strictEqual(byKey['landlord sharma'].kind, 'rent');
  assert.strictEqual(byKey['landlord sharma'].dueDay, 1);
  assert.strictEqual(byKey['bajaj finance'].kind, 'emi');
  assert.strictEqual(byKey['bajaj finance'].amount, 6200);
  assert.strictEqual(byKey['netflix'].kind, 'subscription');
});

test('rent paid a few days early counts on its due day', () => {
  const bills = detectRecurringBills(history, at(2026, 10, 25));
  const early = debit('Landlord Sharma', 15000, 2026, 10, 29, 'rent');
  assert.strictEqual(attributedTime(early, bills), mid(2026, 11, 1));
  const onTime = debit('Landlord Sharma', 15000, 2026, 11, 1, 'rent');
  assert.strictEqual(attributedTime(onTime, bills), onTime.timestamp);
  const late = debit('Landlord Sharma', 15000, 2026, 11, 4, 'rent');
  assert.strictEqual(attributedTime(late, bills), late.timestamp);
  const other = debit('Swiggy', 400, 2026, 10, 29, 'food');
  assert.strictEqual(attributedTime(other, bills), other.timestamp);
});

test('bills due in a window, marked paid when a payment was made', () => {
  const bills = detectRecurringBills(history, at(2026, 10, 25));
  const txs = [...history, debit('Landlord Sharma', 15000, 2026, 10, 30, 'rent')];
  const dues = billsDueBetween(bills, txs, mid(2026, 10, 31), mid(2026, 11, 30) - 1);
  const summary = dues.map((d) => [d.bill.key, new Date(d.dueAt).getDate(), d.paid]);
  assert.deepStrictEqual(summary, [
    ['landlord sharma', 1, true],
    ['bajaj finance', 5, false],
    ['netflix', 12, false],
  ]);
});

test('pacing expects rent and EMI early instead of calling it overspending', () => {
  const bills = detectRecurringBills(history, at(2026, 10, 25));
  const start = mid(2026, 10, 31);
  const end = mid(2026, 11, 30) - 1;
  const txs = [...history, debit('Landlord Sharma', 15000, 2026, 11, 1, 'rent'), debit('Bajaj Finance', 6200, 2026, 11, 5, 'emi_loans')];
  const dues = billsDueBetween(bills, txs, start, end);
  // Day 6: rent + EMI paid, plus ₹1,800 everyday spending. Budget ₹40,000.
  const p = billAwarePacing(40000, 15000 + 6200 + 1800, start, end, at(2026, 11, 5, 20), dues);
  assert.strictEqual(p.billsTotal, 15000 + 6200 + 649);
  assert.strictEqual(p.billsUnpaid, 649);
  assert.ok(p.expectedByToday > 21200, `expected ${p.expectedByToday} to include the bills`);
  assert.ok(p.projectedSpend < 40000, `projected ${p.projectedSpend} should be under budget`);
  // Old way: 23,000 in 6 days → ~115,000 projected.
  assert.strictEqual(p.everydayPerDay, 300);
  assert.strictEqual(p.dailySafeSpend, Math.round((40000 - 23000 - 649) / 25));
});

test('safe to spend sets aside bills due before salary', () => {
  const bills = detectRecurringBills(history, at(2026, 10, 25));
  const dues = billsDueBetween(bills, history, mid(2026, 11, 2), mid(2026, 11, 7));
  const s = safeToSpend(10000, dues, 5);
  assert.strictEqual(s.billsBeforeSalary, 6200);
  assert.strictEqual(s.perDay, Math.floor((10000 - 6200) / 5));
  assert.strictEqual(safeToSpend(3000, dues, 5).perDay, 0);
  assert.strictEqual(safeToSpend(0, [], 5).perDay, null);
});

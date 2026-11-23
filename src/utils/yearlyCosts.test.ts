import assert from 'node:assert';
import { test } from 'node:test';
import { isPaymentOfYearly, setAsidePerDay, setAsidePerMonth, yearlyDueSoon, yearlyMatcher } from './yearlyCosts.ts';
import { monthSummary } from './monthSummary.ts';
import { describeCycle } from './cycleLabels.ts';
import { resolveCycle } from './moneyCycle.ts';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
const fees = { id: 'f', name: 'School fees', amount: 40000, month: 5, category: 'education' }; // June
const premium = { id: 'p', name: 'LIC premium', amount: 24000, month: 2 }; // March, no category

test('recognises the yearly payment by category or by name, not small spends', () => {
  assert.strictEqual(isPaymentOfYearly({ amount: 40000, category: 'education', type: 'debit' }, fees), true);
  assert.strictEqual(isPaymentOfYearly({ amount: 20000, category: 'education', type: 'debit' }, fees), true); // first instalment
  assert.strictEqual(isPaymentOfYearly({ amount: 800, category: 'education', type: 'debit' }, fees), false); // books
  assert.strictEqual(isPaymentOfYearly({ amount: 24000, merchant: 'LIC OF INDIA', type: 'debit' }, premium), true);
  assert.strictEqual(isPaymentOfYearly({ amount: 24000, merchant: 'Croma', type: 'debit' }, premium), false);
});

test('set aside a twelfth a month', () => {
  assert.strictEqual(setAsidePerMonth([fees, premium]), Math.round((64000 / 365) * 365 / 12));
  assert.ok(Math.abs(setAsidePerDay([fees]) - 40000 / 365) < 1e-9);
  assert.strictEqual(yearlyMatcher([]), undefined);
});

test('due soon until paid', () => {
  const due = yearlyDueSoon([fees, premium], [], at(2027, 5, 10));
  assert.deepStrictEqual(due.map((d) => d.cost.id), ['f']);
  assert.strictEqual(due[0].daysAway, 22);
  const paid = yearlyDueSoon([fees], [{ amount: 40000, category: 'education', type: 'debit', timestamp: at(2027, 5, 28) }], at(2027, 6, 2));
  assert.deepStrictEqual(paid, []);
  assert.deepStrictEqual(yearlyDueSoon([fees], [], at(2027, 1, 10)), []);
});

test('the fee month is not compared with normal months, but still counted as money out', () => {
  const start = Date.now() - 5 * 86_400_000;
  const txs = [
    { id: '1', amount: 40000, category: 'education', type: 'debit', timestamp: Date.now() - 86_400_000 },
    { id: '2', amount: 1500, category: 'food', type: 'debit', timestamp: Date.now() - 86_400_000 },
  ];
  const r = monthSummary(txs, [], start, new Set(), false, () => '#fff', { hideComparison: true, isYearly: yearlyMatcher([fees]) });
  assert.strictEqual(r.out, 1500);
  assert.strictEqual(r.yearlyOut, 40000);
});

test('caption: second salary coming, yearly set-aside and due reminder', () => {
  const schedule = { kind: 'monthly' as const, secondPayday: 7, secondLabel: 'Partner’s salary' };
  const cycle = resolveCycle(at(2026, 11, 3), 1, [], schedule);
  const text = describeCycle(cycle, 1, null, new Date(2026, 10, 3), {
    safePerDay: 500,
    billsBeforeSalary: 0,
    yearlySetAsideMonthly: 5333,
    alsoComing: { amount: 45000, dueAt: new Date(2026, 10, 7).getTime(), label: 'Partner’s salary' },
    yearlyDue: [{ name: 'School fees', amount: 40000, monthName: 'December', daysAway: 28 }],
  });
  const lines = text.caption!.split('\n');
  assert.ok(lines.includes('Partner’s salary: ₹45,000 expected on 7 Nov.'), lines.join(' | '));
  assert.ok(lines.includes('₹500 a day is safe to spend after ₹5,333 a month for yearly costs.'), lines.join(' | '));
  assert.ok(lines.includes('School fees (₹40,000) is due in December.'), lines.join(' | '));
});

test('caption wording follows the pay schedule', () => {
  const weekly = resolveCycle(at(2026, 11, 18), null, [], { kind: 'weekly', weekday: 1 });
  const w = describeCycle(weekly, 0, null, new Date(2026, 10, 18));
  assert.strictEqual(w.label, 'this week');
  assert.strictEqual(w.previousLabel, 'last week');
  assert.ok(w.caption!.startsWith('Day 3 of 7. Next payout in 5 days.'), w.caption!);

  const rolling = resolveCycle(at(2026, 11, 18), null, [], { kind: 'irregular' });
  const r = describeCycle(rolling, 0, null, new Date(2026, 10, 18), { regularIn: 10000, out: 5000 });
  assert.strictEqual(r.label, 'the last 30 days');
  assert.strictEqual(r.caption, 'Your income isn’t on a fixed day, so this shows the last 30 days.');

  const calendar = describeCycle(resolveCycle(at(2026, 11, 18), null), null, null, new Date(2026, 10, 18), {
    yearlyDue: [{ name: 'Diwali', amount: 15000, monthName: 'November', daysAway: 0 }],
  });
  assert.strictEqual(calendar.caption, 'Diwali (₹15,000) is due this month.');
});

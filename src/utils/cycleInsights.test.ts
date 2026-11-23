import assert from 'node:assert';
import { test } from 'node:test';
import { monthSummary, windfallChecker } from './monthSummary.ts';
import { resolveCycle, usualWindows } from './moneyCycle.ts';
import { describeCycle } from './cycleLabels.ts';

const color = () => '#fff';
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const start = now - 5 * DAY;
const debit = (amount: number, ts: number, category = 'food') => ({ id: `${amount}-${ts}`, amount, type: 'debit', category, timestamp: ts });

test('comparison is the median of past windows, so one odd cycle does not skew it', () => {
  const windows = [0, 1, 2].map((i) => ({ start: start - (i + 1) * 30 * DAY, end: start - (i + 1) * 30 * DAY + 5 * DAY }));
  const txs = [
    debit(500, now - DAY),
    debit(1000, windows[0].start + DAY),
    debit(9000, windows[1].start + DAY), // the odd one
    debit(1200, windows[2].start + DAY),
  ];
  const r = monthSummary(txs, [], start, new Set(), false, color, { prevWindows: windows, hideComparison: false });
  assert.strictEqual(r.out, 500);
  assert.strictEqual(r.previousSpentSamePeriod, 1200);
  assert.strictEqual(r.categories[0].previousValue, 1200);
});

test('a bill attributed to a cycle that has not started is left out for now', () => {
  const rentPaidEarly = debit(15000, now - DAY, 'rent');
  const coffee = debit(200, now - DAY);
  const r = monthSummary([rentPaidEarly, coffee], [], start, new Set(), false, color, {
    hideComparison: true,
    timeOf: (tx) => (tx === rentPaidEarly ? now + 2 * DAY : Number(tx.timestamp)),
  });
  assert.strictEqual(r.out, 200);
});

test('a bill paid at the end of last cycle for this one counts now', () => {
  const rent = debit(15000, start - 2 * DAY, 'rent');
  const r = monthSummary([rent], [], start, new Set(), false, color, {
    hideComparison: true,
    timeOf: () => start + 1,
  });
  assert.strictEqual(r.out, 15000);
});

test('bonus and unusually large salary credits are windfalls', () => {
  const incomes = [
    { amount: 50000, category: 'salary', timestamp: start - 60 * DAY },
    { amount: 50000, category: 'salary', timestamp: start - 30 * DAY },
    { amount: 50000, category: 'salary', timestamp: start + DAY },
    { amount: 20000, category: 'bonus', timestamp: start + 2 * DAY },
    { amount: 3000, category: 'money_received', timestamp: start + 3 * DAY },
  ];
  const r = monthSummary([], incomes, start, new Set(), false, color, { hideComparison: true });
  assert.strictEqual(r.in, 73000);
  assert.strictEqual(r.windfallIn, 20000);
  const isWindfall = windfallChecker(incomes);
  assert.strictEqual(isWindfall({ amount: 140000, category: 'salary' }), true); // arrears paid as salary
  assert.strictEqual(isWindfall({ amount: 52000, category: 'salary' }), false);
});

test('usual windows skip odd-length cycles and line up with days elapsed', () => {
  const ts = (m: number, d: number) => new Date(2026, m - 1, d, 10).getTime();
  // Salary on the 7th; August salary came 20 days late (a 47-day cycle, then a 12-day one).
  const credits = [7, 8, 9, 10, 11].map((m) => ({ timestamp: ts(m, m === 8 ? 27 : 7), amount: 50000 }));
  const cycle = resolveCycle(ts(11, 12), 7, credits);
  const w = usualWindows(cycle, ts(11, 12), credits);
  assert.ok(w.length >= 2);
  for (const win of w) {
    const days = Math.round((win.end + 1 - win.start) / DAY);
    assert.strictEqual(days, 6, 'six days in, same as now');
  }
});

test('caption shows safe-to-spend and cycle vs income used', () => {
  const cycle = resolveCycle(new Date(2026, 10, 17, 12).getTime(), 7);
  const text = describeCycle(cycle, 7, null, new Date(2026, 10, 17), {
    safePerDay: 420,
    billsBeforeSalary: 6200,
    regularIn: 50000,
    out: 30000,
    comparedCycles: 3,
  });
  assert.deepStrictEqual(text.caption!.split('\n'), [
    'Day 11 of 30. Next salary in 20 days.',
    '₹420 a day is safe to spend after ₹6,200 of bills.',
    '37% of the cycle gone, 60% of your income used.',
  ]);
  assert.strictEqual(text.previousLabel, 'your usual');
});

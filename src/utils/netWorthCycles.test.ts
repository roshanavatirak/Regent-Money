import assert from 'node:assert';
import { test } from 'node:test';
import { buildFlows, createNetWorthModel, health, monthRows, periodPace, periodRows } from './netWorth.ts';
import { cycleStartsSince } from './moneyCycle.ts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();
const NOW = at(2026, 11, 16, 15);
const BANKS = new Set(['hdfc']);

// ₹50,000 salary on the last working day. September's came on 30 Sep, October's on 31 Oct
// would be normal, but 31 Oct 2026 is a Saturday so it came on 30 Oct; earlier months too.
// Spending: ₹40,000 a cycle, spread out. Live balance ₹60,000.
const salaryDays = [at(2026, 7, 31, 10), at(2026, 8, 31, 10), at(2026, 9, 30, 10), at(2026, 10, 30, 10)];
const incomes = salaryDays.map((ts, i) => ({ id: `s${i}`, amount: 50000, category: 'salary', timestamp: ts, bankProfileId: 'hdfc' }));
const spends: any[] = [];
for (let d = new Date(2026, 7, 1); d.getTime() < NOW; d.setDate(d.getDate() + 1)) {
  spends.push({ id: `x${d.getTime()}`, amount: 1300, type: 'debit', timestamp: d.getTime() + 18 * 3600_000, bankProfileId: 'hdfc' });
}
const flows = buildFlows({ transactions: spends, incomeRecords: incomes, bankIds: BANKS, isExcluded: () => false });
const model = createNetWorthModel({ now: NOW, accountsNowMinor: 6_000_000, flows, anchors: [], peerNowMinor: 0, peerDeltas: [] });
const credits = incomes.map((i) => ({ timestamp: i.timestamp, amount: i.amount }));

test('cycle starts are the days salary actually landed', () => {
  const starts = cycleStartsSince(model.trackingStart, NOW, 31, credits);
  const days = starts.map((s) => new Date(s).toDateString());
  assert.deepStrictEqual(days.slice(-3), [
    new Date(2026, 7, 31).toDateString(),
    new Date(2026, 8, 30).toDateString(),
    new Date(2026, 9, 30).toDateString(),
  ]);
});

test('cycle rows run pre-salary to pre-salary and chain without gaps', () => {
  const starts = cycleStartsSince(model.trackingStart, NOW, 31, credits);
  const rows = periodRows(model, flows, starts);
  for (let i = 1; i < rows.length; i++) {
    assert.strictEqual(rows[i].openMinor, rows[i - 1].closeMinor, 'each opens where the last closed');
    assert.strictEqual(rows[i].fromTs, rows[i - 1].endTs + 1);
  }
  const total = rows.reduce((s, r) => s + r.changeMinor, 0);
  assert.strictEqual(total, model.liveMinor - rows[0].openMinor);
  // Every full cycle has exactly one salary in it.
  for (const r of rows.filter((x) => !x.isCurrent && !x.isPartial)) {
    assert.strictEqual(r.inMinor, 5_000_000);
  }
});

test('calendar months see two salaries in one month and none in the next; cycles do not', () => {
  // Shift September's salary to 1 Oct (a "1st" earner whose payday fell on a weekend and came late).
  const shifted = incomes.map((i) => (i.id === 's2' ? { ...i, timestamp: at(2026, 10, 1, 10) } : i));
  const f = buildFlows({ transactions: spends, incomeRecords: shifted, bankIds: BANKS, isExcluded: () => false });
  const m = createNetWorthModel({ now: NOW, accountsNowMinor: 6_000_000, flows: f, anchors: [], peerNowMinor: 0, peerDeltas: [] });
  const months = monthRows(m, f);
  const sep = months.find((r) => new Date(r.monthStart).getMonth() === 8)!;
  const oct = months.find((r) => new Date(r.monthStart).getMonth() === 9)!;
  assert.strictEqual(sep.inMinor, 0);
  assert.strictEqual(oct.inMinor, 10_000_000);
  assert.ok(sep.changeMinor < 0 && oct.changeMinor > 0, 'calendar months swing');

  const c = shifted.map((i) => ({ timestamp: i.timestamp, amount: i.amount }));
  const cycles = periodRows(m, f, cycleStartsSince(m.trackingStart, NOW, 31, c)).filter((r) => !r.isCurrent && !r.isPartial);
  for (const r of cycles) assert.strictEqual(r.inMinor, 5_000_000, 'one salary per cycle');
});

test('health over cycles uses the real cycle lengths for runway', () => {
  const rows = periodRows(model, flows, cycleStartsSince(model.trackingStart, NOW, 31, credits));
  const h = health(model, rows);
  assert.ok(h.avgGrowthMinor !== null);
  // ₹1,300 a day spending → 60,000 / 1,300 ≈ 46 days.
  assert.strictEqual(h.runwayDays, Math.floor(6_000_000 / 130_000));
});

test('cycle pace counts days from the salary day', () => {
  const starts = cycleStartsSince(model.trackingStart, NOW, 31, credits);
  const cur = starts[starts.length - 1];
  const pace = periodPace(model, cur, NOW + 86_400_000);
  assert.strictEqual(pace[0].day, 1);
  // 30 Oct to 16 Nov is 18 days.
  assert.strictEqual(pace[pace.length - 1].day, 18);
});

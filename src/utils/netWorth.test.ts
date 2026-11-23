import assert from 'node:assert';
import { test } from 'node:test';
import {
  accountChanges,
  bridgeSince,
  buildFlows,
  buildPeerDeltas,
  createNetWorthModel,
  health,
  monthPace,
  monthRows,
  milestonePlan,
  monthsUntil,
  rangeStats,
} from './netWorth.ts';
import { repaidToLetGoLoans } from '../services/peerLedgerSelectors.ts';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();
const NOW = at(2026, 11, 16, 15);
const BANKS = new Set(['hdfc', 'cash']);
const notExcluded = () => false;

const flowsFrom = (transactions: any[], incomeRecords: any[] = [], extra: Partial<Parameters<typeof buildFlows>[0]> = {}) =>
  buildFlows({ transactions, incomeRecords, bankIds: BANKS, isExcluded: notExcluded, ...extra });

const model = (flows: ReturnType<typeof buildFlows>, over: Partial<Parameters<typeof createNetWorthModel>[0]> = {}) =>
  createNetWorthModel({ now: NOW, accountsNowMinor: 2_510_470, flows, anchors: [], peerNowMinor: 0, peerDeltas: [], ...over });

test('buildFlows signs debits and credits, skips deleted, unlinked and duplicate rows', () => {
  const flows = flowsFrom(
    [
      { id: 'a', amount: 500, type: 'debit', timestamp: at(2026, 11, 2), bankProfileId: 'hdfc' },
      { id: 'a', amount: 500, type: 'debit', timestamp: at(2026, 11, 2), bankProfileId: 'hdfc' },
      { id: 'b', amount: 900, type: 'debit', timestamp: at(2026, 11, 3), bankProfileId: 'hdfc', isDeleted: true },
      { id: 'c', amount: 700, type: 'debit', timestamp: at(2026, 11, 4), bankProfileId: 'old-bank' },
      { id: 'd', amount: '1,250.50', type: 'debit', timestamp: at(2026, 11, 5), bankProfileId: 'hdfc', referenceId: 'r1' },
    ],
    [
      { id: 'i1', amount: 2000, timestamp: at(2026, 11, 1), bankProfileId: 'hdfc' },
      { id: 'i2', amount: 1250.5, timestamp: at(2026, 11, 5, 9), bankProfileId: 'hdfc', referenceId: 'r1' },
    ],
  );
  assert.deepStrictEqual(
    flows.map((f) => f.minor),
    [200_000, -50_000, -125_050],
  );
});

test('an ATM withdrawal after the cash wallet started tracking does not change the total', () => {
  const flows = flowsFrom(
    [{ id: 'w', amount: 2000, type: 'debit', category: 'cash_withdrawals', timestamp: at(2026, 11, 10), bankProfileId: 'hdfc' }],
    [],
    { cash: { id: 'cash', cashTrackingSince: at(2026, 11, 1) }, isExcluded: () => true },
  );
  assert.strictEqual(flows.length, 2);
  assert.strictEqual(flows.reduce((s, f) => s + f.minor, 0), 0);
  assert.ok(flows.every((f) => !f.counted));
});

test('history is worked backwards from the live balance', () => {
  const flows = flowsFrom(
    [{ id: 'd1', amount: 1000, type: 'debit', timestamp: at(2026, 11, 10), bankProfileId: 'hdfc' }],
    [{ id: 'i1', amount: 5000, timestamp: at(2026, 11, 5), bankProfileId: 'hdfc' }],
  );
  const m = model(flows);
  // Live 25,104.70. Before the 1,000 debit it was 26,104.70; before the 5,000 credit, 21,104.70.
  assert.strictEqual(m.valueAt(at(2026, 11, 12)), 2_510_470);
  assert.strictEqual(m.valueAt(at(2026, 11, 7)), 2_610_470);
  assert.strictEqual(m.valueAt(at(2026, 11, 4)), 2_110_470);
  assert.strictEqual(m.series[0].minor, 2_110_470);
  assert.strictEqual(m.series[m.series.length - 1].minor, 2_510_470);
  assert.strictEqual(m.daysTracked, 11);
});

test('with nothing recorded, tracking starts today and nothing is compared', () => {
  const m = model([]);
  assert.strictEqual(m.daysTracked, 0);
  assert.strictEqual(m.series.length, 2);
  const stats = rangeStats(m, at(2026, 5, 16));
  assert.strictEqual(stats.changeMinor, 0);
});

test('a server snapshot is a fixed point and the unexplained gap is reported as untracked', () => {
  const flows = flowsFrom(
    [{ id: 'd1', amount: 3000, type: 'debit', timestamp: at(2026, 11, 8), bankProfileId: 'hdfc' }],
    [{ id: 'i1', amount: 7000, timestamp: at(2026, 11, 3), bankProfileId: 'hdfc' }],
  );
  // Snapshot says 21,604.70 at the end of October; transactions alone would say 21,104.70.
  const monthEnd = at(2026, 11, 1, 0) - 1;
  const m = model(flows, { anchors: [{ ts: monthEnd, minor: 2_160_470 }] });
  assert.strictEqual(m.valueAt(monthEnd), 2_160_470);
  // Half-way between the snapshot and now, half of the unexplained 500 has been applied.
  const midway = monthEnd + Math.round((NOW - monthEnd) / 2);
  assert.strictEqual(m.valueAt(midway), 2_160_470 + 700_000 - 300_000 - 25_000);

  const bridge = bridgeSince(m, flows, at(2026, 11, 1, 0));
  assert.strictEqual(bridge.startMinor, 2_160_470);
  assert.strictEqual(bridge.inMinor, 700_000);
  assert.strictEqual(bridge.outMinor, 300_000);
  assert.strictEqual(bridge.untrackedMinor, -50_000);
  assert.strictEqual(
    bridge.startMinor + bridge.inMinor - bridge.outMinor + bridge.movedMinor + bridge.untrackedMinor,
    bridge.nowMinor,
  );
});

test('money lent stays in net worth: the bank debit and the loan cancel out', () => {
  const flows = flowsFrom(
    [{ id: 'l1', amount: 2500, type: 'debit', category: 'peer_lend', timestamp: at(2026, 11, 6, 12), bankProfileId: 'hdfc' }],
    [],
    { isExcluded: (tx: any) => String(tx.category).startsWith('peer_') },
  );
  const peerDeltas = buildPeerDeltas([
    { id: 'p1', kind: 'LEND', amount: 250_000, date: '2026-11-06' },
    { id: 'p2', kind: 'LEND', amount: 90_000, date: '2026-11-07', deletedAt: 1 },
  ]);
  const m = model(flows, { accountsNowMinor: 2_260_470, peerNowMinor: 250_000, peerDeltas });
  assert.strictEqual(m.liveMinor, 2_510_470);
  assert.strictEqual(m.valueAt(at(2026, 11, 5)), 2_510_470);
  const bridge = bridgeSince(m, flows, at(2026, 11, 1, 0));
  assert.strictEqual(bridge.movedMinor, 0);
  assert.strictEqual(bridge.untrackedMinor, 0);
});

test('let-go loans do not push past net worth below zero', () => {
  const entries: any[] = [
    { id: 'o1', contactId: 'k', kind: 'LEND', amount: 220_000, date: '2026-10-25', notExpectedBack: true, source: { type: 'manual', method: 'cash' }, createdAt: 1, updatedAt: 1 },
    { id: 'o2', contactId: 'k', kind: 'LEND', amount: 500_000, date: '2026-10-25', notExpectedBack: true, source: { type: 'manual', method: 'cash' }, createdAt: 1, updatedAt: 1 },
    { id: 'n', contactId: 'k', kind: 'LEND', amount: 550_000, date: '2026-11-15', source: { type: 'manual', method: 'cash' }, createdAt: 1, updatedAt: 1 },
    { id: 's', contactId: 's', kind: 'LEND', amount: 400_000, date: '2026-11-10', source: { type: 'manual', method: 'cash' }, createdAt: 1, updatedAt: 1 },
    { id: 'r1', contactId: 'k', kind: 'REPAY_RECEIVED', amount: 10_000, date: '2026-11-01', source: { type: 'manual', method: 'cash' }, createdAt: 1, updatedAt: 1 },
    { id: 'r2', contactId: 'k', kind: 'REPAY_RECEIVED', amount: 280_000, date: '2026-11-15', source: { type: 'manual', method: 'cash' }, createdAt: 1, updatedAt: 1 },
  ];
  // Today ₹6,700 is still owed: 5,500 + 4,000 − 2,800. The ₹100 of 1 Nov could only go to a
  // let-go loan (the open ones came later), so it is left out along with the ₹7,200.
  const peerDeltas = buildPeerDeltas(entries, repaidToLetGoLoans(entries));
  const m = model([], { accountsNowMinor: 36_374, peerNowMinor: 670_000, peerDeltas });
  assert.strictEqual(m.peerAt(at(2026, 9, 29)), 0); // was −₹7,200 before the fix
  assert.strictEqual(m.peerAt(at(2026, 11, 12)), 400_000); // only Sahil's ₹4,000 by then
});

test('a savings balance worked out below zero stops at zero (old money in was missed)', () => {
  // ₹500 today and ₹2,000 came in since, but the spending of the money before it was never
  // recorded: going back, the start would be −₹1,500.
  const flows = flowsFrom([], [{ id: 'c', amount: 2000, timestamp: at(2026, 11, 10), bankProfileId: 'hdfc' }]);
  const strict = model(flows, { accountsNowMinor: 50_000, accountsNeverNegative: true });
  assert.strictEqual(strict.valueAt(at(2026, 11, 9)), 0);
  assert.strictEqual(strict.valueAt(at(2026, 11, 11)), 50_000);
  const bridge = bridgeSince(strict, flows, at(2026, 11, 1, 0));
  assert.strictEqual(bridge.startMinor + bridge.inMinor - bridge.outMinor + bridge.movedMinor + bridge.untrackedMinor, bridge.nowMinor);
  // With a credit card or overdraft, a negative balance can be real: no floor.
  const loose = model(flows, { accountsNowMinor: 50_000 });
  assert.strictEqual(loose.valueAt(at(2026, 11, 9)), -150_000);
});

test('month rows chain together and add up to the total change', () => {
  const flows = flowsFrom(
    [
      { id: 'd1', amount: 4000, type: 'debit', timestamp: at(2026, 9, 20), bankProfileId: 'hdfc' },
      { id: 'd2', amount: 1000, type: 'debit', timestamp: at(2026, 10, 12), bankProfileId: 'hdfc' },
    ],
    [
      { id: 'i1', amount: 3000, timestamp: at(2026, 9, 1, 0), bankProfileId: 'hdfc' },
      { id: 'i2', amount: 6000, timestamp: at(2026, 10, 2), bankProfileId: 'hdfc' },
      { id: 'i3', amount: 2000, timestamp: at(2026, 11, 3), bankProfileId: 'hdfc' },
    ],
  );
  const m = model(flows);
  const rows = monthRows(m, flows);
  assert.deepStrictEqual(
    rows.map((r) => r.changeMinor),
    [-100_000, 500_000, 200_000],
  );
  assert.strictEqual(rows[0].isPartial, false);
  assert.strictEqual(rows[2].isCurrent, true);
  for (let i = 1; i < rows.length; i++) assert.strictEqual(rows[i].openMinor, rows[i - 1].closeMinor);
  assert.strictEqual(rows.reduce((s, r) => s + r.changeMinor, 0), m.liveMinor - m.series[0].minor);

  const h = health(m, rows);
  assert.strictEqual(h.avgGrowthMinor, 200_000);
  assert.strictEqual(h.avgMonths, 2);
  // Median of -1,000 and 5,000; best is 5,000.
  assert.strictEqual(h.typicalGrowthMinor, 200_000);
  assert.strictEqual(h.bestGrowthMinor, 500_000);
  assert.strictEqual(h.streakMonths, 2);
  assert.strictEqual(h.keptPct, 100);
  // Usual spending: (4,000 + 1,000) over September and October's 61 real days = 81.97 a day.
  assert.strictEqual(h.runwayDays, 306);
});

test('pace stops at today and measures from the month start', () => {
  const flows = flowsFrom(
    [{ id: 'd1', amount: 1000, type: 'debit', timestamp: at(2026, 11, 10), bankProfileId: 'hdfc' }],
    [{ id: 'i1', amount: 5000, timestamp: at(2026, 10, 5), bankProfileId: 'hdfc' }],
  );
  const m = model(flows);
  const pace = monthPace(m, NOW);
  assert.strictEqual(pace.length, 16);
  assert.strictEqual(pace[8].minor, 0);
  assert.strictEqual(pace[15].minor, -100_000);
  // October: tracking began on the 5th, so earlier days are left out.
  const october = monthPace(m, at(2026, 10, 15));
  assert.strictEqual(october[0].day, 5);
  assert.strictEqual(october[october.length - 1].day, 31);
  assert.strictEqual(october[0].minor, 500_000);
});

test('account balances are worked back per account', () => {
  const flows = flowsFrom(
    [{ id: 'd1', amount: 1000, type: 'debit', timestamp: at(2026, 11, 10), bankProfileId: 'hdfc' }],
    [{ id: 'i1', amount: 400, timestamp: at(2026, 11, 12), bankProfileId: 'cash' }],
  );
  const changes = accountChanges(
    [
      { id: 'hdfc', balanceMinor: 2_000_000 },
      { id: 'cash', balanceMinor: 180_000 },
    ],
    flows,
    at(2026, 10, 31, 23),
  );
  assert.deepStrictEqual(
    changes.map((c) => [c.thenMinor, c.changeMinor]),
    [
      [2_100_000, -100_000],
      [140_000, 40_000],
    ],
  );
});

test('milestone plan: estimate needs three full periods', () => {
  const now = at(2026, 11, 20);
  const base = { liveMinor: 2_542_893, targetMinor: 10_000_000, typicalGrowthMinor: 1_000_000, nowTs: now };
  const early = milestonePlan({ ...base, historyPeriods: 2 });
  assert.strictEqual(early.needsHistory, true);
  assert.strictEqual(early.periodsAtPace, null);
  const ready = milestonePlan({ ...base, historyPeriods: 3 });
  assert.strictEqual(ready.needsHistory, false);
  assert.strictEqual(ready.toGoMinor, 7_457_107);
  assert.strictEqual(ready.periodsAtPace, 8);
  assert.strictEqual(milestonePlan({ ...base, historyPeriods: 6, typicalGrowthMinor: 0 }).periodsAtPace, null);
});

test('milestone plan: pace needed for a chosen month', () => {
  const now = at(2026, 11, 20);
  const plan = milestonePlan({ liveMinor: 2_542_893, targetMinor: 10_000_000, typicalGrowthMinor: null, historyPeriods: 0, byTs: at(2027, 11, 1), nowTs: now });
  assert.strictEqual(plan.periodsLeft, 12);
  assert.strictEqual(plan.requiredPerPeriodMinor, 621_426);
  assert.strictEqual(monthsUntil(now, at(2026, 11, 28)), 1);
  const done = milestonePlan({ liveMinor: 10_500_000, targetMinor: 10_000_000, typicalGrowthMinor: null, historyPeriods: 0, byTs: at(2027, 1, 1), nowTs: now });
  assert.strictEqual(done.reached, true);
  assert.strictEqual(done.requiredPerPeriodMinor, null);
});

test('typical pace is the median, so one odd period cannot sink it', () => {
  const at0 = at(2026, 1, 1);
  const rows = [1_500_000, 1_600_000, -2_800_000, 1_400_000, 0].map((changeMinor, i) => ({
    monthStart: at0 + i, fromTs: at0 + i, endTs: at0 + i, days: 30, openMinor: 0, closeMinor: changeMinor,
    changeMinor, pct: null, inMinor: 3_000_000, outMinor: 0, isCurrent: i === 4, isPartial: false,
  }));
  const m = model(flowsFrom([], []));
  const h = health(m, rows);
  // Plain average of the four full months is ₹4,250; the median says ₹14,500.
  assert.strictEqual(h.avgGrowthMinor, 425_000);
  assert.strictEqual(h.typicalGrowthMinor, 1_450_000);
  assert.strictEqual(h.bestGrowthMinor, 1_600_000);
});

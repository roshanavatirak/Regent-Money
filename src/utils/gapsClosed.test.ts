import assert from 'node:assert';
import { test } from 'node:test';
import { resolveCycle, LATE_GRACE_DAYS } from './moneyCycle.ts';
import { planSalaryCycleRenewal, cyclePeriodLabel } from './cycleBudgets.ts';
import { describeCycle, cycleSummaryForAI } from './cycleLabels.ts';

const ts = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const mid = (y: number, m: number, d: number) => new Date(y, m - 1, d).getTime();
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const payout = (y: number, m: number, d: number, amount = 6000) => ({ timestamp: ts(y, m, d, 10), amount });
const weekly = { kind: 'weekly' as const, weekday: 1 }; // Mondays

test('weekly payout that lands a day late moves the week start', () => {
  const credits = [payout(2026, 11, 2), payout(2026, 11, 10)]; // Mon 2 Nov, then Tue 10 Nov
  const c = resolveCycle(ts(2026, 11, 12), null, credits, weekly);
  assert.strictEqual(ymd(c.start), '2026-11-10');
  assert.strictEqual(ymd(c.nextPayday), '2026-11-16');
});

test('weekly payout overdue: old week keeps going, "due" for 2 days, then "late"', () => {
  const credits = [payout(2026, 11, 2), payout(2026, 11, 9)];
  const due = resolveCycle(ts(2026, 11, 17), null, credits, weekly); // Mon 16 Nov missed, 1 day over
  assert.strictEqual(ymd(due.start), '2026-11-9');
  assert.strictEqual(due.lateDays, 0);
  assert.strictEqual(due.daysLeft, 0);
  const late = resolveCycle(ts(2026, 11, 19), null, credits, weekly); // 3 days over
  assert.strictEqual(late.lateDays, 3);
  assert.ok(LATE_GRACE_DAYS === 2);
});

test('weekly budgets renew each payout, never copying a monthly budget', () => {
  const cycle = resolveCycle(ts(2026, 11, 18), null, [], weekly);
  const label = cyclePeriodLabel(cycle);
  assert.strictEqual(label, 'Week of 16 Nov 2026');
  const lastWeek = {
    id: 'w1',
    name: 'Weekly budget (Week of 9 Nov 2026)',
    category: 'all',
    limitAmount: 3500,
    period: 'Week of 9 Nov 2026',
    periodType: 'monthly',
    startDate: mid(2026, 11, 9),
    endDate: mid(2026, 11, 16) - 1,
    isOverall: true,
  };
  const plan = planSalaryCycleRenewal([lastWeek], cycle);
  assert.strictEqual(plan.create!.period, 'Week of 16 Nov 2026');
  assert.strictEqual(plan.create!.name, 'Weekly budget (Week of 16 Nov 2026)');
  assert.strictEqual(plan.create!.startDate, mid(2026, 11, 16));

  const monthly = { ...lastWeek, id: 'm', name: 'Monthly budget (October 2026)', period: 'October 2026', startDate: mid(2026, 10, 1), endDate: mid(2026, 11, 1) - 1 };
  assert.strictEqual(planSalaryCycleRenewal([monthly], cycle).create, null);
});

test('every-2-weeks budgets are named by their dates', () => {
  const cycle = resolveCycle(ts(2026, 11, 18), null, [], { kind: 'fortnightly', anchor: mid(2026, 11, 6) });
  assert.strictEqual(cyclePeriodLabel(cycle), 'Payout 6 Nov – 19 Nov 2026');
});

test('caption during the grace days says "was due", not "late"', () => {
  const credits = [payout(2026, 9, 30, 50000), payout(2026, 10, 31, 50000)];
  const cycle = resolveCycle(ts(2026, 12, 1), 31, credits); // due Mon 30 Nov
  const text = describeCycle(cycle, 31, null, new Date(2026, 11, 1, 12));
  assert.strictEqual(text.caption!.split('\n')[0], 'Salary was due on 30 Nov. A bank holiday can delay it a day or two.');
});

test('Regent gets a plain summary of the pay cycle', () => {
  const salary = resolveCycle(ts(2026, 11, 17), 7, [], { kind: 'monthly', secondPayday: 15, secondLabel: 'Partner’s salary' });
  const s = cycleSummaryForAI(salary);
  assert.ok(s.startsWith('Paid monthly, salary on the 7th. Current salary cycle: 7 Nov to 6 Dec, day 11 of 30.'), s);
  assert.ok(s.includes('Partner’s salary'), s);
  assert.ok(cycleSummaryForAI(resolveCycle(ts(2026, 11, 17), null, [], weekly)).startsWith('Paid every week.'));
  assert.ok(cycleSummaryForAI(resolveCycle(ts(2026, 11, 17), null)).startsWith('No pay schedule set'));
});

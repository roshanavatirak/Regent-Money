import assert from 'node:assert';
import { test } from 'node:test';
import {
  resolveCycle,
  expectedPayday,
  isBankWorkingDay,
  isTransitionCycle,
  usualWindows,
  upcomingSecondSalary,
  cycleStartsSince,
} from './moneyCycle.ts';

const ts = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const salary = (y: number, m: number, d: number, amount = 50000) => ({ timestamp: ts(y, m, d, 10), amount });
const idx = (y: number, m: number) => y * 12 + (m - 1);

test('bank working days: Sundays, 2nd/4th Saturdays and national holidays are off', () => {
  assert.strictEqual(isBankWorkingDay(new Date(2026, 10, 15)), false); // Sunday
  assert.strictEqual(isBankWorkingDay(new Date(2026, 10, 14)), false); // 2nd Saturday
  assert.strictEqual(isBankWorkingDay(new Date(2026, 10, 7)), true); // 1st Saturday
  assert.strictEqual(isBankWorkingDay(new Date(2026, 7, 15)), false); // Independence Day
  assert.strictEqual(isBankWorkingDay(new Date(2027, 3, 1)), false); // 1 April, books closing
});

test('expected payday moves off holidays: month end earlier, other days later', () => {
  assert.strictEqual(ymd(expectedPayday(idx(2026, 2), 31)), '2026-2-27'); // 28th is 4th Saturday
  assert.strictEqual(ymd(expectedPayday(idx(2026, 11), 1)), '2026-11-2'); // 1 Nov is a Sunday
  assert.strictEqual(ymd(expectedPayday(idx(2026, 8), 15)), '2026-8-17'); // holiday, then Sunday
  assert.strictEqual(ymd(expectedPayday(idx(2026, 11), 7)), '2026-11-7'); // 1st Saturday: open
});

test('salary due on a Sunday is not "late" on that Sunday', () => {
  const credits = [salary(2026, 9, 1), salary(2026, 10, 1)];
  const c = resolveCycle(ts(2026, 11, 1), 1, credits); // Sunday
  assert.strictEqual(c.lateDays, 0);
  assert.strictEqual(ymd(c.nextPayday), '2026-11-2');
  assert.strictEqual(c.daysLeft, 1);
});

test('weekly payouts: 7-day cycles from the payout weekday', () => {
  const c = resolveCycle(ts(2026, 11, 18), null, [], { kind: 'weekly', weekday: 1 }); // Wed, paid Mondays
  assert.strictEqual(c.mode, 'weekly');
  assert.strictEqual(ymd(c.start), '2026-11-16');
  assert.strictEqual(ymd(c.nextPayday), '2026-11-23');
  assert.strictEqual(ymd(c.prevStart), '2026-11-9');
  assert.strictEqual(c.dayOfCycle, 3);
  assert.strictEqual(c.daysLeft, 5);
  // On payday itself a new week starts.
  assert.strictEqual(ymd(resolveCycle(ts(2026, 11, 23), null, [], { kind: 'weekly', weekday: 1 }).start), '2026-11-23');
});

test('every 2 weeks: cycles step 14 days from any known payday', () => {
  const schedule = { kind: 'fortnightly' as const, anchor: new Date(2026, 0, 2).getTime() };
  const c = resolveCycle(ts(2026, 11, 18), null, [], schedule);
  assert.strictEqual(c.mode, 'fortnightly');
  assert.strictEqual(c.totalDays, 14);
  assert.ok(c.start <= ts(2026, 11, 18) && ts(2026, 11, 18) < c.nextPayday);
  assert.strictEqual((c.start - new Date(2026, 0, 2).getTime()) % (14 * 86_400_000) < 3_600_000 * 2, true);
});

test('irregular income: the last 30 days, rolling', () => {
  const c = resolveCycle(ts(2026, 11, 18), 7, [], { kind: 'irregular' });
  assert.strictEqual(c.mode, 'rolling');
  assert.strictEqual(ymd(c.start), '2026-10-20');
  assert.strictEqual(ymd(c.prevStart), '2026-9-20');
  assert.strictEqual(c.dayOfCycle, 30);
  assert.strictEqual(c.daysLeft, 0);
});

test('a partner’s salary on the 7th never starts the cycle of a 1st-of-month earner', () => {
  const schedule = { kind: 'monthly' as const, secondPayday: 7, secondLabel: 'Partner’s salary' };
  // Main salary on 1 Oct, partner on 7 Oct and 7 Nov; main November salary is late (not in yet).
  const credits = [salary(2026, 10, 1), salary(2026, 10, 7, 45000), salary(2026, 11, 7, 45000)];
  const withSecond = resolveCycle(ts(2026, 11, 9), 1, credits, schedule);
  assert.strictEqual(ymd(withSecond.start), '2026-10-1');
  assert.ok(withSecond.lateDays > 0, 'main salary is late');
  // Without telling the app, the partner's credit would have been taken as the main salary.
  const without = resolveCycle(ts(2026, 11, 9), 1, credits);
  assert.strictEqual(ymd(without.start), '2026-11-7');
});

test('split salary: second part shows as coming until it lands', () => {
  const schedule = { kind: 'monthly' as const, secondPayday: 10, secondLabel: 'Allowance' };
  const credits = [salary(2026, 10, 1), salary(2026, 10, 12, 8000), salary(2026, 11, 2)];
  const cycle = resolveCycle(ts(2026, 11, 5), 1, credits, schedule);
  const coming = upcomingSecondSalary(cycle, credits, ts(2026, 11, 5));
  assert.ok(coming);
  assert.strictEqual(coming!.amount, 8000);
  assert.strictEqual(ymd(coming!.dueAt), '2026-11-10');
  assert.strictEqual(coming!.label, 'Allowance');
  const after = [...credits, salary(2026, 11, 10, 8000)];
  assert.strictEqual(upcomingSecondSalary(resolveCycle(ts(2026, 11, 11), 1, after, schedule), after, ts(2026, 11, 11)), null);
});

test('job change: an odd-length cycle is a transition and is left out of the usual', () => {
  assert.strictEqual(isTransitionCycle('salary', 45), true);
  assert.strictEqual(isTransitionCycle('salary', 30), false);
  assert.strictEqual(isTransitionCycle('weekly', 7), false);
  // Paid on the 7th. Changed jobs in October: the new employer's first salary came on the 17th.
  const credits = [salary(2026, 6, 7), salary(2026, 7, 7), salary(2026, 8, 7), salary(2026, 9, 7), salary(2026, 10, 17), salary(2026, 11, 7)];
  const now = ts(2026, 11, 12);
  const starts = cycleStartsSince(ts(2026, 6, 7), now, 7, credits);
  const lengths = starts.slice(1).map((s, i) => Math.round((s - starts[i]) / 86_400_000));
  assert.deepStrictEqual(lengths.slice(-2), [40, 21]);
  assert.ok(lengths.slice(-2).every((d) => isTransitionCycle('salary', d)));
  const windows = usualWindows(resolveCycle(now, 7, credits), now, credits);
  assert.ok(windows.length > 0);
  for (const w of windows) assert.ok(w.start < ts(2026, 9, 7, 0), 'no window from the job-change cycles');
});

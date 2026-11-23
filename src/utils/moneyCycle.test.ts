import assert from 'node:assert';
import { test } from 'node:test';
import { resolveCycle, cycleMonthFor, expectedCycleForMonth, samePointLastCycle, isSalaryPayday } from './moneyCycle.ts';

const ts = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const ymd = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};
const salary = (y: number, m: number, d: number, amount = 50000) => ({ timestamp: ts(y, m, d, 10), amount });

test('no salary day means calendar months', () => {
  for (const p of [null, undefined, 0]) {
    const c = resolveCycle(ts(2026, 11, 17), p);
    assert.strictEqual(c.mode, 'calendar');
    assert.strictEqual(ymd(c.start), '2026-11-1');
    assert.strictEqual(ymd(c.nextPayday), '2026-12-1');
    assert.strictEqual(ymd(c.prevStart), '2026-10-1');
    assert.strictEqual(c.dayOfCycle, 17);
    assert.strictEqual(c.totalDays, 30);
    assert.strictEqual(c.daysLeft, 14);
  }
  assert.strictEqual(isSalaryPayday(32), false);
});

test('salary day with no credits seen follows the expected dates', () => {
  const c = resolveCycle(ts(2026, 11, 17), 7);
  assert.strictEqual(c.mode, 'salary');
  assert.strictEqual(ymd(c.start), '2026-11-7');
  assert.strictEqual(ymd(c.nextPayday), '2026-12-7');
  assert.strictEqual(ymd(c.prevStart), '2026-10-7');
  assert.strictEqual(c.dayOfCycle, 11);
  assert.strictEqual(c.daysLeft, 20);
  assert.strictEqual(c.lateDays, 0);
});

test('month-end salary in February clamps and never starts in the future', () => {
  const c = resolveCycle(ts(2026, 3, 1), 31);
  // 28 Feb 2026 is the 4th Saturday (banks shut): month-end salary is expected on Friday the 27th.
  assert.strictEqual(ymd(c.start), '2026-2-27');
  assert.strictEqual(ymd(c.nextPayday), '2026-3-31');
});

test('cycle starts on the day salary actually lands', () => {
  // Due on the 31st, paid Friday the 30th.
  const credits = [salary(2026, 9, 30), salary(2026, 10, 30)];
  const c = resolveCycle(ts(2026, 11, 17), 31, credits);
  assert.strictEqual(ymd(c.start), '2026-10-30');
  assert.strictEqual(ymd(c.nextPayday), '2026-11-30');
  assert.strictEqual(ymd(c.prevStart), '2026-9-30');
});

test('early salary starts the next cycle early', () => {
  const credits = [salary(2026, 10, 7), salary(2026, 11, 4)];
  const c = resolveCycle(ts(2026, 11, 5), 7, credits);
  assert.strictEqual(ymd(c.start), '2026-11-4');
  assert.strictEqual(ymd(c.nextPayday), '2026-12-7');
  assert.strictEqual(ymd(c.prevStart), '2026-10-7');
});

test('late salary keeps the old cycle running instead of resetting', () => {
  const credits = [salary(2026, 9, 7), salary(2026, 10, 7)];
  const c = resolveCycle(ts(2026, 11, 10), 7, credits);
  assert.strictEqual(ymd(c.start), '2026-10-7');
  assert.strictEqual(ymd(c.nextPayday), '2026-11-7');
  assert.strictEqual(c.lateDays, 3);
  assert.strictEqual(c.daysLeft, 0);
  assert.strictEqual(ymd(c.end), '2026-11-10');
  assert.strictEqual(c.dayOfCycle, 35);
});

test('salary due today but not yet in is late by 0 days', () => {
  const credits = [salary(2026, 10, 7)];
  const c = resolveCycle(ts(2026, 11, 7, 9), 7, credits);
  assert.strictEqual(ymd(c.start), '2026-10-7');
  assert.strictEqual(c.lateDays, 0);
  assert.strictEqual(c.daysLeft, 0);
});

test('late salary that finally lands starts the new cycle that day', () => {
  const credits = [salary(2026, 10, 7), salary(2026, 11, 12)];
  const c = resolveCycle(ts(2026, 11, 13), 7, credits);
  assert.strictEqual(ymd(c.start), '2026-11-12');
  assert.strictEqual(ymd(c.prevStart), '2026-10-7');
  assert.strictEqual(c.lateDays, 0);
});

test('after the late window the expected date is used', () => {
  const credits = [salary(2026, 10, 7)];
  const c = resolveCycle(ts(2026, 11, 25), 7, credits);
  assert.strictEqual(ymd(c.start), '2026-11-7');
  assert.strictEqual(c.lateDays, 0);
});

test('a small credit tagged salary does not move the cycle', () => {
  // Reimbursement of 4,000 tagged salary three days before payday.
  const credits = [salary(2026, 9, 7), salary(2026, 10, 7), salary(2026, 11, 4, 4000)];
  const c = resolveCycle(ts(2026, 11, 5), 7, credits);
  assert.strictEqual(ymd(c.start), '2026-10-7');
});

test('two credits close together do not make a cycle shorter than 20 days', () => {
  // Salary paid late on 12 Oct, then on time 2 Nov (early window of 7 Nov): kept, 21 days.
  // A credit on 25 Oct would be ignored as a new cycle.
  const credits = [salary(2026, 10, 12), salary(2026, 10, 25)];
  const c = resolveCycle(ts(2026, 10, 27), 7, credits);
  assert.strictEqual(ymd(c.start), '2026-10-12');
});

test('cycle month naming: month-end salary is named for next month', () => {
  assert.strictEqual(ymd(cycleMonthFor(ts(2026, 10, 31), 31).getTime()), '2026-11-1');
  assert.strictEqual(ymd(cycleMonthFor(ts(2026, 11, 7), 7).getTime()), '2026-11-1');
  assert.strictEqual(ymd(cycleMonthFor(ts(2026, 12, 25), 25).getTime()), '2027-1-1');
});

test('expected cycle for a month', () => {
  const nov31 = expectedCycleForMonth(new Date(2026, 10, 1), 31);
  assert.strictEqual(ymd(nov31.start), '2026-10-31');
  assert.strictEqual(ymd(nov31.end), '2026-11-29');
  const mar31 = expectedCycleForMonth(new Date(2026, 2, 1), 31);
  assert.strictEqual(ymd(mar31.start), '2026-2-27');
  assert.strictEqual(ymd(mar31.end), '2026-3-30');
  const nov7 = expectedCycleForMonth(new Date(2026, 10, 1), 7);
  assert.strictEqual(ymd(nov7.start), '2026-11-7');
  assert.strictEqual(ymd(nov7.end), '2026-12-6');
});

test('every month has exactly one named cycle and they tile with no gaps', () => {
  for (const p of [1, 7, 15, 21, 25, 28, 30, 31]) {
    let prevEnd: number | null = null;
    for (let i = 0; i < 24; i++) {
      const c = expectedCycleForMonth(new Date(2026, i, 1), p);
      if (prevEnd !== null) assert.strictEqual(c.start, prevEnd + 1, `payday ${p}, month ${i}`);
      prevEnd = c.end;
    }
  }
});

test('same point last cycle matches elapsed days, capped at the previous cycle end', () => {
  const credits = [salary(2026, 9, 30), salary(2026, 10, 30)];
  const now = ts(2026, 11, 8);
  const c = resolveCycle(now, 31, credits);
  const w = samePointLastCycle(c, now);
  assert.strictEqual(ymd(w.start), '2026-9-30');
  // Day 10 of this cycle (30 Oct → 8 Nov) against day 10 of the last (30 Sep → 9 Oct).
  assert.strictEqual(ymd(w.end), '2026-10-9');
  // Day 31 of a long late cycle never runs into the current one.
  const late = resolveCycle(ts(2026, 11, 10), 7, [salary(2026, 9, 7), salary(2026, 10, 7)]);
  const lw = samePointLastCycle(late, ts(2026, 11, 10));
  assert.ok(lw.end <= late.start - 1);
});

test('every day over two years sits inside its own cycle', () => {
  const credits = [] as { timestamp: number; amount: number }[];
  for (let m = 0; m < 26; m++) credits.push(salary(2026, m + 1, 28));
  for (const p of [1, 7, 15, 28, 31]) {
    for (let t = ts(2026, 2, 1); t < ts(2027, 12, 31); t += 24 * 60 * 60 * 1000) {
      const c = resolveCycle(t, p, p === 28 ? credits : []);
      assert.ok(c.start <= t && t <= c.end, `payday ${p} on ${ymd(t)}: ${ymd(c.start)}–${ymd(c.end)}`);
      assert.ok(c.prevStart < c.start);
    }
  }
});

import assert from 'node:assert';
import { test } from 'node:test';
import { detectPayday, nextPayday, paydayInMonth, salaryCycleRange } from './payday.ts';

const ymd = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).getTime();

test('paydayInMonth clamps 29-31 to the last day of short months', () => {
  assert.strictEqual(ymd(paydayInMonth(2026, 1, 31)), '2026-2-28');
  assert.strictEqual(ymd(paydayInMonth(2028, 1, 30)), '2028-2-29');
  assert.strictEqual(ymd(paydayInMonth(2026, 3, 31)), '2026-4-30');
  assert.strictEqual(ymd(paydayInMonth(2026, -1, 31)), '2025-12-31');
  assert.strictEqual(ymd(paydayInMonth(2026, 12, 15)), '2027-1-15');
});

test('salaryCycleRange never starts in the future for payday 31', () => {
  // Old code returned a cycle starting 3 Mar when asked on 1 Mar.
  const r = salaryCycleRange(new Date(2026, 2, 1, 12), 31);
  assert.strictEqual(ymd(r.start), '2026-2-28');
  assert.strictEqual(ymd(r.end), '2026-3-30');
});

test('salaryCycleRange for payday 31 rolls over on the 31st', () => {
  const r = salaryCycleRange(new Date(2026, 2, 31, 9), 31);
  assert.strictEqual(ymd(r.start), '2026-3-31');
  assert.strictEqual(ymd(r.end), '2026-4-29');
});

test('salaryCycleRange for payday 1 is the calendar month', () => {
  const r = salaryCycleRange(new Date(2026, 1, 14), 1);
  assert.strictEqual(ymd(r.start), '2026-2-1');
  assert.strictEqual(ymd(r.end), '2026-2-28');
});

test('salaryCycleRange for payday 15 spans two months', () => {
  const before = salaryCycleRange(new Date(2026, 0, 14), 15);
  assert.strictEqual(ymd(before.start), '2025-12-15');
  assert.strictEqual(ymd(before.end), '2026-1-14');
  const on = salaryCycleRange(new Date(2026, 0, 15), 15);
  assert.strictEqual(ymd(on.start), '2026-1-15');
  assert.strictEqual(ymd(on.end), '2026-2-14');
});

test('salaryCycleRange covers every day of a year with no gaps or overlaps', () => {
  for (const payday of [1, 7, 15, 21, 29, 30, 31]) {
    let prevEnd: Date | null = null;
    for (let d = new Date(2027, 11, 1); d.getFullYear() < 2029; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const r = salaryCycleRange(d, payday);
      assert.ok(r.start.getTime() <= d.getTime() && d.getTime() <= r.end.getTime(), `payday ${payday} on ${ymd(d)}`);
      if (prevEnd && r.start.getTime() > prevEnd.getTime()) {
        const gap = new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1);
        assert.strictEqual(ymd(r.start), ymd(gap), `gap before ${ymd(r.start)} for payday ${payday}`);
      }
      prevEnd = r.end;
    }
  }
});

test('nextPayday clamps in February and treats today as received', () => {
  assert.strictEqual(ymd(nextPayday(new Date(2026, 1, 10), 31)), '2026-2-28');
  assert.strictEqual(ymd(nextPayday(new Date(2026, 1, 28), 31)), '2026-3-31');
  assert.strictEqual(ymd(nextPayday(new Date(2026, 0, 31), 31)), '2026-2-28');
});

test('detectPayday picks the usual day, not the biggest credit', () => {
  const credits = [
    { timestamp: at(2026, 7, 7), amount: 40000, isSalary: true },
    { timestamp: at(2026, 8, 7), amount: 40000, isSalary: true },
    { timestamp: at(2026, 9, 7), amount: 40000, isSalary: true },
    { timestamp: at(2026, 10, 20), amount: 120000, isSalary: true }, // arrears, one-off
  ];
  assert.strictEqual(detectPayday(credits), 7);
});

test('detectPayday treats last-working-day salary as end of month', () => {
  const credits = [
    { timestamp: at(2026, 7, 31), amount: 50000, isSalary: true },
    { timestamp: at(2026, 8, 28), amount: 50000, isSalary: true }, // paid early, still month end
    { timestamp: at(2026, 9, 30), amount: 50000, isSalary: true },
    { timestamp: at(2026, 10, 30), amount: 50000, isSalary: true },
  ];
  assert.strictEqual(detectPayday(credits), 31);
});

test('detectPayday ignores a one-off large credit without salary tags', () => {
  assert.strictEqual(detectPayday([{ timestamp: at(2026, 9, 12), amount: 80000, isSalary: false }]), null);
  const repeating = [
    { timestamp: at(2026, 8, 10), amount: 25000, isSalary: false },
    { timestamp: at(2026, 9, 10), amount: 25000, isSalary: false },
    { timestamp: at(2026, 9, 22), amount: 90000, isSalary: false },
  ];
  assert.strictEqual(detectPayday(repeating), 10);
});

test('detectPayday returns null with no credits', () => {
  assert.strictEqual(detectPayday([]), null);
});

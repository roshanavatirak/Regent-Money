// Budget pacing that expects fixed bills. Rent, EMI and SIP land in the first days after
// salary; spreading the whole budget evenly makes day 3 look "over budget" when it is normal.
//
// Expected spend by today = bills due by today + the rest of the budget spread evenly.
// Projected spend = spent so far + bills still to pay + everyday spending at its current pace.

import type { BillDue } from './recurringBills';

const DAY_MS = 24 * 60 * 60 * 1000;

const midnight = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};
const days = (a: number, b: number) => Math.round((midnight(b) - midnight(a)) / DAY_MS);

export interface BillPacing {
  totalDays: number;
  daysElapsed: number;
  /** Days left including today. */
  daysLeft: number;
  billsTotal: number;
  billsPaid: number;
  /** Bills due later in the period, not yet paid. */
  billsUnpaid: number;
  /** What a steady month would have spent by now: bills due so far + even share of the rest. */
  expectedByToday: number;
  /** Everyday (non-bill) spending per day so far. */
  everydayPerDay: number;
  projectedSpend: number;
  /** What can go on everyday spending each remaining day, after the bills still to come. */
  dailySafeSpend: number;
}

export function billAwarePacing(
  limit: number,
  spent: number,
  start: number,
  end: number,
  now: number,
  dues: BillDue[]
): BillPacing {
  const totalDays = Math.max(1, days(start, end) + 1);
  const daysElapsed = Math.max(1, Math.min(totalDays, days(start, now) + 1));
  const daysLeft = Math.max(1, totalDays - daysElapsed + 1);
  const today = midnight(now);

  const inPeriod = dues.filter((d) => d.dueAt >= midnight(start) && d.dueAt <= end);
  const billsTotal = inPeriod.reduce((s, d) => s + d.bill.amount, 0);
  const billsPaid = inPeriod.filter((d) => d.paid).reduce((s, d) => s + d.bill.amount, 0);
  const billsUnpaid = billsTotal - billsPaid;
  const billsDueByToday = inPeriod.filter((d) => d.dueAt <= today).reduce((s, d) => s + d.bill.amount, 0);

  const everydayLimit = Math.max(0, limit - billsTotal);
  const everydaySpent = Math.max(0, spent - billsPaid);
  const expectedByToday = Math.round(billsDueByToday + (everydayLimit * daysElapsed) / totalDays);
  const everydayPerDay = everydaySpent / daysElapsed;
  const projectedSpend = Math.round(spent + billsUnpaid + everydayPerDay * (totalDays - daysElapsed));
  const dailySafeSpend = Math.max(0, Math.round((limit - spent - billsUnpaid) / daysLeft));

  return {
    totalDays,
    daysElapsed,
    daysLeft,
    billsTotal,
    billsPaid,
    billsUnpaid,
    expectedByToday,
    everydayPerDay: Math.round(everydayPerDay),
    projectedSpend,
    dailySafeSpend,
  };
}

export interface SafeToSpend {
  /** Per day until next salary; null when there is nothing to divide. */
  perDay: number | null;
  /** Spending money now: bank and cash balances (not credit cards or overdraft). */
  balance: number;
  /** Bills due before next salary that are not paid yet. */
  billsBeforeSalary: number;
  daysLeft: number;
}

/** (Spendable balance − bills still to pay before salary) ÷ days until salary. */
export function safeToSpend(balance: number, unpaidBills: BillDue[], daysLeft: number): SafeToSpend {
  const billsBeforeSalary = unpaidBills.filter((d) => !d.paid).reduce((s, d) => s + d.bill.amount, 0);
  const d = Math.max(1, daysLeft);
  return {
    perDay: balance > 0 ? Math.max(0, Math.floor((balance - billsBeforeSalary) / d)) : null,
    balance,
    billsBeforeSalary,
    daysLeft: d,
  };
}

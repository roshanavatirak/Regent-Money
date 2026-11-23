/**
 * Payday date helpers. A payday of 29, 30 or 31 lands on the last day of shorter months
 * instead of rolling into the next month (new Date(2026, 1, 31) would be 3 March).
 */

const daysInMonth = (year: number, month: number): number => new Date(year, month + 1, 0).getDate();

/** Local midnight of `payday` in the given month, clamped to the month's last day. Month may be out of 0..11. */
export function paydayInMonth(year: number, month: number, payday: number): Date {
  const first = new Date(year, month, 1);
  const y = first.getFullYear();
  const m = first.getMonth();
  const day = Math.min(Math.max(1, Math.floor(payday) || 1), daysInMonth(y, m));
  return new Date(y, m, day);
}

/**
 * The salary cycle containing `now`: from the most recent payday (inclusive) to the day before
 * the next one. Both dates are local midnight; the caller sets end-of-day on `end`.
 */
export function salaryCycleRange(now: Date, payday: number): { start: Date; end: Date } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = new Date(y, m, now.getDate());
  const thisMonth = paydayInMonth(y, m, payday);
  const start = today.getTime() >= thisMonth.getTime() ? thisMonth : paydayInMonth(y, m - 1, payday);
  const next = paydayInMonth(start.getFullYear(), start.getMonth() + 1, payday);
  const end = new Date(next.getFullYear(), next.getMonth(), next.getDate() - 1);
  return { start, end };
}

/** The next payday strictly after today (today's payday counts as already received). */
export function nextPayday(now: Date, payday: number): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  const today = new Date(y, m, now.getDate());
  const thisMonth = paydayInMonth(y, m, payday);
  return thisMonth.getTime() > today.getTime() ? thisMonth : paydayInMonth(y, m + 1, payday);
}

export interface PaydayCredit {
  timestamp: number;
  amount: number;
  /** Tagged as salary (payroll, stipend) rather than just a large credit. */
  isSalary: boolean;
}

/** Days 28 to 31 all mean "end of month": salary paid on the last working day moves around inside it. */
const bucketOf = (date: Date): number => {
  const day = date.getDate();
  const last = daysInMonth(date.getFullYear(), date.getMonth());
  return day >= 28 && last - day <= 3 ? 31 : day;
};

/**
 * The usual payday, from credits. Uses the biggest salary credit of each month and picks the day
 * seen in the most months (ties go to the most recent). Without salary-tagged credits, falls back
 * to large credits, but only a day that repeats in at least two different months, so a one-off
 * FD maturity or repayment is not mistaken for salary. Returns 31 for "end of month".
 */
export function detectPayday(credits: PaydayCredit[], minLargeCredit = 5000): number | null {
  // Salary-tagged: one credit per month (the biggest), so arrears or a split credit don't count twice.
  // Untagged: every large credit counts, so a one-off big credit can't hide a day that repeats.
  const pick = (list: PaydayCredit[], minMonths: number, biggestPerMonth: boolean): number | null => {
    const kept = new Map<string, PaydayCredit>();
    for (const c of list) {
      const d = new Date(c.timestamp);
      if (!c.timestamp || isNaN(d.getTime())) continue;
      const month = `${d.getFullYear()}-${d.getMonth()}`;
      const key = biggestPerMonth ? month : `${month}-${bucketOf(d)}`;
      const prev = kept.get(key);
      if (!prev || c.amount > prev.amount) kept.set(key, c);
    }
    const byDay = new Map<number, { months: number; latest: number }>();
    for (const c of kept.values()) {
      const day = bucketOf(new Date(c.timestamp));
      const e = byDay.get(day) ?? { months: 0, latest: 0 };
      e.months += 1;
      e.latest = Math.max(e.latest, c.timestamp);
      byDay.set(day, e);
    }
    let best: number | null = null;
    let bestE = { months: 0, latest: 0 };
    for (const [day, e] of byDay) {
      if (e.months > bestE.months || (e.months === bestE.months && e.latest > bestE.latest)) {
        best = day;
        bestE = e;
      }
    }
    return best !== null && bestE.months >= minMonths ? best : null;
  };

  const salary = credits.filter((c) => c.isSalary && c.amount > 0);
  if (salary.length > 0) return pick(salary, 1, true);
  return pick(credits.filter((c) => c.amount >= minLargeCredit), 2, false);
}

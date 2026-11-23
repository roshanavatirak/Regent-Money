// Yearly costs (sinking funds): school fees, insurance premium, Diwali. Paid once a year, so
// the month they land looks like a disaster unless a twelfth is set aside every month.

const DAY_MS = 24 * 60 * 60 * 1000;

export interface YearlyCostLike {
  id: string;
  name: string;
  amount: number;
  /** Month it is usually paid, 0 = January. */
  month: number;
  category?: string | null;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const monthLabel = (m: number) => MONTHS[((m % 12) + 12) % 12];

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

/** Is this debit the payment of `cost`? Same category (or its name in the merchant), and at least 40% of the amount. */
export function isPaymentOfYearly(tx: any, cost: YearlyCostLike): boolean {
  if (!tx || tx.isDeleted || tx.type === 'credit') return false;
  const amount = Math.abs(Number(String(tx.amount).replace(/,/g, ''))) || 0;
  if (amount < cost.amount * 0.4) return false;
  const cat = String(tx.category || '').toLowerCase();
  if (cost.category && cat === cost.category.toLowerCase()) return true;
  const merchant = String(tx.merchant || '').toLowerCase();
  return words(cost.name).some((w) => merchant.includes(w));
}

/** A matcher over all yearly costs, for leaving their payments out of comparisons. */
export function yearlyMatcher(costs: YearlyCostLike[]): ((tx: any) => boolean) | undefined {
  if (!costs || costs.length === 0) return undefined;
  return (tx) => costs.some((c) => isPaymentOfYearly(tx, c));
}

/** What to put aside each day so every yearly cost is covered when it comes. */
export const setAsidePerDay = (costs: YearlyCostLike[]): number =>
  (costs || []).reduce((s, c) => s + (Number(c.amount) || 0), 0) / 365;

/** What to put aside each month. */
export const setAsidePerMonth = (costs: YearlyCostLike[]): number => Math.round(setAsidePerDay(costs) * 365 / 12);

export interface YearlyDue {
  cost: YearlyCostLike;
  /** Midnight on the 1st of the month it's due. */
  dueMonthStart: number;
  /** Whole days from today to the 1st of that month (0 when already in it). */
  daysAway: number;
}

/**
 * Yearly costs due within `withinDays` (or in the current month) that haven't been paid yet
 * in their due month.
 */
export function yearlyDueSoon(costs: YearlyCostLike[], txs: any[], now: number, withinDays = 45): YearlyDue[] {
  const today = new Date(now);
  const out: YearlyDue[] = [];
  for (const cost of costs || []) {
    let year = today.getFullYear();
    if (cost.month < today.getMonth()) year += 1;
    const dueMonthStart = new Date(year, cost.month, 1).getTime();
    const dueMonthEnd = new Date(year, cost.month + 1, 1).getTime() - 1;
    const daysAway = Math.max(0, Math.ceil((dueMonthStart - now) / DAY_MS));
    if (daysAway > withinDays) continue;
    // Paid already: anything matching from a month before the due month to its end.
    const from = new Date(year, cost.month - 1, 1).getTime();
    const paid = (txs || []).some((tx) => {
      const ts = Number(tx?.timestamp);
      return ts >= from && ts <= Math.min(dueMonthEnd, now) && isPaymentOfYearly(tx, cost);
    });
    if (!paid) out.push({ cost, dueMonthStart, daysAway });
  }
  return out.sort((a, b) => a.dueMonthStart - b.dueMonthStart);
}

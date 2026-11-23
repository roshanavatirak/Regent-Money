import { toMinor, fromMinor } from './money';
import { isExcludedFromBudget } from './budget';
import type { DashboardCategory } from '../navigation/HomeDashboard';

const toLabel = (key: string): string =>
  key === 'miscellaneous'
    ? 'Misc'
    : key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export interface MonthSummaryResult {
  out: number;
  in: number;
  /** Part of `in` that is a one-off: bonus, arrears, incentive, or a salary credit far above the usual. */
  windfallIn: number;
  /** Yearly costs paid this period, kept out of `out` (only with `isYearly`). */
  yearlyOut: number;
  categories: DashboardCategory[];
  previousSpentSamePeriod?: number;
}

export interface SummaryOptions {
  /** The matching stretch of the last cycle to compare against. */
  prev?: { start: number; end: number };
  /**
   * Matching stretches of several past cycles; the comparison is their median ("your usual"),
   * so one odd cycle doesn't skew it. Overrides `prev`.
   */
  prevWindows?: Array<{ start: number; end: number }>;
  hideComparison?: boolean;
  /**
   * When a debit counts, for cycle bucketing (a bill paid early counts on its due day).
   * A time later than now means it belongs to a cycle that hasn't started: left out for now.
   */
  timeOf?: (tx: any) => number;
  /**
   * Yearly costs (school fees, insurance premium): left out of `out`, categories and every
   * comparison window, and reported as `yearlyOut`, so the month they're paid isn't compared
   * with months they aren't.
   */
  isYearly?: (tx: any) => boolean;
}

const WINDFALL_WORDS = /bonus|arrear|incentive|variable pay|joining|award|ex.?gratia/;
const SALARY_WORDS = /salary|payroll|stipend/;

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

/** Credits that are one-offs rather than regular income. Uses all incomes to know the usual salary. */
export function windfallChecker(incomes: any[]): (inc: any) => boolean {
  const salaries = (incomes || [])
    .filter((i) => i && !i.isDeleted && SALARY_WORDS.test(`${i.category || ''} ${i.source || ''}`.toLowerCase()))
    .map((i) => Math.abs(Number(i.amount)) || 0)
    .filter((a) => a > 0);
  const usualSalary = salaries.length >= 2 ? median(salaries) : 0;
  return (inc: any) => {
    const text = `${inc.category || ''} ${inc.source || ''} ${inc.merchant || ''}`.toLowerCase();
    if (WINDFALL_WORDS.test(text)) return true;
    const amount = Math.abs(Number(inc.amount)) || 0;
    return usualSalary > 0 && SALARY_WORDS.test(text) && amount > usualSalary * 1.5;
  };
}

/**
 * Single-pass integer-paise month summary calculation.
 * Immune to IEEE-754 floating point drift during aggregation.
 * Leaves out only what isExcludedFromBudget says (Self transfer category, Borrow & Lend, manual exclusions).
 */
export function monthSummary(
  txs: any[],
  incomes: any[],
  monthStart: number,
  activeBankIds: Set<string>,
  isDark: boolean,
  getColor: (categoryKey: string, isDark?: boolean, index?: number) => string,
  /** For salary cycles. Without it, the same dates of last calendar month are compared. */
  options?: SummaryOptions,
): MonthSummaryResult {
  const now = new Date();
  const nowMs = now.getTime();
  const currentDay = now.getDate();
  // During first 3 days of a new month, pacing comparisons are statistically noisy
  const isEarlyMonth = options?.hideComparison ?? currentDay <= 3;

  // Clamp to last month's length: on 31 Mar, "same period" ends 28 Feb, not 3 Mar.
  const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
  const windows =
    options?.prevWindows && options.prevWindows.length > 0
      ? options.prevWindows
      : [
          {
            start: options?.prev?.start ?? new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime(),
            end:
              options?.prev?.end ??
              new Date(now.getFullYear(), now.getMonth() - 1, Math.min(currentDay, prevMonthDays), 23, 59, 59, 999).getTime(),
          },
        ];

  let outMinor = 0;
  let inMinor = 0;
  let windfallMinor = 0;
  let yearlyMinor = 0;
  const prevTotals = windows.map(() => 0);
  const prevMaps = windows.map(() => new Map<string, number>());
  const mapMinor = new Map<string, number>();

  for (const tx of txs) {
    if (
      !tx ||
      tx.isDeleted ||
      tx.type === 'credit' ||
      isExcludedFromBudget(tx)
    ) continue;
    // Same account filter as income below, so spending from a switched-off account isn't
    // counted against income that is.
    if (activeBankIds.size > 0 && tx.bankProfileId && !activeBankIds.has(tx.bankProfileId)) continue;
    const raw = Number(tx.timestamp);
    const ts = options?.timeOf ? options.timeOf(tx) : raw;
    // Paid early for a cycle that hasn't started yet.
    if (ts !== raw && ts > nowMs) continue;
    const m = Math.abs(toMinor(tx.amount));
    const key = (tx.category || 'other').toLowerCase().trim();

    if (options?.isYearly && options.isYearly(tx)) {
      if (ts >= monthStart) yearlyMinor += m;
      continue;
    }

    if (ts >= monthStart) {
      outMinor += m;
      mapMinor.set(key, (mapMinor.get(key) ?? 0) + m);
    } else if (!isEarlyMonth) {
      windows.forEach((w, i) => {
        if (ts >= w.start && ts <= w.end) {
          prevTotals[i] += m;
          prevMaps[i].set(key, (prevMaps[i].get(key) ?? 0) + m);
        }
      });
    }
  }

  const isWindfall = windfallChecker(incomes);
  for (const inc of incomes) {
    if (
      !inc ||
      inc.isDeleted ||
      Number(inc.timestamp) < monthStart ||
      isExcludedFromBudget(inc)
    ) continue;
    if (activeBankIds.size > 0 && inc.bankProfileId && !activeBankIds.has(inc.bankProfileId)) continue;
    // Purge any legacy synthetic mock income records
    if (inc.amount === 95000 && /^income_\d+_/.test(inc.id)) continue;
    const m = toMinor(inc.amount);
    inMinor += m;
    if (isWindfall(inc)) windfallMinor += m;
  }

  const prevFor = (key: string) => median(prevMaps.map((map) => map.get(key) ?? 0));

  const sorted = [...mapMinor.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const top: DashboardCategory[] = sorted.slice(0, 4).map(([key, valueMinor], index) => ({
    key,
    label: toLabel(key),
    value: fromMinor(valueMinor),
    previousValue: isEarlyMonth ? undefined : fromMinor(prevFor(key)),
    color: getColor(key, isDark, index),
  }));

  const rest = sorted.slice(4);
  if (rest.length > 0) {
    const topKeys = new Set(top.map((c) => c.key));
    const othersValueMinor = rest.reduce((s, [, v]) => s + v, 0);
    const othersPrevValueMinor = median(
      prevMaps.map((map) => [...map.entries()].filter(([k]) => !topKeys.has(k)).reduce((s, [, v]) => s + v, 0))
    );

    top.push({
      key: 'others',
      label: 'Others',
      value: fromMinor(othersValueMinor),
      previousValue: isEarlyMonth ? undefined : fromMinor(othersPrevValueMinor),
      color: getColor('other', isDark, 4),
    });
  }

  return {
    out: fromMinor(outMinor),
    in: fromMinor(inMinor),
    windfallIn: fromMinor(windfallMinor),
    yearlyOut: fromMinor(yearlyMinor),
    categories: top,
    previousSpentSamePeriod: isEarlyMonth ? undefined : fromMinor(median(prevTotals)),
  };
}

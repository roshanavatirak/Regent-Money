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
  categories: DashboardCategory[];
  previousSpentSamePeriod?: number;
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
): MonthSummaryResult {
  const now = new Date();
  const currentDay = now.getDate();
  // During first 3 days of a new month, pacing comparisons are statistically noisy
  const isEarlyMonth = currentDay <= 3;

  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0).getTime();
  const prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, currentDay, 23, 59, 59, 999).getTime();

  let outMinor = 0;
  let inMinor = 0;
  let prevSamePeriodMinor = 0;

  const mapMinor = new Map<string, number>();
  const prevMapMinor = new Map<string, number>();

  for (const tx of txs) {
    if (
      !tx ||
      tx.isDeleted ||
      tx.type === 'credit' ||
      isExcludedFromBudget(tx)
    ) continue;
    const ts = Number(tx.timestamp);
    const m = Math.abs(toMinor(tx.amount));
    const key = (tx.category || 'other').toLowerCase().trim();

    if (ts >= monthStart) {
      outMinor += m;
      mapMinor.set(key, (mapMinor.get(key) ?? 0) + m);
    } else if (!isEarlyMonth && ts >= prevStart && ts <= prevEnd) {
      prevSamePeriodMinor += m;
      prevMapMinor.set(key, (prevMapMinor.get(key) ?? 0) + m);
    }
  }

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
    inMinor += toMinor(inc.amount);
  }

  const sorted = [...mapMinor.entries()]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  const top: DashboardCategory[] = sorted.slice(0, 4).map(([key, valueMinor], index) => ({
    key,
    label: toLabel(key),
    value: fromMinor(valueMinor),
    previousValue: isEarlyMonth ? undefined : fromMinor(prevMapMinor.get(key) ?? 0),
    color: getColor(key, isDark, index),
  }));

  const rest = sorted.slice(4);
  if (rest.length > 0) {
    const topKeys = new Set(top.map((c) => c.key));
    const othersValueMinor = rest.reduce((s, [, v]) => s + v, 0);
    const othersPrevValueMinor = [...prevMapMinor.entries()]
      .filter(([k]) => !topKeys.has(k))
      .reduce((s, [, v]) => s + v, 0);

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
    categories: top,
    previousSpentSamePeriod: isEarlyMonth ? undefined : fromMinor(prevSamePeriodMinor),
  };
}


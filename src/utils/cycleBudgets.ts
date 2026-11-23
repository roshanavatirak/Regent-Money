// Keeping monthly budgets in step with salary cycles. Pure planning; budgetService applies it.
//
// In salary mode a "November" budget runs from the November cycle's payday to the day before
// the next one. When salary lands:
//   • the new cycle's budget is created from the last one (same limit, same category split);
//   • the last budget is closed the day before the new cycle starts;
//   • while salary is late, the current budget stretches day by day until it comes.

import { addMonths, format } from 'date-fns';
import { cycleMonthFor, type MoneyCycle } from './moneyCycle';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Don't bring back a budget the user stopped using long ago. */
const MAX_GAP_DAYS = 45;

export interface CycleBudgetLike {
  id: string;
  name?: string;
  category?: string;
  limitAmount: number;
  period?: string;
  periodType?: string;
  startDate?: number | string;
  endDate?: number | string;
  isOverall?: boolean;
  parentBudgetId?: string;
  isPaused?: boolean;
  isDeleted?: boolean;
  customCategoryDef?: any;
}

export interface RenewalPlan {
  /** Date changes for existing budgets (overall and their category splits). */
  updates: Array<{ id: string; startDate: number; endDate: number }>;
  /** A budget to create for this cycle, copied from `source`. */
  create: null | {
    source: CycleBudgetLike;
    period: string;
    name: string;
    startDate: number;
    endDate: number;
    children: CycleBudgetLike[];
  };
}

const num = (v: any): number => (typeof v === 'number' ? v : v ? new Date(v).getTime() : 0);
const key = (s?: string) => (s || '').toLowerCase().trim();

/** Period label ("November 2026") for a cycle. */
/** Budget period name for a pay period that starts at `start` (and ends at `end`). */
export function payPeriodLabel(mode: MoneyCycle['mode'], start: number, end: number): string {
  if (mode === 'weekly') return `Week of ${format(start, 'd MMM yyyy')}`;
  return `Payout ${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`;
}

/** Period label for a cycle: "November 2026" (salary), "Week of 16 Nov 2026", "Payout 6 Nov – 19 Nov 2026". */
export const cyclePeriodLabel = (cycle: MoneyCycle): string =>
  cycle.mode === 'weekly' || cycle.mode === 'fortnightly'
    ? payPeriodLabel(cycle.mode, cycle.start, cycle.end)
    : format(cycleMonthFor(cycle.anchor, cycle.payday ?? 1), 'MMMM yyyy');

/** Labels each kind of budget is saved under, so a weekly budget never copies a monthly one. */
const LABEL_SHAPE: Record<string, RegExp> = {
  salary: /^[a-z]+ \d{4}$/i,
  weekly: /^week of /i,
  fortnightly: /^payout /i,
};
const NAME_PREFIX: Record<string, string> = { salary: 'Monthly budget', weekly: 'Weekly budget', fortnightly: 'Payout budget' };
const MAX_GAP: Record<string, number> = { salary: MAX_GAP_DAYS, weekly: 21, fortnightly: 35 };

/**
 * Keep budgets in step with pay periods: salary cycles (named by month), weekly payouts, or
 * payouts every 2 weeks. Calendar and rolling (irregular income) plan nothing.
 */
export function planSalaryCycleRenewal(budgets: CycleBudgetLike[], cycle: MoneyCycle): RenewalPlan {
  const plan: RenewalPlan = { updates: [], create: null };
  const mode = cycle.mode;
  if (mode === 'salary' ? !cycle.payday : mode !== 'weekly' && mode !== 'fortnightly') return plan;
  const shape = LABEL_SHAPE[mode];

  const live = budgets.filter((b) => b && !b.isDeleted);
  const overall = live.filter(
    (b) => b.isOverall && (!b.periodType || b.periodType === 'monthly') && num(b.startDate) > 0 && num(b.endDate) > 0
  );
  const childrenOf = (parent: CycleBudgetLike) =>
    live.filter(
      (b) =>
        !b.isOverall &&
        (!b.periodType || b.periodType === 'monthly') &&
        (b.parentBudgetId ? b.parentBudgetId === parent.id : key(b.period) === key(parent.period))
    );

  const label = cyclePeriodLabel(cycle);
  const prevLabel =
    mode === 'salary'
      ? format(addMonths(cycleMonthFor(cycle.anchor, cycle.payday!), -1), 'MMMM yyyy')
      : payPeriodLabel(mode, cycle.prevStart, cycle.start - 1);
  const current = overall.find((b) => key(b.period) === key(label));
  const previous = overall.find((b) => key(b.period) === key(prevLabel));

  const reshape = (b: CycleBudgetLike, startDate: number, endDate: number) => {
    if (num(b.startDate) === startDate && num(b.endDate) === endDate) return;
    for (const x of [b, ...childrenOf(b)]) plan.updates.push({ id: x.id, startDate, endDate });
  };

  // Last cycle's budget ends the day before this one starts (salary early or late).
  if (previous) reshape(previous, num(previous.startDate), cycle.start - 1);

  if (current) {
    reshape(current, cycle.start, cycle.end);
    return plan;
  }

  const source =
    previous ??
    [...overall]
      .filter((b) => num(b.endDate) < cycle.start && shape.test((b.period || '').trim()))
      .sort((a, b) => num(b.endDate) - num(a.endDate))[0];
  if (!source || source.isPaused) return plan;
  if ((cycle.start - num(source.endDate)) / DAY_MS > MAX_GAP[mode]) return plan;

  const autoName = /^(monthly|weekly|payout) budget \(.*\)$/i.test(source.name || '') || !source.name;
  plan.create = {
    source,
    period: label,
    name: autoName ? `${NAME_PREFIX[mode]} (${label})` : source.name!,
    startDate: cycle.start,
    endDate: cycle.end,
    children: childrenOf(source),
  };
  return plan;
}

import type { MoneyCycle } from './moneyCycle';

export const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** "on the 7th", or "at month end" for 31 (which also stands for the last working day). */
export const paydayPhrase = (payday: number): string => (payday >= 31 ? 'at month end' : `on the ${ordinal(payday)}`);

export interface CyclePeriodText {
  /** Fills "Spent in …". */
  label: string;
  /** Fills "… vs …". */
  previousLabel: string;
  /** Lines under Money in / Money out; null when there is nothing to say. */
  caption: string | null;
  /** The caption invites the user to set their salary day. */
  suggestsSetup: boolean;
}

export interface CycleExtras {
  /** Safe to spend per day until next pay, after bills and yearly set-aside; null when unknown. */
  safePerDay?: number | null;
  /** Unpaid bills due before next pay. */
  billsBeforeSalary?: number;
  /** Monthly amount set aside for yearly costs (already taken out of safePerDay). */
  yearlySetAsideMonthly?: number;
  /** Regular income in (bonus and other one-offs left out) and money out so far this cycle. */
  regularIn?: number;
  out?: number;
  /** How many past cycles the comparison is the usual of (1 = just last cycle). */
  comparedCycles?: number;
  /** A second salary (partner's, or second part of a split salary) still to come this cycle. */
  alsoComing?: { amount: number; dueAt: number; label: string } | null;
  /** Yearly costs due soon and not yet paid. */
  yearlyDue?: Array<{ name: string; amount: number; monthName: string; daysAway: number }>;
  /** Yearly costs paid this cycle, kept out of comparisons. */
  yearlyPaidOut?: number;
  /** The last cycle was much shorter or longer than usual (job change, very late salary). */
  lastCycleOdd?: boolean;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const dayMonth = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

/** Wording per kind of cycle. */
const WORDS: Record<MoneyCycle['mode'], { label: string; previous: string; next: string; unit: string }> = {
  calendar: { label: 'this month', previous: 'last month', next: 'month', unit: 'month' },
  salary: { label: 'this salary cycle', previous: 'last cycle', next: 'salary', unit: 'cycle' },
  weekly: { label: 'this week', previous: 'last week', next: 'payout', unit: 'week' },
  fortnightly: { label: 'these two weeks', previous: 'the two weeks before', next: 'payout', unit: 'cycle' },
  rolling: { label: 'the last 30 days', previous: 'the 30 days before', next: 'income', unit: '30 days' },
};

/** Lines that apply whatever the cycle: yearly costs. */
function yearlyLines(extras: CycleExtras): string[] {
  const lines: string[] = [];
  const due = extras.yearlyDue?.[0];
  if (due) {
    lines.push(
      due.daysAway === 0
        ? `${due.name} (${inr(due.amount)}) is due this month.`
        : `${due.name} (${inr(due.amount)}) is due in ${due.monthName}.`
    );
  }
  if (extras.yearlyPaidOut && extras.yearlyPaidOut > 0) {
    lines.push(`${inr(extras.yearlyPaidOut)} of yearly costs paid, left out of the comparison.`);
  }
  return lines;
}

/**
 * One plain paragraph about how the user is paid and where they are in the current cycle, for
 * Regent (the AI chat), so "this month" is read as the pay cycle the rest of the app shows.
 */
export function cycleSummaryForAI(cycle: MoneyCycle): string {
  const range = `${dayMonth(cycle.start)} to ${dayMonth(cycle.end)}`;
  switch (cycle.mode) {
    case 'calendar':
      return `No pay schedule set; the app uses calendar months. Current period: ${range}.`;
    case 'rolling':
      return `Income is on no fixed day; the app shows the last 30 days (${range}) and compares with the 30 days before.`;
    case 'weekly':
    case 'fortnightly': {
      const every = cycle.mode === 'weekly' ? 'every week' : 'every 2 weeks';
      return `Paid ${every}. Current pay period: ${range}, day ${cycle.dayOfCycle} of ${cycle.totalDays}; next payout in ${cycle.daysLeft} day(s).`;
    }
    case 'salary':
    default: {
      const parts = [
        `Paid monthly, salary ${paydayPhrase(cycle.payday ?? 1)}.`,
        `Current salary cycle: ${range}, day ${cycle.dayOfCycle} of ${cycle.totalDays}.`,
        cycle.lateDays > 0 ? `This month's salary is ${cycle.lateDays} day(s) late.` : `Next salary in ${cycle.daysLeft} day(s).`,
      ];
      const second = cycle.schedule?.secondPayday;
      if (second) parts.push(`A second salary (${cycle.schedule?.secondLabel || 'second salary'}) comes ${paydayPhrase(second)}.`);
      return parts.join(' ');
    }
  }
}

/** Words for the period on Home. Calendar mode keeps the month names it always showed. */
export function describeCycle(
  cycle: MoneyCycle,
  salaryDay: number | null,
  suggestedPayday: number | null,
  now: Date = new Date(),
  extras: CycleExtras = {}
): CyclePeriodText {
  if (cycle.mode === 'calendar') {
    const label = now.toLocaleDateString('en-IN', { month: 'long' });
    const previousLabel = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
    const lines = yearlyLines(extras);
    if (salaryDay === null && suggestedPayday !== null) {
      lines.unshift(`Your salary seems to come ${paydayPhrase(suggestedPayday)}. Track salary to salary?`);
      return { label, previousLabel, caption: lines.join('\n'), suggestsSetup: true };
    }
    return { label, previousLabel, caption: lines.length ? lines.join('\n') : null, suggestsSetup: false };
  }

  const w = WORDS[cycle.mode];
  const lines: string[] = [];

  if (cycle.mode === 'rolling') {
    lines.push('Your income isn’t on a fixed day, so this shows the last 30 days.');
  } else if (cycle.lateDays > 0) {
    lines.push(`Salary is ${cycle.lateDays} day${cycle.lateDays === 1 ? '' : 's'} late. This cycle keeps going until it comes.`);
  } else if (cycle.daysLeft === 0) {
    const what = cycle.mode === 'salary' ? 'Salary' : 'Payout';
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    lines.push(
      cycle.nextPayday < today
        ? `${what} was due on ${dayMonth(cycle.nextPayday)}. A bank holiday can delay it a day or two.`
        : `Day ${cycle.dayOfCycle} of this ${w.unit}. ${what} is due today.`
    );
  } else {
    const when = cycle.daysLeft === 1 ? 'tomorrow' : `in ${cycle.daysLeft} days`;
    lines.push(`Day ${cycle.dayOfCycle} of ${cycle.totalDays}. Next ${w.next} ${when}.`);
  }

  if (extras.alsoComing) {
    lines.push(`${extras.alsoComing.label}: ${inr(extras.alsoComing.amount)} expected on ${dayMonth(extras.alsoComing.dueAt)}.`);
  }

  // Safe to spend until next pay, after the bills still to come and the yearly set-aside.
  if (extras.safePerDay !== null && extras.safePerDay !== undefined && cycle.daysLeft > 0) {
    const parts: string[] = [];
    if (extras.billsBeforeSalary && extras.billsBeforeSalary > 0) parts.push(`${inr(extras.billsBeforeSalary)} of bills`);
    if (extras.yearlySetAsideMonthly && extras.yearlySetAsideMonthly > 0) parts.push(`${inr(extras.yearlySetAsideMonthly)} a month for yearly costs`);
    lines.push(`${inr(extras.safePerDay)} a day is safe to spend${parts.length ? ` after ${parts.join(' and ')}` : ''}.`);
  }

  // Share of the period gone against share of income used: fair across cycle lengths.
  if (cycle.mode !== 'rolling' && extras.regularIn && extras.regularIn > 0 && extras.out !== undefined && cycle.lateDays === 0) {
    const gone = Math.min(100, Math.round((cycle.dayOfCycle / cycle.totalDays) * 100));
    const used = Math.round((extras.out / extras.regularIn) * 100);
    lines.push(`${gone}% of the ${w.unit} gone, ${used}% of your income used.`);
  }

  lines.push(...yearlyLines(extras));

  if (extras.lastCycleOdd) {
    lines.push('Last cycle was unusually long or short (a job change or late salary), so it’s left out of your usual.');
  }

  const previousLabel = (extras.comparedCycles ?? 1) > 1 ? 'your usual' : w.previous;
  return { label: w.label, previousLabel, caption: lines.join('\n'), suggestsSetup: false };
}

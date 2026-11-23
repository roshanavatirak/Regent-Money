/**
 * Money Cycle: the period the app measures spending in.
 *
 * - Calendar mode (nothing set): 1st to last day of the month.
 * - Salary mode (salary day 1–31, 31 meaning month end): a cycle starts on the day salary
 *   actually lands, not on a fixed date. The salary day is only the forecast:
 *     • the forecast skips Sundays, 2nd/4th Saturdays and national bank holidays (month-end
 *       salary moves earlier, other days move later);
 *     • a salary credit up to 5 days early starts the new cycle early;
 *     • up to 12 days late, the old cycle keeps running ("salary late") instead of resetting;
 *     • with no salary credits seen at all (cash, untracked bank), the forecast is used;
 *     • a second salary on another day (a partner's, or the second part of a split salary)
 *       never starts a cycle; it is income inside it.
 * - Weekly / every 2 weeks (gig and contract work): fixed 7- or 14-day cycles.
 * - Irregular income (freelance, business): the last 30 days, rolling.
 */
import { paydayInMonth } from './payday';

const DAY_MS = 24 * 60 * 60 * 1000;
const EARLY_DAYS = 5;
const LATE_DAYS = 12;
const MIN_CYCLE_DAYS = 20;
/**
 * Days past the expected payday before pay counts as "late". Covers bank holidays no list can
 * know in advance (Diwali, Holi and Eid move every year; state holidays differ). Until then
 * pay is shown as "due".
 */
export const LATE_GRACE_DAYS = 2;
/** Weekly / every-2-weeks payouts: how early or late an actual payout can land and still count. */
const PAYOUT_EARLY_DAYS = 1;
const PAYOUT_LATE_DAYS = 3;

export type CycleMode = 'calendar' | 'salary' | 'weekly' | 'fortnightly' | 'rolling';

export type PayKind = 'monthly' | 'weekly' | 'fortnightly' | 'irregular';

/** How income arrives, beyond a single monthly salary day. */
export interface PaySchedule {
  kind: PayKind;
  /** Weekly: 0 = Sunday … 6 = Saturday. */
  weekday?: number | null;
  /** Every 2 weeks: any past payday (local midnight). */
  anchor?: number | null;
  /** Monthly: a second salary day 1–31 (partner's salary, or second part of a split salary). */
  secondPayday?: number | null;
  /** What the second salary is, in the user's words ("Partner's salary"). */
  secondLabel?: string | null;
}

export interface SalaryCredit {
  timestamp: number;
  amount: number;
}

export interface MoneyCycle {
  mode: CycleMode;
  /** Local midnight the cycle began. */
  start: number;
  /** Local midnight of the next payday (or the 1st of next month). In a late cycle this is the overdue payday. */
  nextPayday: number;
  /** Last millisecond the cycle is expected to run to (end of today while salary is late). */
  end: number;
  /** Start of the cycle before this one. */
  prevStart: number;
  /** Expected payday this cycle is named after (local midnight, before any holiday shift); the 1st in calendar mode. */
  anchor: number;
  /** 1 on the first day. */
  dayOfCycle: number;
  /** Expected length in days. */
  totalDays: number;
  /** Whole days until the next payday; 0 when it is today or overdue. */
  daysLeft: number;
  /** Days the salary is overdue, once past the grace days; 0 when not late. */
  lateDays: number;
  /** 1–31 in salary mode, null otherwise. */
  payday: number | null;
  /** The schedule this cycle was worked out from, so earlier cycles can be found the same way. */
  schedule?: PaySchedule | null;
}

const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

const addDays = (ts: number, days: number): number => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
};

/** Whole local days from a to b (both taken at midnight); safe across month lengths. */
const daysBetween = (a: number, b: number): number => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);

/** Is `payday` a real salary day (1–31)? null, undefined and 0 mean no monthly salary day. */
export const isSalaryPayday = (payday: number | null | undefined): payday is number =>
  typeof payday === 'number' && Number.isFinite(payday) && payday >= 1 && payday <= 31;

/* ------------------------------------------------------------------ */
/* Working days                                                        */
/* ------------------------------------------------------------------ */

/** National bank holidays on fixed dates (month is 0-based). 1 April: banks close their books. */
const FIXED_BANK_HOLIDAYS = new Set(['0-26', '3-1', '7-15', '9-2', '11-25']);

/** Banks are shut on Sundays, the 2nd and 4th Saturday, and national holidays. */
export function isBankWorkingDay(date: Date): boolean {
  const dow = date.getDay();
  if (dow === 0) return false;
  if (dow === 6) {
    const nth = Math.ceil(date.getDate() / 7);
    if (nth === 2 || nth === 4) return false;
  }
  return !FIXED_BANK_HOLIDAYS.has(`${date.getMonth()}-${date.getDate()}`);
}

/**
 * When salary is expected in a month: the payday, moved off a bank holiday. Month-end salary
 * (28th onwards) is paid on the last working day before; other days move to the next working day.
 * `monthIndex` is year * 12 + month.
 */
export function expectedPayday(monthIndex: number, payday: number): number {
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex - year * 12;
  const d = paydayInMonth(year, month, payday);
  const step = payday >= 28 ? -1 : 1;
  for (let i = 0; i < 7 && !isBankWorkingDay(d); i++) d.setDate(d.getDate() + step);
  return d.getTime();
}

const monthIndexOf = (ts: number) => {
  const d = new Date(ts);
  return d.getFullYear() * 12 + d.getMonth();
};

const nominalPayday = (monthIndex: number, payday: number) => {
  const year = Math.floor(monthIndex / 12);
  return paydayInMonth(year, monthIndex - year * 12, payday).getTime();
};

/* ------------------------------------------------------------------ */
/* Salary credits                                                      */
/* ------------------------------------------------------------------ */

/** Smallest distance between two days of the month, wrapping (30 and 1 are 1 apart, ignoring month length). */
const dayGap = (a: number, b: number) => {
  const diff = Math.abs(a - b);
  return Math.min(diff, 31 - diff);
};

/**
 * Credits that can start a cycle: at least half the usual (median) salary, and not the second
 * salary (a credit near the second payday that isn't also near the main one).
 */
function realSalaries(credits: SalaryCredit[], payday: number, secondPayday?: number | null): number[] {
  let valid = credits.filter((c) => c && c.timestamp > 0 && c.amount > 0);
  if (isSalaryPayday(secondPayday) && dayGap(secondPayday, payday) > 2) {
    valid = valid.filter((c) => {
      const day = new Date(c.timestamp).getDate();
      return !(dayGap(day, secondPayday) <= 2 && dayGap(day, payday) > 2);
    });
  }
  if (valid.length === 0) return [];
  const amounts = valid.map((c) => c.amount).sort((a, b) => a - b);
  const median = amounts[Math.floor(amounts.length / 2)];
  return valid
    .filter((c) => c.amount >= median * 0.5)
    .map((c) => c.timestamp)
    .sort((a, b) => a - b);
}

/** Day the salary for expected payday `expected` landed, if it has by `now`. */
function landedFor(expected: number, times: number[], now: number, notBefore = 0): number | null {
  const from = Math.max(addDays(expected, -EARLY_DAYS), notBefore);
  const to = Math.min(addDays(expected, LATE_DAYS + 1) - 1, now);
  for (const t of times) {
    if (t >= from && t <= to) return startOfDay(t);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Cycles                                                              */
/* ------------------------------------------------------------------ */

function fixedCycle(mode: CycleMode, start: number, next: number, prevStart: number, now: number, schedule?: PaySchedule | null): MoneyCycle {
  return {
    mode,
    start,
    nextPayday: next,
    end: next - 1,
    prevStart,
    anchor: start,
    dayOfCycle: daysBetween(start, now) + 1,
    totalDays: Math.max(1, daysBetween(start, next)),
    daysLeft: Math.max(0, daysBetween(now, next)),
    lateDays: 0,
    payday: null,
    schedule: schedule ?? null,
  };
}

function calendarCycle(now: number): MoneyCycle {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime();
  const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  return fixedCycle('calendar', start, next, prevStart, now);
}

/**
 * Weekly / every-2-weeks cycles, from the expected payout day `cur` (latest on or before today).
 * Like salary, a payout that actually lands a day early or up to 3 days late moves the start;
 * while one is overdue (and payouts are being seen), the old period keeps going.
 */
function steppedCycle(mode: 'weekly' | 'fortnightly', now: number, cur: number, step: number, times: number[], schedule: PaySchedule): MoneyCycle {
  const today = startOfDay(now);
  const next = addDays(cur, step);
  const prev = addDays(cur, -step);
  const landed = (expected: number): number | null => {
    const from = addDays(expected, -PAYOUT_EARLY_DAYS);
    const to = Math.min(addDays(expected, PAYOUT_LATE_DAYS + 1) - 1, now);
    const t = times.find((x) => x >= from && x <= to);
    return t === undefined ? null : startOfDay(t);
  };

  let start: number;
  let nextPayday: number;
  let lateDays = 0;
  const early = landed(next);
  const curLanded = landed(cur);
  if (early !== null) {
    start = early;
    nextPayday = addDays(next, step);
  } else if (curLanded !== null) {
    start = curLanded;
    nextPayday = next;
  } else {
    const prevLanded = landed(prev);
    if (prevLanded !== null && today <= addDays(cur, PAYOUT_LATE_DAYS)) {
      start = prevLanded;
      nextPayday = cur;
      const overdue = daysBetween(cur, today);
      lateDays = overdue > LATE_GRACE_DAYS ? overdue : 0;
    } else {
      start = cur;
      nextPayday = next;
    }
  }
  const prevStart = landed(addDays(nextPayday, -2 * step)) ?? addDays(nextPayday, -2 * step);
  const isLate = nextPayday <= today;
  return {
    mode,
    start,
    nextPayday,
    end: isLate ? addDays(today, 1) - 1 : nextPayday - 1,
    prevStart: Math.min(prevStart, start - 1),
    anchor: start,
    dayOfCycle: daysBetween(start, now) + 1,
    totalDays: Math.max(1, daysBetween(start, nextPayday)),
    daysLeft: Math.max(0, daysBetween(today, nextPayday)),
    lateDays,
    payday: null,
    schedule,
  };
}

function weeklyCycle(now: number, schedule: PaySchedule, times: number[]): MoneyCycle {
  const today = startOfDay(now);
  const weekday = Math.min(6, Math.max(0, Math.floor(Number(schedule.weekday) || 0)));
  const back = (new Date(today).getDay() - weekday + 7) % 7;
  return steppedCycle('weekly', now, addDays(today, -back), 7, times, schedule);
}

function fortnightlyCycle(now: number, schedule: PaySchedule, times: number[]): MoneyCycle {
  const today = startOfDay(now);
  const anchor = startOfDay(Number(schedule.anchor) || today);
  const k = Math.floor(daysBetween(anchor, today) / 14);
  return steppedCycle('fortnightly', now, addDays(anchor, k * 14), 14, times, schedule);
}

/** Payout times for weekly / every-2-weeks pay: any credit at least half the usual payout. */
function payoutTimes(credits: SalaryCredit[]): number[] {
  const valid = credits.filter((c) => c && c.timestamp > 0 && c.amount > 0);
  if (valid.length === 0) return [];
  const amounts = valid.map((c) => c.amount).sort((a, b) => a - b);
  const median = amounts[Math.floor(amounts.length / 2)];
  return valid.filter((c) => c.amount >= median * 0.5).map((c) => c.timestamp).sort((a, b) => a - b);
}

/** Irregular income: the last 30 days including today, compared with the 30 before. */
function rollingCycle(now: number, schedule: PaySchedule): MoneyCycle {
  const today = startOfDay(now);
  const start = addDays(today, -29);
  const c = fixedCycle('rolling', start, addDays(today, 1), addDays(start, -30), now, schedule);
  return { ...c, daysLeft: 0 };
}

/**
 * The cycle containing `now`.
 * @param payday 1–31 for a monthly salary; null, undefined or 0 for calendar months.
 * @param credits salary credits (any order); amounts filter out partial or one-off credits.
 * @param schedule weekly / every 2 weeks / irregular pay, or a second monthly salary.
 */
export function resolveCycle(
  now: number,
  payday: number | null | undefined,
  credits: SalaryCredit[] = [],
  schedule?: PaySchedule | null
): MoneyCycle {
  if (schedule?.kind === 'irregular') return rollingCycle(now, schedule);
  if (schedule?.kind === 'weekly' && schedule.weekday !== null && schedule.weekday !== undefined) {
    return weeklyCycle(now, schedule, payoutTimes(credits));
  }
  if (schedule?.kind === 'fortnightly' && schedule.anchor) return fortnightlyCycle(now, schedule, payoutTimes(credits));
  if (!isSalaryPayday(payday)) return calendarCycle(now);
  return salaryCycle(now, payday, realSalaries(credits, payday, schedule?.secondPayday), true, schedule ?? null);
}

function salaryCycle(now: number, payday: number, times: number[], withPrev: boolean, schedule: PaySchedule | null): MoneyCycle {
  const today = startOfDay(now);
  const thisIdx = monthIndexOf(now);
  const curIdx = expectedPayday(thisIdx, payday) > today ? thisIdx - 1 : thisIdx;
  const cur = expectedPayday(curIdx, payday);
  const upcoming = expectedPayday(curIdx + 1, payday);
  const prev = expectedPayday(curIdx - 1, payday);
  const prevPrev = expectedPayday(curIdx - 2, payday);

  const curLanded = landedFor(cur, times, now);
  const curStart = curLanded ?? cur;

  let start: number;
  let anchorIdx: number;
  let nextPayday: number;
  let lateDays = 0;

  const early = landedFor(upcoming, times, now, addDays(curStart, MIN_CYCLE_DAYS));
  if (early !== null) {
    // Next salary already came, a few days early.
    start = early;
    anchorIdx = curIdx + 1;
    nextPayday = expectedPayday(curIdx + 2, payday);
  } else if (curLanded !== null) {
    start = curLanded;
    anchorIdx = curIdx;
    nextPayday = upcoming;
  } else {
    const prevLanded = landedFor(prev, times, now);
    const tracksSalary = prevLanded !== null || landedFor(prevPrev, times, now) !== null;
    if (tracksSalary && today <= addDays(cur, LATE_DAYS)) {
      // Salary is due (or overdue) but hasn't come: the previous cycle keeps going.
      start = prevLanded ?? prev;
      anchorIdx = curIdx - 1;
      nextPayday = cur;
      const overdue = daysBetween(cur, today);
      lateDays = overdue > LATE_GRACE_DAYS ? overdue : 0;
    } else {
      start = cur;
      anchorIdx = curIdx;
      nextPayday = upcoming;
    }
  }

  const isLate = nextPayday <= today;
  const end = isLate ? addDays(today, 1) - 1 : nextPayday - 1;
  const prevStart = withPrev ? salaryCycle(start - 1, payday, times, false, schedule).start : expectedPayday(anchorIdx - 1, payday);

  return {
    mode: 'salary',
    start,
    nextPayday,
    end,
    prevStart,
    anchor: nominalPayday(anchorIdx, payday),
    dayOfCycle: daysBetween(start, now) + 1,
    totalDays: Math.max(1, daysBetween(start, nextPayday)),
    daysLeft: Math.max(0, daysBetween(today, nextPayday)),
    lateDays,
    payday,
    schedule,
  };
}

/**
 * Which month a salary cycle is named after, from its expected payday. Month-end salary
 * (25th onwards) pays for next month's life, so 31 Oct → "November". Earlier paydays are
 * named for the month they land in (7 Nov → "November").
 */
export function cycleMonthFor(anchor: number, payday: number): Date {
  const d = new Date(anchor);
  return new Date(d.getFullYear(), d.getMonth() + (payday >= 25 ? 1 : 0), 1);
}

/** The expected cycle named after `month` (any date in it): payday to the day before the next. */
export function expectedCycleForMonth(month: Date, payday: number): { start: number; end: number } {
  const idx = month.getFullYear() * 12 + month.getMonth() + (payday >= 25 ? -1 : 0);
  return { start: expectedPayday(idx, payday), end: expectedPayday(idx + 1, payday) - 1 };
}

/**
 * Start of every cycle from the one containing `since` up to the current one, oldest first.
 * In salary mode each start is the day salary actually landed (or was due, when not seen).
 */
export function cycleStartsSince(
  since: number,
  now: number,
  payday: number | null | undefined,
  credits: SalaryCredit[] = [],
  schedule?: PaySchedule | null
): number[] {
  const out: number[] = [];
  let c = resolveCycle(now, payday, credits, schedule);
  // A guard, not a limit anyone reaches (weekly cycles over 5 years are ~260).
  for (let i = 0; i < 800; i++) {
    out.push(c.start);
    if (c.start <= since) break;
    c = resolveCycle(c.start - 1, payday, credits, schedule);
  }
  return out.reverse();
}

/** Usual length of a cycle in days, and how far off one can be before it counts as odd. */
export function expectedLength(mode: CycleMode): { days: number; min: number; max: number } {
  switch (mode) {
    // Payouts can land a day early or a few days late, so a week can run 5 to 10 days.
    case 'weekly':
      return { days: 7, min: 5, max: 10 };
    case 'fortnightly':
      return { days: 14, min: 12, max: 17 };
    case 'rolling':
      return { days: 30, min: 30, max: 30 };
    case 'calendar':
      return { days: 30, min: 28, max: 31 };
    case 'salary':
    default:
      return { days: 30, min: 25, max: 35 };
  }
}

/**
 * A cycle that shouldn't count toward averages: a job change or a very late salary makes a
 * salary cycle much shorter or longer than usual. Fixed-length cycles are never odd.
 */
export const isTransitionCycle = (mode: CycleMode, days: number): boolean => {
  const { min, max } = expectedLength(mode);
  return days < min || days > max;
};

/**
 * The same stretch (same number of days in) of up to `count` earlier cycles, for a "your usual"
 * comparison. Odd (transition) cycles are skipped. Looks back at most `count + 3` cycles.
 */
export function usualWindows(
  cycle: MoneyCycle,
  now: number,
  credits: SalaryCredit[] = [],
  count = 3
): Array<{ start: number; end: number }> {
  const elapsedDays = Math.max(0, daysBetween(cycle.start, now));
  const out: Array<{ start: number; end: number }> = [];
  let next = cycle;
  for (let i = 0; i < count + 3 && out.length < count; i++) {
    const c = resolveCycle(next.start - 1, cycle.payday, credits, cycle.schedule);
    const length = daysBetween(c.start, next.start);
    if (!isTransitionCycle(cycle.mode, length)) {
      out.push({ start: c.start, end: Math.min(addDays(c.start, elapsedDays + 1) - 1, next.start - 1) });
    }
    next = c;
  }
  return out;
}

/**
 * The same stretch of the previous cycle, for "vs last cycle": from its start, as many
 * elapsed days as this cycle has had (to the end of the matching day), never past its end.
 */
export function samePointLastCycle(cycle: MoneyCycle, now: number): { start: number; end: number } {
  const elapsedDays = Math.max(0, daysBetween(cycle.start, now));
  const end = Math.min(addDays(cycle.prevStart, elapsedDays + 1) - 1, cycle.start - 1);
  return { start: cycle.prevStart, end };
}

/**
 * The second salary expected in this cycle (partner's, or the second part of a split salary),
 * when it hasn't landed yet. Amount is the usual credit near that day.
 */
export function upcomingSecondSalary(
  cycle: MoneyCycle,
  credits: SalaryCredit[],
  now: number
): { amount: number; dueAt: number; label: string } | null {
  const second = cycle.schedule?.secondPayday;
  if (cycle.mode !== 'salary' || !isSalaryPayday(second) || !cycle.payday || dayGap(second, cycle.payday) <= 2) return null;
  const near = credits.filter((c) => dayGap(new Date(c.timestamp).getDate(), second) <= 2);
  if (near.length === 0) return null;
  // Its due date inside this cycle.
  let dueAt: number | null = null;
  for (let idx = monthIndexOf(cycle.start); idx <= monthIndexOf(cycle.end) + 1; idx++) {
    const d = expectedPayday(idx, second);
    if (d >= cycle.start && d <= cycle.end) {
      dueAt = d;
      break;
    }
  }
  if (dueAt === null) return null;
  const landed = near.some((c) => c.timestamp >= addDays(dueAt!, -EARLY_DAYS) && c.timestamp <= now);
  if (landed || dueAt < startOfDay(now) - LATE_DAYS * DAY_MS) return null;
  const amounts = near.map((c) => c.amount).sort((a, b) => a - b);
  return { amount: amounts[Math.floor(amounts.length / 2)], dueAt, label: cycle.schedule?.secondLabel || 'Second salary' };
}

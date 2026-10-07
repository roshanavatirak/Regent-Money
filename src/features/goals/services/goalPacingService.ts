/**
 * Goal Pacing Service
 * 
 * CORE MATHEMATICAL CONVENTIONS:
 * 1. Timezone: All calendar month grouping is computed in Indian Standard Time (IST, UTC+05:30).
 * 2. Inflation: Computed once between createdAt and targetDate; never shrinks over time.
 * 3. Start-of-Month Baseline:
 *    - requiredMonthly and projectedFinish are anchored to savedAtStartOfMonth.
 *    - The current calendar month is always included in remaining months.
 *    - Logging positive savings in the current month reduces thisMonthRemaining and
 *      NEVER increases requiredMonthly or moves projectedFinish later.
 * 4. Pacing Window:
 *    - Evaluated over complete calendar months strictly after the creation/migration month.
 *    - Partial creation month is excluded.
 *    - If 0 complete months elapsed, committedMonthly is used.
 * 5. Opening Balances:
 *    - type: 'opening' counts toward saved balance, but is excluded from actualMonthlyPace.
 * 6. Rounding:
 *    - All required monthly amounts and gaps are rounded up to the nearest ₹100 via roundUpTo100().
 */

export type GoalStatus = 'completed' | 'not_started' | 'ahead' | 'on_pace' | 'slightly_behind' | 'behind';

export type GoalSubStatus =
  | 'completed'
  | 'not_started'
  | 'target_passed'
  | 'zero_pace'
  | 'ahead'
  | 'on_pace'
  | 'slightly_behind'
  | 'behind';

export interface SavingsEntry {
  id: string;
  amount: number;
  at: string; // yyyy-mm-dd or ISO 8601 string
  type: 'opening' | 'save' | 'withdraw';
  note?: string;
}

export interface Goal {
  id: string;
  name: string;
  category?: 'bike' | 'car' | 'home' | 'travel' | 'wedding' | 'education' | 'emergency' | 'gadget' | 'gold' | 'business' | 'fire' | 'wealth_stash' | 'custom' | string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution?: number;
  committedMonthly: number;
  expectedReturnRate?: number;
  targetDate: any;
  priority?: 'high' | 'medium' | 'low' | string;
  color?: string;
  icon?: string;
  strategy?: string;
  streakMonths?: number;
  status?: string;
  isMilestoneBased?: boolean;
  milestoneStep?: number;
  entries: SavingsEntry[];
  reminder?: { dayOfMonth: number; paused: boolean };
  coverPresetKey?: string;
  coverImageUri?: string;
  linkedBankId?: string;
  createdAt: string;
  migratedAt?: string;
  adjustForInflation?: boolean;
}

export interface GoalPacing {
  saved: number;
  savedAtStartOfMonth: number;
  loggedThisMonth: number;
  thisMonthRemaining: number;
  effectiveTarget: number;
  pctSaved: number; // Single % in UI: 0 - 100
  requiredMonthly: number;
  actualMonthlyPace: number;
  projectedFinish: string | null; // yyyy-mm or null
  monthsDelta: number; // + early, - late, 0 on pace
  status: GoalStatus;
  subStatus: GoalSubStatus;
  gapPerMonth: number; // Rounded to ₹100
}

// ==========================================
// DATE & TIMEZONE HELPERS (IST / UTC+05:30)
// ==========================================

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function getISTDateParts(dateOrStr: Date | string | number): { year: number; month: number; day: number } {
  let dateObj: Date;
  if (typeof dateOrStr === 'number') {
    dateObj = new Date(dateOrStr);
  } else if (typeof dateOrStr === 'string') {
    const trimmed = dateOrStr.trim();
    if (/^\d{11,}$/.test(trimmed)) {
      dateObj = new Date(Number(trimmed));
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-').map(Number);
      return { year: y, month: m, day: d };
    } else if (/^\d{4}-\d{2}$/.test(trimmed)) {
      const [y, m] = trimmed.split('-').map(Number);
      return { year: y, month: m, day: 1 };
    } else {
      dateObj = new Date(dateOrStr);
    }
  } else {
    dateObj = dateOrStr;
  }

  // Adjust UTC timestamp by IST offset
  const istTime = new Date(dateObj.getTime() + IST_OFFSET_MS);
  return {
    year: istTime.getUTCFullYear(),
    month: istTime.getUTCMonth() + 1, // 1-indexed
    day: istTime.getUTCDate(),
  };
}

export function toISTYearMonth(dateOrStr: Date | string | number): string {
  const { year, month } = getISTDateParts(dateOrStr);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function toISTDateString(dateOrStr: Date | string | number): string {
  const { year, month, day } = getISTDateParts(dateOrStr);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function normalizeTargetYearMonth(targetDate: any): string {
  if (!targetDate) {
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    return toISTYearMonth(nextYear);
  }
  return toISTYearMonth(targetDate);
}

export function parseYearMonth(ymStr: string): { year: number; month: number } {
  const [year, month] = ymStr.slice(0, 7).split('-').map(Number);
  return { year, month };
}

export function formatYearMonth(parts: { year: number; month: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

export function diffInCalendarMonths(
  start: { year: number; month: number },
  end: { year: number; month: number }
): number {
  return (end.year - start.year) * 12 + (end.month - start.month);
}

export function addCalendarMonths(
  start: { year: number; month: number },
  months: number
): { year: number; month: number } {
  const totalMonths = start.year * 12 + (start.month - 1) + months;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = (totalMonths % 12) + 1;
  return { year: newYear, month: newMonth };
}

// ==========================================
// ROUNDING & AGGREGATE HELPERS
// ==========================================

export const roundUpTo100 = (amount: number): number => {
  if (!amount || amount <= 0) return 0;
  return Math.ceil(amount / 100) * 100;
};

export const getSaved = (goal: Goal): number => {
  return (goal.entries || []).reduce((acc, e) => {
    if (e.type === 'withdraw') return acc - e.amount;
    return acc + e.amount;
  }, 0);
};

export const getSavedAtStartOfMonth = (goal: Goal, today: Date): number => {
  const currentMonthKey = toISTYearMonth(today);
  return (goal.entries || []).reduce((acc, e) => {
    const entryMonth = toISTYearMonth(e.at);
    if (entryMonth < currentMonthKey) {
      return acc + (e.type === 'withdraw' ? -e.amount : e.amount);
    }
    return acc;
  }, 0);
};

export const getLoggedThisMonth = (goal: Goal, today: Date): number => {
  const currentMonthKey = toISTYearMonth(today);
  return (goal.entries || []).reduce((acc, e) => {
    const entryMonth = toISTYearMonth(e.at);
    if (entryMonth === currentMonthKey) {
      return acc + (e.type === 'withdraw' ? -e.amount : e.amount);
    }
    return acc;
  }, 0);
};

/**
 * Fixed inflation adjustment calculated from createdAt to targetDate.
 * Never shrinks over time.
 */
export const getEffectiveTarget = (goal: Goal): number => {
  if (goal.targetAmount <= 0) {
    throw new Error(`Target amount must be greater than zero. Received: ${goal.targetAmount}`);
  }
  if (!goal.adjustForInflation) return goal.targetAmount;

  const createdParts = parseYearMonth(toISTYearMonth(goal.createdAt));
  const targetParts = parseYearMonth(normalizeTargetYearMonth(goal.targetDate));
  const totalMonths = Math.max(0, diffInCalendarMonths(createdParts, targetParts));
  const totalYears = totalMonths / 12;

  return Math.round(goal.targetAmount * Math.pow(1 + 0.06, totalYears));
};

/**
 * Calculates account-level savings streak with grace:
 * - 1 free skip per 6 months of streak.
 * - Evaluates across all goals.
 */
export function getAccountStreak(goals: Goal[], today: Date = new Date()): number {
  const currentMonthParts = parseYearMonth(toISTYearMonth(today));

  // Collect all months that have a positive save entry
  const savedMonths = new Set<string>();
  for (const g of goals) {
    for (const e of g.entries || []) {
      if (e.type === 'save' && e.amount > 0) {
        savedMonths.add(toISTYearMonth(e.at));
      }
    }
  }

  // Determine starting evaluation month:
  // If user has saved in the current month, start from current month.
  // Otherwise, start from previous month (current month is still in progress).
  const currentMonthKey = formatYearMonth(currentMonthParts);
  const startFromCurrent = savedMonths.has(currentMonthKey);
  const startMonthParts = startFromCurrent ? currentMonthParts : addCalendarMonths(currentMonthParts, -1);

  let streak = 0;
  let skipsUsed = 0;

  for (let i = 0; i < 120; i++) {
    const checkMonthParts = addCalendarMonths(startMonthParts, -i);
    const monthKey = formatYearMonth(checkMonthParts);

    if (savedMonths.has(monthKey)) {
      streak++;
    } else {
      // 1 free skip allowed per 6 months of streak
      const allowedSkips = Math.floor(streak / 6) + 1;
      if (skipsUsed < allowedSkips && streak > 0) {
        skipsUsed++;
      } else {
        break;
      }
    }
  }

  return streak;
}

/**
 * Complete calendar months strictly AFTER creation/migration month and BEFORE current month.
 */
export const getCompleteMonthsElapsed = (startDateStr: string, today: Date): number => {
  const startParts = parseYearMonth(toISTYearMonth(startDateStr));
  const currentParts = parseYearMonth(toISTYearMonth(today));
  const diff = diffInCalendarMonths(startParts, currentParts);
  return Math.max(0, diff - 1);
};

/**
 * Monthly pace calculation:
 * - Excludes 'opening' entries.
 * - If 0 complete months elapsed, returns committedMonthly.
 * - Otherwise averages over the last 1 to 3 complete calendar months.
 */
export const calculateMonthlyPace = (goal: Goal, today: Date): number => {
  const referenceDate = goal.migratedAt || goal.createdAt;
  const completeMonthsElapsed = getCompleteMonthsElapsed(referenceDate, today);

  if (completeMonthsElapsed === 0) {
    return Math.max(0, goal.committedMonthly || 0);
  }

  const monthsToAverage = Math.min(3, completeMonthsElapsed);
  const currentParts = parseYearMonth(toISTYearMonth(today));

  // Determine the last N complete months
  const completeMonthKeys: string[] = [];
  for (let i = 1; i <= monthsToAverage; i++) {
    const ym = addCalendarMonths(currentParts, -i);
    completeMonthKeys.push(formatYearMonth(ym));
  }

  const paceEntries = (goal.entries || []).filter(e => e.type === 'save' || e.type === 'withdraw');
  let netSavedInWindow = 0;

  for (const mKey of completeMonthKeys) {
    const monthTotal = paceEntries
      .filter(e => toISTYearMonth(e.at) === mKey)
      .reduce((sum, e) => sum + (e.type === 'withdraw' ? -e.amount : e.amount), 0);
    netSavedInWindow += Math.max(0, monthTotal);
  }

  return Math.round(netSavedInWindow / monthsToAverage);
};

// ==========================================
// MAIN PACING FUNCTION
// ==========================================

export function getGoalPacing(goal: Goal, today: Date = new Date()): GoalPacing {
  if (goal.targetAmount <= 0) {
    throw new Error(`Target amount must be greater than zero. Received: ${goal.targetAmount}`);
  }

  const saved = getSaved(goal);
  const savedAtStartOfMonth = getSavedAtStartOfMonth(goal, today);
  const loggedThisMonth = getLoggedThisMonth(goal, today);
  const effectiveTarget = getEffectiveTarget(goal);

  const currentMonthParts = parseYearMonth(toISTYearMonth(today));
  const targetMonthParts = parseYearMonth(normalizeTargetYearMonth(goal.targetDate));

  // Remaining months always includes the current month
  const calendarMonthsDiff = diffInCalendarMonths(currentMonthParts, targetMonthParts);
  const remainingSavingMonths = Math.max(0, calendarMonthsDiff + 1);

  // 1. COMPLETED (Highest priority)
  if (saved >= effectiveTarget) {
    return {
      saved,
      savedAtStartOfMonth,
      loggedThisMonth,
      thisMonthRemaining: 0,
      effectiveTarget,
      pctSaved: 100,
      requiredMonthly: 0,
      actualMonthlyPace: calculateMonthlyPace(goal, today),
      projectedFinish: null,
      monthsDelta: 0,
      status: 'completed',
      subStatus: 'completed',
      gapPerMonth: 0,
    };
  }

  // 2. NOT STARTED (Zero entries of ANY type)
  if (!goal.entries || goal.entries.length === 0) {
    const monthsLeft = Math.max(1, remainingSavingMonths);
    const requiredMonthly = roundUpTo100(effectiveTarget / monthsLeft);
    return {
      saved: 0,
      savedAtStartOfMonth: 0,
      loggedThisMonth: 0,
      thisMonthRemaining: requiredMonthly,
      effectiveTarget,
      pctSaved: 0,
      requiredMonthly,
      actualMonthlyPace: 0,
      projectedFinish: null,
      monthsDelta: 0,
      status: 'not_started',
      subStatus: 'not_started',
      gapPerMonth: 0,
    };
  }

  // 3. TARGET MONTH PASSED (Target month strictly before current month)
  if (calendarMonthsDiff < 0) {
    return {
      saved,
      savedAtStartOfMonth,
      loggedThisMonth,
      thisMonthRemaining: 0,
      effectiveTarget,
      pctSaved: Math.min(99, Math.round((saved / effectiveTarget) * 100)),
      requiredMonthly: roundUpTo100(effectiveTarget - saved),
      actualMonthlyPace: calculateMonthlyPace(goal, today),
      projectedFinish: null,
      monthsDelta: calendarMonthsDiff,
      status: 'behind',
      subStatus: 'target_passed',
      gapPerMonth: 0, // Clamped to 0 so copy handles target passed cleanly
    };
  }

  // Baseline requiredMonthly anchored to start of month
  const requiredMonthly = roundUpTo100(
    Math.max(0, effectiveTarget - savedAtStartOfMonth) / Math.max(1, remainingSavingMonths)
  );
  const thisMonthRemaining = Math.max(0, requiredMonthly - loggedThisMonth);

  const actualMonthlyPace = calculateMonthlyPace(goal, today);

  // 4. ZERO PACE (Pace <= 0 and goal not completed)
  if (actualMonthlyPace <= 0) {
    return {
      saved,
      savedAtStartOfMonth,
      loggedThisMonth,
      thisMonthRemaining,
      effectiveTarget,
      pctSaved: Math.min(99, Math.round((saved / effectiveTarget) * 100)),
      requiredMonthly,
      actualMonthlyPace: 0,
      projectedFinish: null,
      monthsDelta: 0,
      status: 'behind',
      subStatus: 'zero_pace',
      gapPerMonth: requiredMonthly,
    };
  }

  // 5. NORMAL PACING
  // How many monthly paces are needed from start-of-month baseline
  const remainingFromStart = Math.max(0, effectiveTarget - savedAtStartOfMonth);
  const monthsNeededFromStart = Math.ceil(remainingFromStart / actualMonthlyPace);

  // Remaining to save right now
  const remainingNow = Math.max(0, effectiveTarget - saved);
  const monthsNeededNow = Math.ceil(remainingNow / actualMonthlyPace);

  // If user already saved enough to finish this month
  let projectedFinishParts: { year: number; month: number };
  if (monthsNeededNow <= 1 && loggedThisMonth >= actualMonthlyPace) {
    projectedFinishParts = currentMonthParts;
  } else {
    // Current month counts as 1 saving period
    const offset = Math.max(0, monthsNeededNow - 1);
    projectedFinishParts = addCalendarMonths(currentMonthParts, offset);
  }

  const projectedFinishStr = formatYearMonth(projectedFinishParts);
  const monthsDelta = diffInCalendarMonths(projectedFinishParts, targetMonthParts); // + early, - late

  let status: GoalStatus = 'behind';
  let subStatus: GoalSubStatus = 'behind';

  if (monthsDelta >= 1) {
    status = 'ahead';
    subStatus = 'ahead';
  } else if (monthsDelta === 0) {
    status = 'on_pace';
    subStatus = 'on_pace';
  } else if (monthsDelta === -1 || monthsDelta === -2) {
    status = 'slightly_behind';
    subStatus = 'slightly_behind';
  }

  const gapPerMonth =
    status === 'ahead' || status === 'on_pace'
      ? 0
      : roundUpTo100(Math.max(0, requiredMonthly - actualMonthlyPace));

  return {
    saved,
    savedAtStartOfMonth,
    loggedThisMonth,
    thisMonthRemaining,
    effectiveTarget,
    pctSaved: Math.min(99, Math.round((saved / effectiveTarget) * 100)),
    requiredMonthly,
    actualMonthlyPace,
    projectedFinish: projectedFinishStr,
    monthsDelta,
    status,
    subStatus,
    gapPerMonth,
  };
}

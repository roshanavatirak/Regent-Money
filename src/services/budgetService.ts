import {
  startOfMonth,
  endOfMonth,
  addWeeks,
  addMonths,
  addYears,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  differenceInDays,
  format,
} from 'date-fns';
import { BudgetCategory, BudgetPeriodType, useBudgetStore } from '../store';
import { authService } from './authService';
import { BACKEND_URL } from '../config/api';

/**
 * Common Debit Categories synchronized with TransactionDetailScreen
 */
export const BUDGET_DEBIT_CATEGORIES = [
  { id: 'all', label: 'Total Spending (Overall)', icon: 'globe-outline', isOverall: true, color: '#2dba4e' },
  { id: 'food', label: 'Food & Dining', icon: 'restaurant-outline', color: '#ff9800' },
  { id: 'utilities', label: 'Rent & Bills', icon: 'home-outline', color: '#2196f3' },
  { id: 'transport', label: 'Travel & Cab', icon: 'car-outline', color: '#9c27b0' },
  { id: 'shopping', label: 'Shopping', icon: 'cart-outline', color: '#e91e63' },
  { id: 'entertainment', label: 'Entertainment', icon: 'film-outline', color: '#00bcd4' },
  { id: 'health', label: 'Health & Med', icon: 'fitness-outline', color: '#4caf50' },
  { id: 'other_expense', label: 'Other Expense', icon: 'pricetag-outline', color: '#8b949e' },
];

/**
 * Period preset definitions with human-readable labels
 */
export const BUDGET_PERIOD_PRESETS: { id: BudgetPeriodType; label: string; badge: string }[] = [
  { id: 'monthly', label: 'This Month', badge: 'Default' },
  { id: '1_week', label: '1 Week', badge: '7 Days' },
  { id: '2_week', label: '2 Weeks', badge: '14 Days' },
  { id: '3_week', label: '3 Weeks', badge: '21 Days' },
  { id: '4_week', label: '4 Weeks', badge: '28 Days' },
  { id: '2_month', label: '2 Months', badge: '~60 Days' },
  { id: '3_month', label: '3 Months (Quarter)', badge: 'Qtr' },
  { id: '4_month', label: '4 Months', badge: '~120 Days' },
  { id: '6_month', label: '6 Months (Half-Yr)', badge: '6M' },
  { id: '1_year', label: '1 Year (Annual)', badge: 'Annual' },
  { id: '5_year', label: '5 Years', badge: '5Y' },
  { id: 'salary_cycle', label: 'Salary Cycle', badge: 'Payday' },
  { id: 'custom', label: 'Custom Range', badge: 'Pick Dates' },
];

/**
 * Helper to adjust a Date to the start of day (00:00:00.000) in IST (UTC+05:30)
 */
export function getISTStartOfDay(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/**
 * Helper to adjust a Date to the end of day (23:59:59.999) in IST (UTC+05:30)
 */
export function getISTEndOfDay(date: Date = new Date()): number {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/**
 * Strict IST Date Range Generator using date-fns
 */
export function getBudgetPeriodRange(
  periodType: BudgetPeriodType,
  anchorDate: Date = new Date(),
  customRange?: { start: Date; end: Date },
  salaryDay: number = 1
): { startDate: number; endDate: number; totalDays: number; label: string } {
  const now = new Date(anchorDate);

  switch (periodType) {
    case '1_week': {
      const start = getISTStartOfDay(now);
      const adjustedEnd = getISTEndOfDay(new Date(start + 6 * 24 * 60 * 60 * 1000));
      return {
        startDate: start,
        endDate: adjustedEnd,
        totalDays: 7,
        label: `${format(start, 'dd MMM')} - ${format(adjustedEnd, 'dd MMM yyyy')}`,
      };
    }

    case '2_week': {
      const start = getISTStartOfDay(now);
      const adjustedEnd = getISTEndOfDay(new Date(start + 13 * 24 * 60 * 60 * 1000));
      return {
        startDate: start,
        endDate: adjustedEnd,
        totalDays: 14,
        label: `${format(start, 'dd MMM')} - ${format(adjustedEnd, 'dd MMM yyyy')}`,
      };
    }

    case '3_week': {
      const start = getISTStartOfDay(now);
      const adjustedEnd = getISTEndOfDay(new Date(start + 20 * 24 * 60 * 60 * 1000));
      return {
        startDate: start,
        endDate: adjustedEnd,
        totalDays: 21,
        label: `${format(start, 'dd MMM')} - ${format(adjustedEnd, 'dd MMM yyyy')}`,
      };
    }

    case '4_week': {
      const start = getISTStartOfDay(now);
      const adjustedEnd = getISTEndOfDay(new Date(start + 27 * 24 * 60 * 60 * 1000));
      return {
        startDate: start,
        endDate: adjustedEnd,
        totalDays: 28,
        label: `${format(start, 'dd MMM')} - ${format(adjustedEnd, 'dd MMM yyyy')}`,
      };
    }

    case '2_month': {
      const start = getISTStartOfDay(startOfMonth(now));
      const end = getISTEndOfDay(endOfMonth(addMonths(now, 1)));
      const days = differenceInDays(end, start) + 1;
      return {
        startDate: start,
        endDate: end,
        totalDays: days,
        label: `${format(start, 'dd MMM')} - ${format(end, 'dd MMM yyyy')}`,
      };
    }

    case '3_month': {
      const start = getISTStartOfDay(startOfQuarter(now));
      const end = getISTEndOfDay(endOfQuarter(now));
      const days = differenceInDays(end, start) + 1;
      return {
        startDate: start,
        endDate: end,
        totalDays: days,
        label: `Q${Math.floor(now.getMonth() / 3) + 1} (${format(start, 'MMM')} - ${format(end, 'MMM yyyy')})`,
      };
    }

    case '4_month': {
      const start = getISTStartOfDay(startOfMonth(now));
      const end = getISTEndOfDay(endOfMonth(addMonths(now, 3)));
      const days = differenceInDays(end, start) + 1;
      return {
        startDate: start,
        endDate: end,
        totalDays: days,
        label: `${format(start, 'MMM yyyy')} - ${format(end, 'MMM yyyy')}`,
      };
    }

    case '6_month': {
      const start = getISTStartOfDay(startOfMonth(now));
      const end = getISTEndOfDay(endOfMonth(addMonths(now, 5)));
      const days = differenceInDays(end, start) + 1;
      return {
        startDate: start,
        endDate: end,
        totalDays: days,
        label: `${format(start, 'MMM yyyy')} - ${format(end, 'MMM yyyy')}`,
      };
    }

    case '1_year': {
      const start = getISTStartOfDay(startOfYear(now));
      const end = getISTEndOfDay(endOfYear(now));
      const days = differenceInDays(end, start) + 1;
      return {
        startDate: start,
        endDate: end,
        totalDays: days,
        label: `${format(start, 'yyyy')} (Full Year)`,
      };
    }

    case '5_year': {
      const start = getISTStartOfDay(startOfYear(now));
      const end = getISTEndOfDay(endOfYear(addYears(now, 4)));
      const days = differenceInDays(end, start) + 1;
      return {
        startDate: start,
        endDate: end,
        totalDays: days,
        label: `${format(start, 'yyyy')} - ${format(end, 'yyyy')} (5 Years)`,
      };
    }

    case 'salary_cycle': {
      // Anchored to salary credit day
      const currentDay = now.getDate();
      let cycleStartMonth = now.getMonth();
      let cycleStartYear = now.getFullYear();

      if (currentDay < salaryDay) {
        cycleStartMonth -= 1;
      }

      const cycleStartDate = new Date(cycleStartYear, cycleStartMonth, salaryDay);
      const nextMonthDate = addMonths(cycleStartDate, 1);
      const cycleEndDate = new Date(nextMonthDate.getFullYear(), nextMonthDate.getMonth(), salaryDay - 1);

      const start = getISTStartOfDay(cycleStartDate);
      const end = getISTEndOfDay(cycleEndDate);
      const days = differenceInDays(end, start) + 1;

      return {
        startDate: start,
        endDate: end,
        totalDays: days,
        label: `Payday Cycle (${format(start, 'dd MMM')} - ${format(end, 'dd MMM')})`,
      };
    }

    case 'custom': {
      if (customRange && customRange.start && customRange.end) {
        const start = getISTStartOfDay(customRange.start);
        const end = getISTEndOfDay(customRange.end);
        const days = Math.max(1, differenceInDays(end, start) + 1);
        return {
          startDate: start,
          endDate: end,
          totalDays: days,
          label: `${format(start, 'dd MMM')} - ${format(end, 'dd MMM yyyy')}`,
        };
      }
      const start = getISTStartOfDay(startOfMonth(now));
      const end = getISTEndOfDay(endOfMonth(now));
      return {
        startDate: start,
        endDate: end,
        totalDays: differenceInDays(end, start) + 1,
        label: format(start, 'MMMM yyyy'),
      };
    }

    case 'monthly':
    default: {
      const start = getISTStartOfDay(startOfMonth(now));
      const end = getISTEndOfDay(endOfMonth(now));
      const days = differenceInDays(end, start) + 1;
      return {
        startDate: start,
        endDate: end,
        totalDays: days,
        label: format(start, 'MMMM yyyy'),
      };
    }
  }
}

/**
 * Detect if a transaction is a self-transfer or credit card bill payment
 * (Strictly excluded to prevent double counting in budgets)
 */
export function isExcludedFromBudget(tx: any): boolean {
  if (tx.isSelfTransfer === true) return true;
  const category = (tx.category || '').toLowerCase();
  if (category === 'transfer') return true;

  const note = (tx.merchant || tx.source || tx.note || '').toUpperCase();
  const excludedPatterns = [
    'CRED',
    'CHEQ',
    'BILLDESK',
    'CREDIT CARD',
    'CC PYMT',
    'CC PAYMENT',
    'AUTOPAY CARD',
    'CARD PAYMENT',
    'SELF TRANSFER',
    'TRANSFER TO OWN',
  ];

  return excludedPatterns.some((pattern) => note.includes(pattern));
}

/**
 * Calculate Net Spend for a Budget within its active date window
 * Net Spend = Gross Debits - Refunds/Cashback Credits
 */
export function calculateBudgetNetSpend(
  budget: BudgetCategory,
  transactions: any[]
): {
  grossSpend: number;
  refunds: number;
  netSpend: number;
  transactionCount: number;
  matchingTransactions: any[];
} {
  const startDate = budget.startDate || getISTStartOfDay(startOfMonth(new Date()));
  const endDate = budget.endDate || getISTEndOfDay(endOfMonth(new Date()));
  const isOverall = !!budget.isOverall;
  const targetCategory = (budget.category || '').toLowerCase();

  let grossSpend = 0;
  let refunds = 0;
  let transactionCount = 0;
  const matchingTransactions: any[] = [];

  for (const tx of transactions) {
    if (tx.isDeleted) continue;
    if (isExcludedFromBudget(tx)) continue;

    // Normalize timestamp
    const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp || tx.date).getTime();
    if (isNaN(txTime)) continue;

    // Check date interval
    if (txTime < startDate || txTime > endDate) continue;

    const txCategory = (tx.category || 'other_expense').toLowerCase();
    const isCategoryMatch = isOverall || txCategory === targetCategory;

    if (!isCategoryMatch) continue;

    const amount = Math.abs(parseFloat(tx.amount || 0));
    if (isNaN(amount) || amount === 0) continue;

    if (tx.type === 'debit') {
      grossSpend += amount;
      transactionCount += 1;
      matchingTransactions.push(tx);
    } else if (tx.type === 'credit') {
      // If it's a refund or cashback in the same category, subtract it
      if (txCategory === targetCategory || txCategory === 'cashback') {
        refunds += amount;
        matchingTransactions.push(tx);
      }
    }
  }

  const netSpend = Math.max(0, grossSpend - refunds);

  return {
    grossSpend,
    refunds,
    netSpend,
    transactionCount,
    matchingTransactions,
  };
}

/**
 * Calculate pacing, daily safe spend, and burn status
 */
export function calculateBudgetPacing(
  budget: BudgetCategory,
  netSpend: number
): {
  limitAmount: number;
  remainingAmount: number;
  percentageUsed: number;
  totalDays: number;
  daysElapsed: number;
  daysRemaining: number;
  dailySafeSpend: number;
  currentDailyBurn: number;
  projectedSpend: number;
  paceStatus: 'safe' | 'caution' | 'overbudget';
  paceMessage: string;
  projectedOverrunDate: string | null;
  suggestedDailyCut: number;
} {
  const limitAmount = Math.max(1, budget.limitAmount || 1);
  const now = Date.now();
  const startDate = budget.startDate || getISTStartOfDay(startOfMonth(new Date()));
  const endDate = budget.endDate || getISTEndOfDay(endOfMonth(new Date()));

  const totalDays = Math.max(1, differenceInDays(endDate, startDate) + 1);
  const daysElapsed = Math.max(1, Math.min(totalDays, differenceInDays(now, startDate) + 1));
  const daysRemaining = Math.max(0, differenceInDays(endDate, now));

  const remainingAmount = Math.max(0, limitAmount - netSpend);
  const percentageUsed = Math.min(999, Math.round((netSpend / limitAmount) * 100));

  const dailySafeSpend = daysRemaining > 0 ? Math.round(remainingAmount / daysRemaining) : 0;
  const currentDailyBurn = Math.round(netSpend / daysElapsed);
  const projectedSpend = Math.round(currentDailyBurn * totalDays);

  let paceStatus: 'safe' | 'caution' | 'overbudget' = 'safe';
  let paceMessage = `Safe to spend ₹${dailySafeSpend.toLocaleString('en-IN')}/day (${daysRemaining}d left)`;
  let projectedOverrunDate: string | null = null;
  let suggestedDailyCut = 0;

  if (netSpend >= limitAmount) {
    paceStatus = 'overbudget';
    const overAmount = netSpend - limitAmount;
    paceMessage = `Exceeded limit by ₹${overAmount.toLocaleString('en-IN')}`;
  } else if (percentageUsed >= 80 || projectedSpend > limitAmount) {
    paceStatus = 'caution';
    suggestedDailyCut = Math.max(0, currentDailyBurn - dailySafeSpend);

    if (currentDailyBurn > 0) {
      const daysToBreach = Math.floor(remainingAmount / currentDailyBurn);
      const breachDateMs = now + daysToBreach * 24 * 60 * 60 * 1000;
      projectedOverrunDate = format(new Date(breachDateMs), 'dd MMM');
      paceMessage = `At this pace you'll cross on ${projectedOverrunDate}. Cut ₹${suggestedDailyCut.toLocaleString('en-IN')}/day to stay safe.`;
    } else {
      paceMessage = `High burn pace. Projected to spend ₹${projectedSpend.toLocaleString('en-IN')}`;
    }
  }

  return {
    limitAmount,
    remainingAmount,
    percentageUsed,
    totalDays,
    daysElapsed,
    daysRemaining,
    dailySafeSpend,
    currentDailyBurn,
    projectedSpend,
    paceStatus,
    paceMessage,
    projectedOverrunDate,
    suggestedDailyCut,
  };
}

export interface MerchantInsight {
  merchant: string;
  amount: number;
  percentage: number;
  count: number;
}

export interface BudgetDeepDive {
  topMerchants: MerchantInsight[];
  weekdaySpend: number;
  weekendSpend: number;
  weekdayPercent: number;
  weekendPercent: number;
  paydayWeekSpend: number;
  paydayPercent: number;
}

/**
 * Generate rich merchant and temporal spending insights for a budget
 */
export function getBudgetDeepDive(
  matchingTransactions: any[],
  totalSpend: number,
  startDate?: number
): BudgetDeepDive {
  const merchantMap = new Map<string, { amount: number; count: number }>();
  let weekdaySpend = 0;
  let weekendSpend = 0;
  let paydayWeekSpend = 0;
  const startMs = startDate || Date.now() - 30 * 24 * 60 * 60 * 1000;
  const paydayCutoff = startMs + 7 * 24 * 60 * 60 * 1000;

  for (const tx of matchingTransactions) {
    if (tx.type !== 'debit') continue;
    const rawMerchant = (tx.merchant || tx.note || 'Other Merchant').trim();
    const cleanMerchant = rawMerchant.split(/[-–—/]/)[0].trim() || rawMerchant;
    const amount = Math.abs(parseFloat(tx.amount || 0));
    const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp || tx.date).getTime();

    // Merchant summation
    const existing = merchantMap.get(cleanMerchant) || { amount: 0, count: 0 };
    merchantMap.set(cleanMerchant, {
      amount: existing.amount + amount,
      count: existing.count + 1,
    });

    // Weekday vs Weekend distribution
    const day = new Date(txTime).getDay();
    if (day === 0 || day === 6) {
      weekendSpend += amount;
    } else {
      weekdaySpend += amount;
    }

    // Payday-week splurge (first 7 days)
    if (txTime <= paydayCutoff) {
      paydayWeekSpend += amount;
    }
  }

  const sortedMerchants: MerchantInsight[] = Array.from(merchantMap.entries())
    .map(([merchant, data]) => ({
      merchant,
      amount: data.amount,
      percentage: totalSpend > 0 ? Math.round((data.amount / totalSpend) * 100) : 0,
      count: data.count,
    }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4);

  const totalMonitored = weekdaySpend + weekendSpend || 1;

  return {
    topMerchants: sortedMerchants,
    weekdaySpend,
    weekendSpend,
    weekdayPercent: Math.round((weekdaySpend / totalMonitored) * 100),
    weekendPercent: Math.round((weekendSpend / totalMonitored) * 100),
    paydayWeekSpend,
    paydayPercent: totalSpend > 0 ? Math.round((paydayWeekSpend / totalSpend) * 100) : 0,
  };
}

/**
 * Calculate "Free-to-Spend" across the user's active wallet
 * Subtracts detected fixed obligations (Rent, EMIs, SIPs, Utilities) upfront.
 */
export function calculateFreeToSpend(
  monthlyIncome: number,
  transactions: any[],
  budgets: BudgetCategory[]
): {
  monthlyIncome: number;
  fixedObligations: number;
  committedBudget: number;
  actualSpendSoFar: number;
  freeToSpendRemaining: number;
  safeDailySpend: number;
  daysRemaining: number;
} {
  const now = new Date();
  const monthStart = getISTStartOfDay(startOfMonth(now));
  const monthEnd = getISTEndOfDay(endOfMonth(now));
  const daysRemaining = Math.max(1, differenceInDays(monthEnd, now.getTime()));

  // 1. Detect fixed obligations (Rent, EMI, SIP, Utilities)
  let fixedObligations = 0;
  for (const tx of transactions) {
    const time = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp || tx.date).getTime();
    if (time >= monthStart && time <= monthEnd && tx.type === 'debit') {
      const cat = (tx.category || '').toLowerCase();
      const merchant = (tx.merchant || tx.note || '').toUpperCase();
      if (cat === 'utilities' || merchant.includes('RENT') || merchant.includes('EMI') || merchant.includes('SIP') || merchant.includes('LOAN')) {
        fixedObligations += Math.abs(parseFloat(tx.amount || 0));
      }
    }
  }

  // 2. Compute overall or category budgets committed
  const overallBudget = budgets.find((b) => b.isOverall);
  const committedBudget = overallBudget
    ? overallBudget.limitAmount
    : budgets.filter((b) => !b.isOverall).reduce((sum, b) => sum + (b.limitAmount || 0), 0);

  // 3. Compute actual net spend so far this month
  const monthTxs = transactions.filter((tx) => {
    const time = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp || tx.date).getTime();
    return time >= monthStart && time <= monthEnd && !isExcludedFromBudget(tx);
  });
  const grossSpent = monthTxs.filter((t) => t.type === 'debit').reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);
  const refunds = monthTxs.filter((t) => t.type === 'credit' && t.category !== 'salary').reduce((sum, t) => sum + Math.abs(parseFloat(t.amount || 0)), 0);
  const actualSpendSoFar = Math.max(0, grossSpent - refunds);

  // 4. Free-to-spend: Strictly driven by budgets allocated by the user for this duration.
  // We NEVER treat total bank balance or savings as spendable cash, as bank accounts hold savings and goal reserves.
  // If the user has not added any budget for this duration, show ₹0.
  if (committedBudget <= 0) {
    return {
      monthlyIncome: 0,
      fixedObligations,
      committedBudget: 0,
      actualSpendSoFar,
      freeToSpendRemaining: 0,
      safeDailySpend: 0,
      daysRemaining,
    };
  }

  const freeToSpendRemaining = Math.max(0, committedBudget - actualSpendSoFar);
  const safeDailySpend = daysRemaining > 0 && freeToSpendRemaining > 0 ? Math.round(freeToSpendRemaining / daysRemaining) : 0;

  return {
    monthlyIncome,
    fixedObligations,
    committedBudget,
    actualSpendSoFar,
    freeToSpendRemaining,
    safeDailySpend,
    daysRemaining,
  };
}

/**
 * Suggest Budget Amount based on trailing 3-month median spend
 * Removes the blank-page problem for users.
 */
export function getSuggestedBudgetAmount(
  category: string,
  transactions: any[],
  periodDays: number = 30
): { suggestedAmount: number; pastAverage: number; reasoning: string } {
  const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const isOverall = category === 'all';

  const qualifyingTxs = transactions.filter((tx) => {
    if (tx.isDeleted || tx.type !== 'debit') return false;
    if (isExcludedFromBudget(tx)) return false;
    const time = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp || tx.date).getTime();
    if (time < ninetyDaysAgo) return false;
    if (!isOverall && (tx.category || '').toLowerCase() !== category.toLowerCase()) return false;
    return true;
  });

  const totalSpent90d = qualifyingTxs.reduce((sum, tx) => sum + Math.abs(parseFloat(tx.amount || 0)), 0);
  const dailyAverage = totalSpent90d > 0 ? totalSpent90d / 90 : 0;

  if (dailyAverage === 0) {
    return {
      suggestedAmount: 0,
      pastAverage: 0,
      reasoning: 'No past transactions found for this category',
    };
  }

  const pastMonthlyAverage = Math.round(dailyAverage * 30);
  const scaledForPeriod = Math.round(dailyAverage * periodDays);
  const suggestedAmount = Math.ceil((scaledForPeriod * 1.1) / 500) * 500;

  return {
    suggestedAmount,
    pastAverage: pastMonthlyAverage,
    reasoning: `Based on your ₹${pastMonthlyAverage.toLocaleString('en-IN')} average monthly spend (+10% buffer)`,
  };
}

/**
 * Backend Sync Service: Create, Update, Delete Budgets
 */
export const budgetService = {
  async createBudget(payload: {
    name?: string;
    category?: string;
    limitAmount: number;
    period?: string;
    periodType?: BudgetPeriodType;
    startDate?: number;
    endDate?: number;
    isOverall?: boolean;
    fixedObligations?: number;
  }): Promise<BudgetCategory> {
    const token = await authService.getAccessToken();
    const id = 'budget_' + (payload.category || 'all') + '_' + Math.random().toString(36).substr(2, 9);

    const budgetItem: BudgetCategory = {
      id,
      name: payload.name || (payload.isOverall ? 'Total Spending Budget' : payload.category || 'Custom Budget'),
      category: payload.isOverall ? 'all' : (payload.category?.toLowerCase() || 'other_expense'),
      limitAmount: payload.limitAmount,
      spentAmount: 0,
      period: payload.period || 'Current Cycle',
      periodType: payload.periodType || 'monthly',
      startDate: payload.startDate,
      endDate: payload.endDate,
      isOverall: payload.isOverall,
      fixedObligations: payload.fixedObligations || 0,
    };

    // Optimistically update local store
    useBudgetStore.getState().addBudget(budgetItem);

    if (token) {
      try {
        await fetch(`${BACKEND_URL}/sync/budget`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(budgetItem),
        });
      } catch (err: any) {
        console.warn('[BudgetService] Offline fallback for create budget:', err.message);
      }
    }

    return budgetItem;
  },

  async updateBudget(id: string, partial: Partial<BudgetCategory>): Promise<void> {
    const token = await authService.getAccessToken();
    useBudgetStore.getState().updateBudget(id, partial);

    if (token) {
      try {
        await fetch(`${BACKEND_URL}/sync/budget/${id}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(partial),
        });
      } catch (err: any) {
        console.warn('[BudgetService] Offline fallback for update budget:', err.message);
      }
    }
  },

  async deleteBudget(id: string): Promise<void> {
    const token = await authService.getAccessToken();
    useBudgetStore.getState().deleteBudget(id);

    if (token) {
      try {
        await fetch(`${BACKEND_URL}/sync/budget/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      } catch (err: any) {
        console.warn('[BudgetService] Offline fallback for delete budget:', err.message);
      }
    }
  },

  /**
   * Transfer allocation between two budget envelopes
   */
  async transferEnvelope(sourceBudgetId: string, targetBudgetId: string, amount: number): Promise<void> {
    const store = useBudgetStore.getState();
    const source = store.budgets.find((b: BudgetCategory) => b.id === sourceBudgetId);
    const target = store.budgets.find((b: BudgetCategory) => b.id === targetBudgetId);
    if (!source || !target) throw new Error('Budget not found');
    if (source.limitAmount < amount) throw new Error('Transfer amount exceeds source budget ceiling');

    await this.updateBudget(sourceBudgetId, { limitAmount: source.limitAmount - amount });
    await this.updateBudget(targetBudgetId, { limitAmount: target.limitAmount + amount });
  },

  /**
   * Sweep unspent surplus funds from a budget into a wealth goal
   */
  async sweepSurplusToGoal(budgetId: string, goalId: string, amount: number): Promise<void> {
    const store = useBudgetStore.getState();
    const budget = store.budgets.find((b: BudgetCategory) => b.id === budgetId);
    if (!budget) throw new Error('Budget not found');

    const { goalService } = await import('./goalService');
    await goalService.contribute(goalId, amount);
  },
};

/**
 * Evaluates incoming transaction against active budgets and triggers instant notifications
 * if a budget crosses 80% (Warning) or 100% (Breach), or if salary arrives.
 */
export function checkAndDispatchBudgetAlert(
  parsedTx: { amount: number; type: 'credit' | 'debit'; merchant: string; category?: string; isSalary?: boolean },
  allTransactions: any[]
): void {
  const { useBudgetStore, useNotificationStore } = require('../store');
  const budgets: BudgetCategory[] = useBudgetStore.getState().budgets || [];
  if (budgets.length === 0) return;

  // 1. Salary Credit Alert & Budget Cycle Rollover Nudge
  if (parsedTx.isSalary || parsedTx.type === 'credit') {
    if (parsedTx.isSalary || (parsedTx.merchant && parsedTx.merchant.toUpperCase().includes('SALARY'))) {
      useNotificationStore.getState().addNotification({
        id: 'notif_salary_' + Date.now(),
        userId: 'local',
        agentId: 'agent_budget',
        title: '💼 Salary Credit Detected!',
        body: `₹${Number(parsedTx.amount || 0).toLocaleString('en-IN')} credited from ${parsedTx.merchant}. Would you like to start your new budget cycle today?`,
        type: 'recommendation',
        readStatus: false,
        payload: { isSalaryCycleNudge: true, amount: parsedTx.amount },
        createdAt: Date.now(),
      });
    }
    return;
  }

  // 2. Debit Transaction Budget Alerts
  if (parsedTx.type !== 'debit') return;

  const targetCategory = (parsedTx.category || '').toLowerCase();
  const txAmount = Math.abs(Number(parsedTx.amount || 0));

  for (const budget of budgets) {
    const isCategoryMatch = budget.isOverall || (budget.category || '').toLowerCase() === targetCategory;
    if (!isCategoryMatch) continue;

    const netData = calculateBudgetNetSpend(budget, allTransactions);
    const newNetSpend = netData.netSpend + txAmount;
    const limit = budget.limitAmount || 1;
    const percentage = Math.round((newNetSpend / limit) * 100);
    const remaining = Math.max(0, limit - newNetSpend);

    if (newNetSpend >= limit) {
      // 100% Breach Alert
      const overAmount = newNetSpend - limit;
      useNotificationStore.getState().addNotification({
        id: 'notif_breach_' + budget.id + '_' + Date.now(),
        userId: 'local',
        agentId: 'agent_budget',
        title: `🚨 Overbudget Alert: ${budget.name || budget.category}`,
        body: `This ₹${txAmount.toLocaleString('en-IN')} spend at ${parsedTx.merchant} puts you ₹${overAmount.toLocaleString('en-IN')} over your budget limit.`,
        type: 'budget_alert',
        readStatus: false,
        payload: { budgetId: budget.id, percentage, overAmount },
        createdAt: Date.now(),
      });
      break;
    } else if (percentage >= 80 && netData.netSpend < limit * 0.8) {
      // 80% Warning Threshold Nudge (Moment of spend)
      const pacing = calculateBudgetPacing(budget, newNetSpend);
      useNotificationStore.getState().addNotification({
        id: 'notif_warning_' + budget.id + '_' + Date.now(),
        userId: 'local',
        agentId: 'agent_budget',
        title: `⚠️ 80% Budget Warning: ${budget.name || budget.category}`,
        body: `This ₹${txAmount.toLocaleString('en-IN')} spend at ${parsedTx.merchant} brings you to ${percentage}% of your limit (₹${remaining.toLocaleString('en-IN')} remaining for ${pacing.daysRemaining} days).`,
        type: 'budget_alert',
        readStatus: false,
        payload: { budgetId: budget.id, percentage, remaining },
        createdAt: Date.now(),
      });
      break;
    }
  }
}

export interface AffordabilityResult {
  hasBudget: boolean;
  budgetName: string;
  currentSpend: number;
  newSpend: number;
  limitAmount: number;
  currentPercentage: number;
  newPercentage: number;
  currentDailySafeSpend: number;
  newDailySafeSpend: number;
  verdict: 'safe' | 'caution' | 'breach';
  verdictMessage: string;
  recommendation: string;
}

/**
 * "Can I Afford This?" Instant Spending Simulator
 * Calculates the impact of an intended purchase on the budget ceiling and daily burn rate before buying.
 */
export function simulateAffordability(
  purchaseAmount: number,
  category: string,
  allTransactions: any[]
): AffordabilityResult {
  const { useBudgetStore } = require('../store');
  const budgets: BudgetCategory[] = useBudgetStore.getState().budgets || [];
  const targetCategory = category.toLowerCase();

  // Find matching budget (category specific or overall)
  const matched =
    budgets.find((b: BudgetCategory) => !b.isOverall && (b.category || '').toLowerCase() === targetCategory) ||
    budgets.find((b: BudgetCategory) => b.isOverall);

  if (!matched) {
    return {
      hasBudget: false,
      budgetName: 'No Target Budget Set',
      currentSpend: 0,
      newSpend: purchaseAmount,
      limitAmount: 0,
      currentPercentage: 0,
      newPercentage: 0,
      currentDailySafeSpend: 0,
      newDailySafeSpend: 0,
      verdict: 'safe',
      verdictMessage: `No active budget ceiling exists for ${category}. You can spend freely or set a ceiling.`,
      recommendation: 'Consider creating a budget envelope to track this expense category.',
    };
  }

  const netData = calculateBudgetNetSpend(matched, allTransactions);
  const currentPacing = calculateBudgetPacing(matched, netData.netSpend);
  const newNetSpend = netData.netSpend + purchaseAmount;
  const newPacing = calculateBudgetPacing(matched, newNetSpend);

  let verdict: 'safe' | 'caution' | 'breach' = 'safe';
  let verdictMessage = '';
  let recommendation = '';

  if (newNetSpend >= matched.limitAmount) {
    verdict = 'breach';
    const excess = newNetSpend - matched.limitAmount;
    verdictMessage = `Breach: This purchase will exceed your ${matched.name || matched.category} budget by ₹${excess.toLocaleString('en-IN')}.`;
    recommendation = 'Hold off until the next cycle or transfer funds from another budget envelope.';
  } else if (newPacing.percentageUsed >= 85 || newPacing.dailySafeSpend < currentPacing.dailySafeSpend * 0.6) {
    verdict = 'caution';
    verdictMessage = `Caution: Pushes your budget to ${newPacing.percentageUsed}%. Safe daily spend drops from ₹${currentPacing.dailySafeSpend}/day to ₹${newPacing.dailySafeSpend}/day.`;
    recommendation = `If you proceed, reduce daily discretionary spend by ₹${Math.max(0, currentPacing.dailySafeSpend - newPacing.dailySafeSpend)}/day.`;
  } else {
    verdict = 'safe';
    verdictMessage = `Safe to proceed! Budget remains healthy at ${newPacing.percentageUsed}% used.`;
    recommendation = `You will still have ₹${newPacing.dailySafeSpend.toLocaleString('en-IN')}/day safe discretionary spend for ${newPacing.daysRemaining} days.`;
  }

  return {
    hasBudget: true,
    budgetName: matched.name || matched.category,
    currentSpend: netData.netSpend,
    newSpend: newNetSpend,
    limitAmount: matched.limitAmount,
    currentPercentage: currentPacing.percentageUsed,
    newPercentage: newPacing.percentageUsed,
    currentDailySafeSpend: currentPacing.dailySafeSpend,
    newDailySafeSpend: newPacing.dailySafeSpend,
    verdict,
    verdictMessage,
    recommendation,
  };
}

export interface RegentBriefDigest {
  title: string;
  subtitle: string;
  totalBudgetsCount: number;
  onTrackCount: number;
  atRiskCount: number;
  topWin: string;
  keyRisk: string;
  executiveAction: string;
  freeToSpendLabel: string;
}

/**
 * Weekly Executive Regent Brief
 * High-value Sunday luxury financial digest summarizing budget health and risks.
 */
export function generateRegentBrief(
  budgets: BudgetCategory[],
  transactions: any[],
  freeToSpendRemaining: number
): RegentBriefDigest {
  let onTrackCount = 0;
  let atRiskCount = 0;
  let biggestSavingCategory = '';
  let highestBurnCategory = '';
  let maxUnderSpend = 0;
  let maxOverPercentage = 0;

  for (const budget of budgets) {
    const net = calculateBudgetNetSpend(budget, transactions);
    const pacing = calculateBudgetPacing(budget, net.netSpend);

    if (pacing.paceStatus === 'safe') {
      onTrackCount++;
      const saved = Math.max(0, budget.limitAmount - net.netSpend);
      if (saved > maxUnderSpend) {
        maxUnderSpend = saved;
        biggestSavingCategory = budget.name || budget.category;
      }
    } else {
      atRiskCount++;
      if (pacing.percentageUsed > maxOverPercentage) {
        maxOverPercentage = pacing.percentageUsed;
        highestBurnCategory = budget.name || budget.category;
      }
    }
  }

  const topWin = biggestSavingCategory
    ? `${biggestSavingCategory} is well under control with ₹${maxUnderSpend.toLocaleString('en-IN')} headroom.`
    : 'All spending categories are currently within healthy limits.';

  const keyRisk = highestBurnCategory
    ? `${highestBurnCategory} is tracking at ${maxOverPercentage}% pace.`
    : 'No high-risk overburn detected across active envelopes.';

  const executiveAction = atRiskCount > 0
    ? maxUnderSpend > 0
      ? `Rebalance ₹${maxUnderSpend.toLocaleString('en-IN')} headroom from ${biggestSavingCategory} to stabilize ${highestBurnCategory}.`
      : `Rebalance funds from secondary envelopes to support ${highestBurnCategory}.`
    : 'Pace is ideal. Consider sweeping surplus into wealth targets at cycle end.';

  return {
    title: 'The Regent Brief',
    subtitle: 'Weekly Capital & Spending Executive Summary',
    totalBudgetsCount: budgets.length,
    onTrackCount,
    atRiskCount,
    topWin,
    keyRisk,
    executiveAction,
    freeToSpendLabel: `₹${freeToSpendRemaining.toLocaleString('en-IN')} Available`,
  };
}

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
import { BudgetCategory, BudgetPeriodType, BudgetCustomCategory, useBudgetStore } from '../store';
import { authService } from './authService';
import { BACKEND_URL } from '../config/api';

/**
 * Top 30 Comprehensive Everyday Indian Spending Categories + Overall
 */
export const BUDGET_DEBIT_CATEGORIES = [
  { id: 'all', label: 'Overall Monthly Budget', icon: 'globe-outline', isOverall: true, color: '#2dba4e' },
  { id: 'food', label: 'Food & Dining', icon: 'restaurant-outline', color: '#2dba4e' },
  { id: 'groceries', label: 'Groceries & Supermarket', icon: 'cart-outline', color: '#2dba4e' },
  { id: 'rent', label: 'House Rent', icon: 'home-outline', color: '#2dba4e' },
  { id: 'bills', label: 'Electricity & Utilities', icon: 'flash-outline', color: '#2dba4e' },
  { id: 'recharge', label: 'Mobile & WiFi', icon: 'wifi-outline', color: '#2dba4e' },
  { id: 'fuel', label: 'Fuel (Petrol/Diesel/EV)', icon: 'flame-outline', color: '#2dba4e' },
  { id: 'cab', label: 'Cab & Auto (Uber/Ola)', icon: 'car-outline', color: '#2dba4e' },
  { id: 'transit', label: 'Metro & Public Transit', icon: 'bus-outline', color: '#2dba4e' },
  { id: 'shopping', label: 'Shopping & Clothing', icon: 'shirt-outline', color: '#2dba4e' },
  { id: 'entertainment', label: 'Movies & Outings', icon: 'film-outline', color: '#2dba4e' },
  { id: 'subscriptions', label: 'OTT & Subscriptions', icon: 'tv-outline', color: '#2dba4e' },
  { id: 'fitness', label: 'Gym & Fitness', icon: 'barbell-outline', color: '#2dba4e' },
  { id: 'medical', label: 'Pharmacy & Medicines', icon: 'medkit-outline', color: '#2dba4e' },
  { id: 'doctor', label: 'Doctor & Consultation', icon: 'pulse-outline', color: '#2dba4e' },
  { id: 'salon', label: 'Personal Care & Salon', icon: 'cut-outline', color: '#2dba4e' },
  { id: 'credit_card', label: 'Credit Card Bill', icon: 'card-outline', color: '#2dba4e' },
  { id: 'emi', label: 'EMI & Loan Payments', icon: 'cash-outline', color: '#2dba4e' },
  { id: 'education', label: 'Education & Tuition', icon: 'school-outline', color: '#2dba4e' },
  { id: 'books', label: 'Books & Courses', icon: 'book-outline', color: '#2dba4e' },
  { id: 'investments', label: 'Mutual Funds & SIP', icon: 'trending-up-outline', color: '#2dba4e' },
  { id: 'insurance', label: 'Insurance (Life/Health)', icon: 'shield-checkmark-outline', color: '#2dba4e' },
  { id: 'travel', label: 'Travel & Flights', icon: 'airplane-outline', color: '#2dba4e' },
  { id: 'hotel', label: 'Hotel & Stay', icon: 'bed-outline', color: '#2dba4e' },
  { id: 'maintenance', label: 'Home Maintenance', icon: 'construct-outline', color: '#2dba4e' },
  { id: 'electronics', label: 'Electronics & Gadgets', icon: 'hardware-chip-outline', color: '#2dba4e' },
  { id: 'cafe', label: 'Café & Quick Snacks', icon: 'cafe-outline', color: '#2dba4e' },
  { id: 'nightlife', label: 'Nightlife & Drinks', icon: 'wine-outline', color: '#2dba4e' },
  { id: 'gifts', label: 'Gifts & Celebrations', icon: 'gift-outline', color: '#2dba4e' },
  { id: 'pets', label: 'Pet Care & Supplies', icon: 'paw-outline', color: '#2dba4e' },
  { id: 'charity', label: 'Charity & Donations', icon: 'heart-outline', color: '#2dba4e' },
  { id: 'other_expense', label: 'Other Expense', icon: 'pricetag-outline', color: '#2dba4e' },
];

/**
 * Simplified Budget Duration: EXACTLY 2 Options
 */
export const BUDGET_PERIOD_PRESETS: { id: BudgetPeriodType; label: string; badge: string; desc: string }[] = [
  { id: 'monthly', label: 'Monthly Budget', badge: 'Default', desc: 'Current calendar month or custom monthly cycle' },
  { id: 'custom_event', label: 'Special / Event Budget', badge: 'Custom Dates', desc: 'Trip, festival, wedding, or planned event' },
];

export type BudgetStatus = 'not_started' | 'in_progress' | 'paused' | 'done';

export function getBudgetStatus(
  budget: BudgetCategory,
  now: number = Date.now()
): {
  status: BudgetStatus;
  label: string;
  color: string;
  icon: string;
  badgeBg: string;
} {
  if (budget.isDone) {
    return {
      status: 'done',
      label: 'Done',
      color: '#2dba4e',
      icon: 'checkmark-circle',
      badgeBg: 'rgba(45, 186, 78, 0.15)',
    };
  }
  if (budget.isPaused) {
    return {
      status: 'paused',
      label: 'Paused',
      color: '#e3b341',
      icon: 'pause-circle',
      badgeBg: 'rgba(227, 179, 65, 0.15)',
    };
  }
  const start = budget.startDate || 0;
  const end = budget.endDate || Infinity;
  const isEarly = !!budget.isManuallyActivated;

  if (now > end) {
    return {
      status: 'done',
      label: 'Done',
      color: '#2dba4e',
      icon: 'checkmark-circle',
      badgeBg: 'rgba(45, 186, 78, 0.15)',
    };
  }
  if (now < start && !isEarly) {
    return {
      status: 'not_started',
      label: 'Upcoming',
      color: '#94a3b8',
      icon: 'hourglass-outline',
      badgeBg: 'rgba(255, 255, 255, 0.08)',
    };
  }
  return {
    status: 'in_progress',
    label: 'In Progress',
    color: '#2dba4e',
    icon: 'radio-button-on',
    badgeBg: 'rgba(45, 186, 78, 0.15)',
  };
}

/**
 * Extracts reusable configuration from an existing budget for cloning/templating
 */
export function getBudgetTemplateData(
  budget: BudgetCategory,
  allBudgets: BudgetCategory[]
): {
  amount: number;
  name: string;
  category: string;
  periodType: BudgetPeriodType;
  subCategories: Array<{ category: string; limitAmount: number; name?: string; customCategoryDef?: any }>;
  customCategoryDef?: any;
} {
  const isOverall = !!budget.isOverall;
  const relatedSubBudgets = isOverall
    ? allBudgets.filter((b) => !b.isOverall && (b.parentBudgetId === budget.id || (!b.parentBudgetId && b.period === budget.period)))
    : [];

  return {
    amount: Number(budget.limitAmount || 0),
    name: budget.name || '',
    category: budget.category || 'all',
    periodType: budget.periodType || 'monthly',
    subCategories: relatedSubBudgets.map((sb) => ({
      category: sb.category,
      limitAmount: Number(sb.limitAmount || 0),
      name: sb.name,
      customCategoryDef: sb.customCategoryDef,
    })),
    customCategoryDef: budget.customCategoryDef,
  };
}

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

    case 'custom':
    case 'custom_event': {
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
export function isExcludedFromBudget(tx: any, explicitExcludedIds?: string[]): boolean {
  if (!tx) return false;
  if (tx.isSelfTransfer === true || tx.excludedFromBudget === true) return true;
  const category = (tx.category || tx.tag || '').toLowerCase().trim();
  if (
    category === 'transfer' ||
    category === 'self_transfer' ||
    category === 'self transfer' ||
    category === 'self-transfer'
  ) return true;

  if (explicitExcludedIds && tx.id && explicitExcludedIds.includes(tx.id)) {
    return true;
  }

  try {
    const { useBudgetStore } = require('../store');
    const excludedIds: string[] = useBudgetStore.getState().excludedTransactionIds || [];
    if (tx.id && excludedIds.includes(tx.id)) return true;
  } catch { }

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
    'SELF TRF',
    'OWN A/C',
  ];

  return excludedPatterns.some((pattern) => note.includes(pattern));
}

/**
 * Category alias dictionary to link various transaction spend tags/categories
 * to their respective budget categories seamlessly.
 */
export const CATEGORY_ALIASES: Record<string, string[]> = {
  fuel: ['fuel', 'petrol', 'diesel', 'cng', 'ev', 'ev charging', 'gas'],
  bills: ['bills', 'bill', 'electricity', 'utilities', 'utility', 'water', 'power', 'bescom', 'gas bill', 'maintenance'],
  recharge: ['recharge', 'mobile', 'wifi', 'broadband', 'dth', 'internet', 'airtel', 'jio'],
  food: ['food', 'dining', 'restaurant', 'cafe', 'snacks', 'breakfast', 'lunch', 'dinner', 'zomato', 'swiggy', 'poha'],
  groceries: ['groceries', 'grocery', 'supermarket', 'mart', 'vegetables', 'blinkit', 'zepto', 'instamart'],
  cab: ['cab', 'taxi', 'uber', 'ola', 'auto', 'rapido'],
  transit: ['transit', 'metro', 'bus', 'train', 'irctc'],
  shopping: ['shopping', 'clothing', 'apparel', 'ecommerce', 'amazon', 'flipkart', 'myntra', 'zara'],
  medical: ['medical', 'medicine', 'medicines', 'pharmacy', 'chemist', '1mg', 'apollo'],
  doctor: ['doctor', 'consultation', 'clinic', 'hospital'],
  entertainment: ['entertainment', 'movies', 'cinema', 'theatre', 'bookmyshow'],
  subscriptions: ['subscriptions', 'subscription', 'ott', 'netflix', 'spotify', 'hotstar', 'prime'],
  investments: ['investments', 'investment', 'sip', 'mutual_funds', 'stocks', 'zerodha', 'groww'],
  rent: ['rent', 'house_rent', 'home_rent'],
  fitness: ['fitness', 'gym', 'yoga', 'cult', 'sports'],
  education: ['education', 'tuition', 'school', 'college', 'course', 'books'],
  travel: ['travel', 'flights', 'hotel', 'trip', 'makemytrip'],
};

/**
 * Robust category matching that checks exact ID, canonical names, and synonyms/aliases.
 */
export function isCategoryMatching(
  txCategoryRaw: string | undefined,
  budgetCategoryRaw: string | undefined,
  isOverall: boolean = false
): boolean {
  if (isOverall) return true;
  const txCat = (txCategoryRaw || 'other_expense').toLowerCase().trim();
  const bCat = (budgetCategoryRaw || '').toLowerCase().trim();
  if (!bCat) return false;

  if (txCat === bCat) return true;

  // Direct alias check for budget category
  const bAliases = CATEGORY_ALIASES[bCat];
  if (bAliases && bAliases.includes(txCat)) return true;

  // Cross-reference checks across known alias maps
  for (const [canonical, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (canonical === bCat && aliases.includes(txCat)) return true;
    if (aliases.includes(bCat) && (aliases.includes(txCat) || canonical === txCat)) return true;
  }

  return false;
}

/**
 * Calculate Spend for a Budget within its active date window
 * Strictly tracks DEBIT spending only. No credits or refunds mixed in.
 * Supports manual early-tracking activation before scheduled start date.
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
  isUpcoming: boolean;
  isPaused: boolean;
  effectiveStartDate: number;
  daysUntilStart: number;
} {
  const isPaused = !!budget.isPaused;
  const now = Date.now();
  const rawStart = budget.startDate || getISTStartOfDay(startOfMonth(new Date()));
  const isManuallyActivated = !!budget.isManuallyActivated;

  // If budget tracking is turned off / paused, do not track transactions
  if (isPaused) {
    return {
      grossSpend: 0,
      refunds: 0,
      netSpend: 0,
      transactionCount: 0,
      matchingTransactions: [],
      isUpcoming: false,
      isPaused: true,
      effectiveStartDate: rawStart,
      daysUntilStart: 0,
    };
  }

  // If user activated early, track from effectiveStartDate or now, whichever is valid
  const effectiveStart = isManuallyActivated
    ? (budget.effectiveStartDate || now)
    : rawStart;

  const endDate = budget.endDate || getISTEndOfDay(endOfMonth(new Date()));
  const isOverall = !!budget.isOverall;
  const targetCategory = (budget.category || '').toLowerCase();

  const isUpcoming = rawStart > now && !isManuallyActivated;
  const daysUntilStart = isUpcoming ? Math.max(1, Math.ceil((rawStart - now) / (1000 * 60 * 60 * 24))) : 0;

  let grossSpend = 0;
  let transactionCount = 0;
  const matchingTransactions: any[] = [];

  // Only track debits if active (not future upcoming, or manually activated early)
  if (!isUpcoming) {
    for (const tx of transactions) {
      if (tx.isDeleted) continue;
      if (isExcludedFromBudget(tx)) continue;

      // Pure DEBIT spend tracking only (strictly exclude credits, income, salary)
      const isCredit = tx.type === 'credit' || !!tx.isSalary;
      const isDebit = !isCredit && (tx.type ? tx.type === 'debit' : true);
      if (!isDebit) continue;

      const txTime = typeof tx.timestamp === 'number' ? tx.timestamp : new Date(tx.timestamp || tx.date).getTime();
      if (isNaN(txTime)) continue;

      // Only count transactions within the active window
      if (txTime < effectiveStart || txTime > endDate) continue;

      const txCategory = (tx.category || 'other_expense').toLowerCase();
      const isCategoryMatch = isCategoryMatching(txCategory, targetCategory, isOverall);

      if (!isCategoryMatch) continue;

      const amount = Math.abs(parseFloat(tx.amount || 0));
      if (isNaN(amount) || amount === 0) continue;

      grossSpend += amount;
      transactionCount += 1;
      matchingTransactions.push(tx);
    }
  }

  return {
    grossSpend,
    refunds: 0,
    netSpend: grossSpend,
    transactionCount,
    matchingTransactions,
    isUpcoming,
    isPaused: false,
    effectiveStartDate: effectiveStart,
    daysUntilStart,
  };
}

export interface UnallocatedCategoryGroup {
  category: string;
  label: string;
  icon: string;
  color: string;
  totalSpent: number;
  count: number;
  transactions: any[];
}

/**
 * Hierarchical Sub-Budget & Free to Spend Allocation Calculation
 * (e.g. ₹9,000 overall - ₹3,000 Rent - ₹3,000 Food = ₹3,000 Free to Spend Cash)
 */
export function calculateBudgetHierarchy(
  overallBudget: BudgetCategory | undefined,
  subBudgets: BudgetCategory[],
  allTransactions: any[]
): {
  totalLimit: number;
  totalSpent: number;
  totalRemaining: number;
  allocatedLimit: number;
  unallocatedBuffer: number;
  unallocatedSpent: number;
  unallocatedRemaining: number;
  dailySafeSpend: number;
  daysRemaining: number;
  unallocatedTransactions: any[];
  unallocatedBreakdown: UnallocatedCategoryGroup[];
} {
  const totalLimit = overallBudget ? Number(overallBudget.limitAmount || 0) : 0;

  // Overall debits during cycle
  const overallSpendData = overallBudget
    ? calculateBudgetNetSpend(overallBudget, allTransactions)
    : { netSpend: 0, matchingTransactions: [] };
  const totalSpent = overallSpendData.netSpend;
  const totalRemaining = Math.max(0, totalLimit - totalSpent);

  // Sub-categories allocated
  const allocatedLimit = subBudgets.reduce((acc, b) => acc + Number(b.limitAmount || 0), 0);
  const unallocatedBuffer = Math.max(0, totalLimit - allocatedLimit);

  // Sub-categories spent & matching tracker
  let allocatedSpent = 0;
  for (const b of subBudgets) {
    const s = calculateBudgetNetSpend(b, allTransactions);
    allocatedSpent += s.netSpend;
  }

  // Any spend outside specific allocated categories reduces the unallocated buffer
  const unallocatedSpent = Math.max(0, totalSpent - allocatedSpent);
  const unallocatedRemaining = Math.max(0, unallocatedBuffer - unallocatedSpent);

  // Identify transactions outside allocated sub-budgets
  const unallocatedTransactions: any[] = [];
  const groupMap = new Map<string, { totalSpent: number; count: number; txs: any[] }>();

  if (overallSpendData.matchingTransactions && overallSpendData.matchingTransactions.length > 0) {
    for (const tx of overallSpendData.matchingTransactions) {
      const matchesSubBudget = subBudgets.some((b) =>
        isCategoryMatching(tx.category, b.category, false)
      );
      if (!matchesSubBudget) {
        unallocatedTransactions.push(tx);
        const catKey = (tx.category || 'other_expense').toLowerCase();
        const amt = Math.abs(parseFloat(tx.amount || 0)) || 0;
        const existing = groupMap.get(catKey) || { totalSpent: 0, count: 0, txs: [] };
        existing.totalSpent += amt;
        existing.count += 1;
        existing.txs.push(tx);
        groupMap.set(catKey, existing);
      }
    }
  }

  const unallocatedBreakdown: UnallocatedCategoryGroup[] = Array.from(groupMap.entries())
    .map(([catKey, data]) => {
      const meta = getCategoryMeta(catKey);
      return {
        category: catKey,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        totalSpent: data.totalSpent,
        count: data.count,
        transactions: data.txs.sort((a: any, b: any) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0)),
      };
    })
    .sort((a, b) => b.totalSpent - a.totalSpent);

  // Days remaining in cycle
  const now = Date.now();
  const endDate = overallBudget?.endDate || getISTEndOfDay(endOfMonth(new Date()));
  const daysRemaining = Math.max(1, Math.ceil((endDate - now) / (1000 * 60 * 60 * 24)));

  // Daily safe spend is calculated strictly from the unallocated free cash buffer!
  const dailySafeSpend = Math.round(unallocatedRemaining / daysRemaining);

  return {
    totalLimit,
    totalSpent,
    totalRemaining,
    allocatedLimit,
    unallocatedBuffer,
    unallocatedSpent,
    unallocatedRemaining,
    dailySafeSpend,
    daysRemaining,
    unallocatedTransactions,
    unallocatedBreakdown,
  };
}

/**
 * Universal category metadata resolver (supports built-in and user-created custom categories)
 */
export function getCategoryMeta(
  catId: string,
  isOverall?: boolean,
  customDef?: BudgetCustomCategory
): { id: string; label: string; icon: string; color: string; isOverall?: boolean } {
  if (isOverall) return BUDGET_DEBIT_CATEGORIES[0];
  if (customDef) {
    return {
      id: catId,
      label: customDef.label,
      icon: customDef.icon,
      color: customDef.color,
    };
  }
  const cleanId = (catId || '').toLowerCase();
  const found = BUDGET_DEBIT_CATEGORIES.find((c) => c.id === cleanId);
  if (found) return found;
  return {
    id: catId,
    label: catId ? catId.charAt(0).toUpperCase() + catId.slice(1) : 'Expense',
    icon: 'pricetag-outline',
    color: '#94a3b8',
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
    parentBudgetId?: string;
    isManuallyActivated?: boolean;
    effectiveStartDate?: number;
    customCategoryDef?: BudgetCustomCategory;
  }): Promise<BudgetCategory> {
    const token = await authService.getAccessToken();

    // Prevent duplicate overall monthly budget for the same month/period
    if (payload.isOverall && (!payload.periodType || payload.periodType === 'monthly')) {
      const existingBudgets = useBudgetStore.getState().budgets || [];
      const targetPeriod = (payload.period || (payload.startDate ? format(new Date(payload.startDate), 'MMMM yyyy') : '')).toLowerCase().trim();
      const existing = existingBudgets.find((b) => {
        if (!b.isOverall || (b.periodType && b.periodType !== 'monthly')) return false;
        const bPeriod = (b.period || (b.startDate ? format(new Date(b.startDate), 'MMMM yyyy') : '')).toLowerCase().trim();
        return bPeriod && targetPeriod && bPeriod === targetPeriod;
      });

      if (existing) {
        console.warn(`[budgetService] Duplicate overall monthly budget prevented for "${targetPeriod}". Updating existing budget (${existing.id}) instead.`);
        await this.updateBudget(existing.id, {
          limitAmount: payload.limitAmount,
          name: payload.name || existing.name,
          startDate: payload.startDate || existing.startDate,
          endDate: payload.endDate || existing.endDate,
        });
        return {
          ...existing,
          limitAmount: payload.limitAmount,
          name: payload.name || existing.name,
          startDate: payload.startDate || existing.startDate,
          endDate: payload.endDate || existing.endDate,
        };
      }
    }

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
      parentBudgetId: payload.parentBudgetId,
      isManuallyActivated: payload.isManuallyActivated || false,
      effectiveStartDate: payload.effectiveStartDate,
      customCategoryDef: payload.customCategoryDef,
    };

    // Optimistically update local store
    useBudgetStore.getState().addBudget(budgetItem);

    if (token) {
      fetch(`${BACKEND_URL}/sync/budget`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(budgetItem),
      }).catch((err: any) => {
        console.warn('[BudgetService] Offline fallback for create budget:', err.message);
      });
    }

    return budgetItem;
  },

  /**
   * Batch create multiple sub-category budgets in a single state update with non-blocking sync
   */
  async createBudgetsBatch(payloads: Array<{
    name?: string;
    category?: string;
    limitAmount: number;
    period?: string;
    periodType?: BudgetPeriodType;
    startDate?: number;
    endDate?: number;
    isOverall?: boolean;
    fixedObligations?: number;
    parentBudgetId?: string;
    isManuallyActivated?: boolean;
    effectiveStartDate?: number;
    customCategoryDef?: BudgetCustomCategory;
  }>): Promise<BudgetCategory[]> {
    if (!payloads.length) return [];

    const items: BudgetCategory[] = payloads.map((payload) => ({
      id: 'budget_' + (payload.category || 'all') + '_' + Math.random().toString(36).substr(2, 9),
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
      parentBudgetId: payload.parentBudgetId,
      isManuallyActivated: payload.isManuallyActivated || false,
      effectiveStartDate: payload.effectiveStartDate,
      customCategoryDef: payload.customCategoryDef,
    }));

    // Optimistically add all items to store at once
    const currentBudgets = useBudgetStore.getState().budgets || [];
    useBudgetStore.setState({ budgets: [...currentBudgets, ...items] });

    // Background non-blocking sync to backend
    const token = await authService.getAccessToken();
    if (token) {
      items.forEach((item) => {
        fetch(`${BACKEND_URL}/sync/budget`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(item),
        }).catch((err: any) => console.warn('[BudgetService] Offline fallback for batch create:', err?.message));
      });
    }

    return items;
  },

  /**
   * Automatically detect and remove duplicate monthly overall budgets and duplicate sub-categories
   */
  async cleanupDuplicateBudgets(): Promise<void> {
    const budgets = useBudgetStore.getState().budgets || [];
    const overallMonthly = budgets.filter((b) => b.isOverall && (!b.periodType || b.periodType === 'monthly'));

    const seenMonthPeriods = new Map<string, BudgetCategory>();
    const duplicateIdsToDelete: string[] = [];

    // Deduplicate overall budgets
    for (const b of overallMonthly) {
      const periodKey = (b.period || (b.startDate ? format(new Date(b.startDate), 'MMMM yyyy') : b.id)).toLowerCase().trim();
      if (seenMonthPeriods.has(periodKey)) {
        duplicateIdsToDelete.push(b.id);
      } else {
        seenMonthPeriods.set(periodKey, b);
      }
    }

    // Deduplicate sub-categories under the same parent/period
    const subCategories = budgets.filter((b) => !b.isOverall && (!b.periodType || b.periodType === 'monthly'));
    const seenSubs = new Set<string>();

    for (const b of subCategories) {
      const parentKey = b.parentBudgetId || b.period || 'none';
      const subKey = `${parentKey}_${(b.category || '').toLowerCase().trim()}`;
      if (seenSubs.has(subKey)) {
        duplicateIdsToDelete.push(b.id);
      } else {
        seenSubs.add(subKey);
      }
    }

    if (duplicateIdsToDelete.length > 0) {
      console.log(`[BudgetService] Removing ${duplicateIdsToDelete.length} duplicate budgets...`);
      for (const dupId of duplicateIdsToDelete) {
        await this.deleteBudget(dupId).catch(() => {});
      }
    }
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
  parsedTx: {
    amount: number;
    type: 'credit' | 'debit';
    merchant: string;
    category?: string;
    isSalary?: boolean;
    timestamp?: number;
    date?: string;
  },
  allTransactions: any[]
): void {
  const { useBudgetStore, useNotificationStore } = require('../store');
  const budgets: BudgetCategory[] = useBudgetStore.getState().budgets || [];
  if (budgets.length === 0) return;

  // 1. Salary Credit Alert & Budget Cycle Rollover Nudge
  if (parsedTx.isSalary || parsedTx.type === 'credit') {
    if (parsedTx.isSalary || (parsedTx.merchant && parsedTx.merchant.toUpperCase().includes('SALARY'))) {
      const notifStore = useNotificationStore.getState();
      const existingNotifs = notifStore.notifications || [];

      // Check if a salary notification already exists for this transaction or similar amount
      const alreadyNotified = existingNotifs.some((n: any) => {
        if (
          n.payload?.isSalaryCycleNudge &&
          Math.abs(Number(n.payload?.amount || 0) - parsedTx.amount) < 1
        ) {
          return true;
        }
        if (
          n.title &&
          n.title.includes('Salary Credit Detected') &&
          (n.body?.includes(parsedTx.merchant) ||
            Math.abs(Number(n.payload?.amount || 0) - parsedTx.amount) < 1)
        ) {
          return true;
        }
        return false;
      });

      if (alreadyNotified) {
        return;
      }

      const notifId =
        'notif_salary_' +
        (parsedTx.merchant || 'merchant').replace(/[^a-zA-Z0-9]/g, '_') +
        '_' +
        Math.round(parsedTx.amount);

      notifStore.addNotification({
        id: notifId,
        userId: 'local',
        agentId: 'agent_budget',
        title: '💼 Salary Credit Detected!',
        body: `₹${Number(parsedTx.amount || 0).toLocaleString('en-IN')} credited from ${parsedTx.merchant}. Would you like to start your new budget cycle today?`,
        type: 'recommendation',
        readStatus: false,
        payload: { isSalaryCycleNudge: true, amount: parsedTx.amount },
        createdAt: parsedTx.timestamp || Date.now(),
      });
    }
    return;
  }

  // 2. Debit Transaction Budget Alerts
  if (parsedTx.type !== 'debit') return;

  const targetCategory = (parsedTx.category || '').toLowerCase();
  const txAmount = Math.abs(Number(parsedTx.amount || 0));

  for (const budget of budgets) {
    if (budget.isPaused) continue;
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
      const notifStore = useNotificationStore.getState();
      const existingNotifs = notifStore.notifications || [];
      const alreadyHasBreach = existingNotifs.some(
        (n: any) => n.type === 'budget_alert' && n.payload?.budgetId === budget.id
      );
      if (!alreadyHasBreach) {
        const notifId = `notif_breach_${budget.id}_${budget.period || 'current'}`;
        notifStore.addNotification({
          id: notifId,
          userId: 'local',
          agentId: 'agent_budget',
          title: `🚨 Overbudget Alert: ${budget.name || budget.category}`,
          body: `This ₹${txAmount.toLocaleString('en-IN')} spend at ${parsedTx.merchant} puts you ₹${overAmount.toLocaleString('en-IN')} over your budget limit.`,
          type: 'budget_alert',
          readStatus: false,
          payload: { budgetId: budget.id, percentage, overAmount },
          createdAt: parsedTx.timestamp || Date.now(),
        });
      }
      break;
    } else if (percentage >= 80 && netData.netSpend < limit * 0.8) {
      // 80% Warning Threshold Nudge (Moment of spend)
      const notifStore = useNotificationStore.getState();
      const existingNotifs = notifStore.notifications || [];
      const alreadyHasWarning = existingNotifs.some(
        (n: any) => n.type === 'budget_alert' && n.payload?.budgetId === budget.id
      );
      if (!alreadyHasWarning) {
        const pacing = calculateBudgetPacing(budget, newNetSpend);
        const notifId = `notif_warning_${budget.id}_${budget.period || 'current'}`;
        notifStore.addNotification({
          id: notifId,
          userId: 'local',
          agentId: 'agent_budget',
          title: `⚠️ 80% Budget Warning: ${budget.name || budget.category}`,
          body: `This ₹${txAmount.toLocaleString('en-IN')} spend at ${parsedTx.merchant} brings you to ${percentage}% of your limit (₹${remaining.toLocaleString('en-IN')} remaining for ${pacing.daysRemaining} days).`,
          type: 'budget_alert',
          readStatus: false,
          payload: { budgetId: budget.id, percentage, remaining },
          createdAt: parsedTx.timestamp || Date.now(),
        });
      }
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

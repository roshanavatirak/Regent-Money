import { useMemo, useState } from 'react';
import { useTransactionStore, useBankStore } from '../store';

export interface DayFinancialData {
  dateKey: string; // YYYY-MM-DD
  dayNumber: number;
  totalDebit: number;
  totalCredit: number;
  netDiff: number;
  transactions: any[];
  isNoSpend: boolean;
  isToday: boolean;
  isAccountCreatedDay: boolean;
  expectedBills: Array<{ merchant: string; amount: number }>;
}

export interface PeakDayRecord {
  date: string;
  amount: number;
  tx?: any;
}

export interface PeakWeekRecord {
  weekKey: string;
  spent: number;
}

export interface PeakSpendMonthRecord {
  monthKey: string;
  spent: number;
}

export interface BestSavingsMonthRecord {
  monthKey: string;
  rate: number;
  saved: number;
}

export interface MonthSummaryRow {
  monthKey: string; // YYYY-MM
  monthLabel: string;
  spent: number;
  earned: number;
  savingsRate: number; // percentage
}

export interface CalendarRecordsState {
  peakDay: PeakDayRecord | null;
  peakWeek: PeakWeekRecord | null;
  peakSpendMonth: PeakSpendMonthRecord | null;
  bestSavingsMonth: BestSavingsMonthRecord | null;
  longestNoSpendStreak: number;
  currentNoSpendStreak: number;
  monthRows: MonthSummaryRow[];
}

/**
 * Robust, memoized calculation engine for the Financial Calendar & All-Time Records.
 * Excludes self-account transfers and credit card bill payments so spending metrics are 100% true.
 */
export function useCalendarAnalytics(currentDate: Date, userCreatedAt?: string | number | null) {
  const transactions = useTransactionStore((state: any) => state.transactions) || [];
  const bankProfiles = useBankStore((state: any) => state.bankProfiles) || [];

  // Excluded transaction IDs for records (user can toggle unusual one-offs like laptop repair)
  const [excludedRecordTxIds, setExcludedRecordTxIds] = useState<Set<string>>(new Set());

  // Filter out self-transfers and credit card payments
  const eligibleTransactions = useMemo(() => {
    return (transactions as any[]).filter((tx: any) => {
      if (tx.isDeleted) return false;
      const cat = (tx.category || '').toLowerCase();
      const merchant = (tx.merchant || '').toLowerCase();

      // Exclude self transfers & card bill repayments
      if (
        cat.includes('transfer') ||
        cat.includes('credit card bill') ||
        cat.includes('card payment') ||
        cat.includes('self transfer') ||
        merchant.includes('credit card payment') ||
        merchant.includes('billdesk cc')
      ) {
        return false;
      }
      return true;
    });
  }, [transactions]);

  // Map of account creation day
  const createdDateKey = useMemo(() => {
    if (!userCreatedAt) return null;
    const d = new Date(userCreatedAt);
    if (isNaN(d.getTime())) return null;
    return d.toISOString().split('T')[0];
  }, [userCreatedAt]);

  // Detected recurring bills (analyzed from recurring merchants across distinct months)
  const recurringBillsByDayOfMonth = useMemo(() => {
    const dayMap = new Map<number, Array<{ merchant: string; amount: number }>>();
    const merchantHistory = new Map<string, { days: number[]; amounts: number[]; monthKeys: Set<string> }>();

    eligibleTransactions.forEach((tx: any) => {
      if (tx.type !== 'debit') return;
      const t = Number(tx.timestamp || 0);
      if (!t) return;
      const d = new Date(t);
      const day = d.getDate();
      const monthKey = `${d.getFullYear()}-${d.getMonth() + 1}`;
      const name = (tx.merchant || '').trim();
      const amt = Number(tx.amount || 0);
      const cat = (tx.category || '').toLowerCase();
      const isBillCat =
        cat.includes('bill') ||
        cat.includes('utilit') ||
        cat.includes('subscri') ||
        cat.includes('rent') ||
        cat.includes('emi') ||
        cat.includes('insurance');

      // Genuine bills only: at least ₹99 or explicit bill category
      if (!name || name === 'Spends' || name.length < 3) return;
      if (amt < 99 && !isBillCat) return;

      if (!merchantHistory.has(name)) {
        merchantHistory.set(name, { days: [], amounts: [], monthKeys: new Set() });
      }
      const item = merchantHistory.get(name)!;
      item.days.push(day);
      item.amounts.push(amt);
      item.monthKeys.add(monthKey);
    });

    // Only if merchant appears across at least 2 distinct calendar months
    merchantHistory.forEach((val, merchant) => {
      if (val.monthKeys.size >= 2) {
        const avgDay = Math.round(val.days.reduce((a, b) => a + b, 0) / val.days.length);
        const avgAmount = Math.round(val.amounts.reduce((a, b) => a + b, 0) / val.amounts.length);
        if (!dayMap.has(avgDay)) dayMap.set(avgDay, []);
        dayMap.get(avgDay)!.push({ merchant, amount: avgAmount });
      }
    });

    return dayMap;
  }, [eligibleTransactions]);

  // Build a fast O(1) day-level aggregation map: dateKey -> DayFinancialData
  const dailyDataMap = useMemo(() => {
    const map = new Map<string, { debits: number; credits: number; txs: any[] }>();

    eligibleTransactions.forEach((tx: any) => {
      const t = Number(tx.timestamp || 0);
      if (!t) return;
      const dateKey = tx.date || new Date(t).toISOString().split('T')[0];
      if (!map.has(dateKey)) {
        map.set(dateKey, { debits: 0, credits: 0, txs: [] });
      }
      const entry = map.get(dateKey)!;
      const amt = Number(tx.amount || 0);
      if (tx.type === 'debit') {
        entry.debits += amt;
      } else if (tx.type === 'credit') {
        entry.credits += amt;
      }
      entry.txs.push(tx);
    });

    return map;
  }, [eligibleTransactions]);

  // Detect likely salary payday (day of month with explicit salary credit or highest high-value credit)
  const salaryPayday = useMemo<number | null>(() => {
    const salaryCredits: Array<{ day: number; amount: number }> = [];
    const highCreditsByDay = new Map<number, number>();

    eligibleTransactions.forEach((item: any) => {
      if (item.type !== 'credit') return;
      const t = Number(item.timestamp || 0);
      if (!t) return;
      const d = new Date(t);
      const day = d.getDate();
      const amt = Number(item.amount || 0);
      const desc = ((item.merchant || '') + ' ' + (item.category || '')).toLowerCase();

      if (desc.includes('salary') || desc.includes('payroll') || desc.includes('stipend')) {
        salaryCredits.push({ day, amount: amt });
      } else if (amt >= 5000) {
        highCreditsByDay.set(day, (highCreditsByDay.get(day) || 0) + amt);
      }
    });

    if (salaryCredits.length > 0) {
      salaryCredits.sort((a, b) => b.amount - a.amount);
      return salaryCredits[0].day;
    }

    if (highCreditsByDay.size > 0) {
      let bestDay: number | null = null;
      let maxCredit = 0;
      highCreditsByDay.forEach((total, day) => {
        if (total > maxCredit) {
          maxCredit = total;
          bestDay = day;
        }
      });
      return bestDay;
    }

    return null;
  }, [eligibleTransactions]);

  // Salary cycle daily allowance calculation
  const salaryCycleStats = useMemo(() => {
    const totalBalance = (bankProfiles as any[]).reduce(
      (acc: number, b: any) => acc + parseFloat(String(b.currentBalance || 0)),
      0
    );

    if (salaryPayday === null) {
      return {
        daysLeft: null as number | null,
        nextSalaryDate: null as Date | null,
        totalBalance: bankProfiles.length > 0 ? totalBalance : null,
        dailyAllowance: null as number | null,
        payday: null as number | null,
      };
    }

    const today = new Date();
    const currentDay = today.getDate();
    let nextSalaryDate: Date;

    if (currentDay < salaryPayday) {
      nextSalaryDate = new Date(today.getFullYear(), today.getMonth(), salaryPayday);
    } else {
      nextSalaryDate = new Date(today.getFullYear(), today.getMonth() + 1, salaryPayday);
    }

    const diffMs = nextSalaryDate.getTime() - today.getTime();
    const daysLeft = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const dailyAllowance = Math.max(0, Math.round(totalBalance / daysLeft));

    return {
      daysLeft,
      nextSalaryDate,
      totalBalance: bankProfiles.length > 0 ? totalBalance : null,
      dailyAllowance,
      payday: salaryPayday,
    };
  }, [salaryPayday, bankProfiles]);

  // Compute all-time records and wins
  const records: CalendarRecordsState = useMemo(() => {
    let peakDay: PeakDayRecord | null = null;
    let longestNoSpendStreak = 0;
    let currentNoSpendStreak = 0;
    const weeklyTotals = new Map<string, number>();
    const monthlyTotals = new Map<string, { spent: number; earned: number }>();

    // Sort dates
    const allDates = Array.from(dailyDataMap.keys()).sort();

    // Check genuine no-spend streaks only within actively tracked months
    let streakCount = 0;
    if (allDates.length > 0) {
      // Tally transaction count by month to identify actively monitored months
      const monthTxCount = new Map<string, number>();
      allDates.forEach((d) => {
        const mKey = d.slice(0, 7);
        const count = dailyDataMap.get(d)?.txs?.length || 0;
        monthTxCount.set(mKey, (monthTxCount.get(mKey) || 0) + count);
      });

      const activeMonths = new Set<string>();
      monthTxCount.forEach((cnt, mKey) => {
        if (cnt >= 2) activeMonths.add(mKey);
      });

      // Start date: respect userCreatedAt, or earliest active month date
      let startDate: Date;
      if (userCreatedAt) {
        const parsed = new Date(userCreatedAt);
        startDate = !isNaN(parsed.getTime()) ? parsed : new Date(allDates[0]);
      } else {
        const activeDates = allDates.filter((k) => activeMonths.has(k.slice(0, 7)));
        startDate = activeDates.length > 0 ? new Date(activeDates[0]) : new Date(allDates[0]);
      }

      const curr = new Date(startDate);
      curr.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      while (curr <= today) {
        const mKey = curr.toISOString().slice(0, 7);
        const isCurrentMonth = mKey === today.toISOString().slice(0, 7);

        // Only evaluate streak if the month had active transactions or is the current month
        if (activeMonths.has(mKey) || isCurrentMonth) {
          const k = curr.toISOString().split('T')[0];
          const data = dailyDataMap.get(k);
          const hasDebits = (data?.debits || 0) > 0;

          if (!hasDebits) {
            streakCount++;
            // Inactivity beyond 7 consecutive days in real life is unmonitored silence, not a streak
            if (streakCount > 7) {
              streakCount = 0;
            }
            if (streakCount > longestNoSpendStreak) {
              longestNoSpendStreak = streakCount;
            }
          } else {
            streakCount = 0;
          }
        } else {
          // Unmonitored inactive month (e.g. multi-month gap) - reset streak
          streakCount = 0;
        }
        curr.setDate(curr.getDate() + 1);
      }
      currentNoSpendStreak = streakCount;
    }

    // Daily peaks, weekly, and monthly totals
    dailyDataMap.forEach((entry, dateKey) => {
      // Find peak day (ignoring user-excluded one-offs)
      const validTxs = entry.txs.filter((t: any) => t.type === 'debit' && !excludedRecordTxIds.has(t.id));
      const dailySpend = validTxs.reduce((sum: number, t: any) => sum + Number(t.amount || 0), 0);

      if (dailySpend > 0 && (!peakDay || dailySpend > peakDay.amount)) {
        // Find biggest single transaction on this day for context
        const biggestTx = validTxs.sort((a: any, b: any) => Number(b.amount || 0) - Number(a.amount || 0))[0];
        peakDay = { date: dateKey, amount: dailySpend, tx: biggestTx };
      }

      // Group into Month (YYYY-MM)
      const monthKey = dateKey.slice(0, 7);
      if (!monthlyTotals.has(monthKey)) {
        monthlyTotals.set(monthKey, { spent: 0, earned: 0 });
      }
      const m = monthlyTotals.get(monthKey)!;
      m.spent += dailySpend;
      m.earned += entry.credits;

      // Group into Week (Year + Week number)
      const d = new Date(dateKey);
      const weekNumber = Math.ceil(d.getDate() / 7);
      const weekKey = `${monthKey}-W${weekNumber}`;
      weeklyTotals.set(weekKey, (weeklyTotals.get(weekKey) || 0) + dailySpend);
    });

    // Best savings month & peak spend month
    let bestSavingsMonth: BestSavingsMonthRecord | null = null;
    let peakSpendMonth: PeakSpendMonthRecord | null = null;

    monthlyTotals.forEach((val, monthKey) => {
      if (val.spent > 0 && (!peakSpendMonth || val.spent > peakSpendMonth.spent)) {
        peakSpendMonth = { monthKey, spent: val.spent };
      }
      if (val.earned > 0) {
        const saved = Math.max(0, val.earned - val.spent);
        const rate = Math.round((saved / val.earned) * 100);
        if (!bestSavingsMonth || rate > bestSavingsMonth.rate) {
          bestSavingsMonth = { monthKey, rate, saved };
        }
      }
    });

    // Peak week
    let peakWeek: PeakWeekRecord | null = null;
    weeklyTotals.forEach((spent, weekKey) => {
      if (!peakWeek || spent > peakWeek.spent) {
        peakWeek = { weekKey, spent };
      }
    });

    // Monthly breakdown rows
    const monthRows: MonthSummaryRow[] = Array.from(monthlyTotals.entries())
      .map(([monthKey, val]) => {
        const [year, month] = monthKey.split('-');
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, 1);
        const monthLabel = dateObj.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
        const saved = Math.max(0, val.earned - val.spent);
        const savingsRate = val.earned > 0 ? Math.round((saved / val.earned) * 100) : 0;
        return {
          monthKey,
          monthLabel,
          spent: val.spent,
          earned: val.earned,
          savingsRate,
        };
      })
      .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

    return {
      peakDay,
      peakWeek,
      peakSpendMonth,
      bestSavingsMonth,
      longestNoSpendStreak,
      currentNoSpendStreak,
      monthRows,
    };
  }, [dailyDataMap, excludedRecordTxIds]);

  const toggleExcludeRecordTx = (txId: string) => {
    setExcludedRecordTxIds((prev) => {
      const next = new Set(prev);
      if (next.has(txId)) next.delete(txId);
      else next.add(txId);
      return next;
    });
  };

  return {
    dailyDataMap,
    createdDateKey,
    recurringBillsByDayOfMonth,
    salaryCycleStats,
    records,
    toggleExcludeRecordTx,
    isTxExcluded: (id: string) => excludedRecordTxIds.has(id),
  };
}

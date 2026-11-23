// The current Money Cycle from what the app already has: the salary day on the user's
// profile and the salary credits in the income store. Pure helpers plus a store reader
// for services (budget renewal) that are not React components.

import { useAuthStore, useIncomeStore } from '../store';
import { useMoneyCycleStore } from '../store/moneyCycleStore';
import { resolveCycle, type MoneyCycle, type PaySchedule, type SalaryCredit } from '../utils/moneyCycle';
import { detectPayday } from '../utils/payday';

const SALARY_WORDS = /salary|payroll|stipend/;

/** Income records that are salary credits. */
export function salaryCreditsFrom(incomes: any[]): SalaryCredit[] {
  const out: SalaryCredit[] = [];
  for (const inc of incomes || []) {
    if (!inc || inc.isDeleted) continue;
    const text = `${inc.category || ''} ${inc.source || ''} ${inc.merchant || ''}`.toLowerCase();
    if (!inc.isSalary && !SALARY_WORDS.test(text)) continue;
    const timestamp = Number(inc.timestamp);
    const amount = Math.abs(Number(inc.amount));
    if (timestamp > 0 && amount > 0) out.push({ timestamp, amount });
  }
  return out;
}

// Gig and delivery platforms that pay partners weekly or every 2 weeks.
const PAYOUT_WORDS = /swiggy|zomato|uber|\bola\b|rapido|zepto|blinkit|dunzo|porter|urban ?company|amazon|flipkart|bigbasket|shadowfax|delhivery|payout|settlement|wages/;
const NOT_PAYOUT = /refund|cashback|reversal|interest/;

/** Credits that are payouts for weekly / every-2-weeks pay: salary words, or a gig platform paying in. */
export function payoutCreditsFrom(incomes: any[]): SalaryCredit[] {
  const out: SalaryCredit[] = [];
  for (const inc of incomes || []) {
    if (!inc || inc.isDeleted) continue;
    const text = `${inc.category || ''} ${inc.source || ''} ${inc.merchant || ''}`.toLowerCase();
    if (NOT_PAYOUT.test(text)) continue;
    if (!inc.isSalary && !SALARY_WORDS.test(text) && !PAYOUT_WORDS.test(text)) continue;
    const timestamp = Number(inc.timestamp);
    const amount = Math.abs(Number(inc.amount));
    if (timestamp > 0 && amount >= 200) out.push({ timestamp, amount });
  }
  return out;
}

/** The payday the app would suggest from income history, or null. 31 means month end. */
export function suggestPayday(incomes: any[]): number | null {
  const credits = (incomes || [])
    .filter((inc: any) => inc && !inc.isDeleted)
    .map((inc: any) => {
      const text = `${inc.category || ''} ${inc.source || ''} ${inc.merchant || ''}`.toLowerCase();
      return {
        timestamp: Number(inc.timestamp) || 0,
        amount: Math.abs(Number(inc.amount)) || 0,
        isSalary: !!inc.isSalary || SALARY_WORDS.test(text),
      };
    });
  // Only suggest once salary has been seen in two different months.
  const months = new Set(
    credits.filter((c) => c.isSalary && c.timestamp > 0).map((c) => {
      const d = new Date(c.timestamp);
      return `${d.getFullYear()}-${d.getMonth()}`;
    })
  );
  if (months.size < 2) return null;
  return detectPayday(credits);
}

/** Money that can be spent now: bank and cash balances, not credit cards or overdraft limits. */
export function spendableBalance(bankProfiles: any[]): number {
  return (bankProfiles || []).reduce((sum, b) => {
    const type = String(b?.accountType || '').toLowerCase();
    if (type.includes('credit') || type.includes('overdraft')) return sum;
    const bal = parseFloat(String(b?.currentBalance ?? 0));
    return sum + (Number.isFinite(bal) ? bal : 0);
  }, 0);
}

/**
 * Salary credits plus "Salary received" marks. A mark counts as a full salary (the usual amount),
 * so it starts a cycle even when the money never showed up as an SMS.
 */
export function cycleCredits(incomes: any[], marks: number[], schedule?: PaySchedule | null): SalaryCredit[] {
  const weeklyish = schedule?.kind === 'weekly' || schedule?.kind === 'fortnightly';
  const credits = weeklyish ? payoutCreditsFrom(incomes) : salaryCreditsFrom(incomes);
  if (!marks || marks.length === 0) return credits;
  const amounts = credits.map((c) => c.amount).sort((a, b) => a - b);
  const usual = amounts.length ? amounts[Math.floor(amounts.length / 2)] : 1;
  return [...credits, ...marks.map((timestamp) => ({ timestamp, amount: usual }))];
}

/** Current cycle from the stores. */
export function getCurrentCycle(now: number = Date.now()): MoneyCycle {
  const user = useAuthStore.getState().user;
  const incomes = useIncomeStore.getState().incomeRecords || [];
  const marks = useMoneyCycleStore.getState().salaryMarks;
  const schedule = (user?.paySchedule as PaySchedule) ?? null;
  return resolveCycle(now, user?.salaryDay, cycleCredits(incomes, marks, schedule), schedule);
}

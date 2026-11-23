import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuthStore, useIncomeStore } from '../store';
import { useMoneyCycleStore } from '../store/moneyCycleStore';
import { resolveCycle, type MoneyCycle, type PaySchedule, type SalaryCredit } from '../utils/moneyCycle';
import { cycleCredits, suggestPayday } from '../services/moneyCycleService';

const today = () => {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
};

export interface MoneyCycleInfo {
  cycle: MoneyCycle;
  /** The user's salary day setting: 1–31, 0 for not fixed, null when never set. */
  salaryDay: number | null;
  /** A payday seen in income history, offered while the user hasn't set one. */
  suggestedPayday: number | null;
  /** Salary credits the cycle was worked out from. */
  credits: SalaryCredit[];
}

/**
 * The cycle the app measures spending in (salary to salary, or calendar month).
 * Re-checks when the app comes back and once a minute, so it rolls over at midnight
 * and as soon as a salary credit arrives.
 */
export function useMoneyCycle(): MoneyCycleInfo {
  const salaryDay = useAuthStore((s) => s.user?.salaryDay);
  const paySchedule = useAuthStore((s) => s.user?.paySchedule);
  const incomeRecords = useIncomeStore((s) => s.incomeRecords);
  const salaryMarks = useMoneyCycleStore((s) => s.salaryMarks);
  const [day, setDay] = useState(today);

  useEffect(() => {
    const check = () => setDay((prev) => {
      const next = today();
      return next === prev ? prev : next;
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    const id = setInterval(check, 60_000);
    return () => {
      sub.remove();
      clearInterval(id);
    };
  }, []);

  const credits = useMemo(
    () => cycleCredits(incomeRecords, salaryMarks, (paySchedule as PaySchedule) ?? null),
    [incomeRecords, salaryMarks, paySchedule]
  );
  const cycle = useMemo(
    // `day` changes once a day; inside the day, now only moves dayOfCycle, which is day-granular.
    () => resolveCycle(Math.max(Date.now(), day), salaryDay, credits, (paySchedule as PaySchedule) ?? null),
    [day, salaryDay, credits, paySchedule]
  );
  const suggestedPayday = useMemo(
    () => ((salaryDay === undefined || salaryDay === null) && !paySchedule ? suggestPayday(incomeRecords) : null),
    [salaryDay, paySchedule, incomeRecords]
  );

  return { cycle, salaryDay: salaryDay ?? null, suggestedPayday, credits };
}

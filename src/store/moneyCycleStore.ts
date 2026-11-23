// src/store/moneyCycleStore.ts
//
// What the user tells the app about their money cycle that no SMS shows:
//  - "Salary received" marks, for salary paid in cash or into an account the app can't see.
//    A mark starts the new cycle that day, the same as a salary credit would.
//  - Yearly costs (school fees, insurance premium, Diwali): set aside a twelfth each month so
//    the month they're paid isn't a shock, and leave them out of month-to-month comparisons.
// Kept on the phone (MMKV) and synced to the profile on the server (hooks/useMoneyCycleSync),
// so it follows the user to a new phone. `updatedAt` decides which copy is newer.

import { create } from 'zustand';
import { mmkvStorage } from '../db/mmkv';

const MARKS_KEY = 'money_cycle_salary_marks';
const YEARLY_KEY = 'money_cycle_yearly_costs';
const UPDATED_KEY = 'money_cycle_updated_at';
const MAX_MARKS = 36;

export interface YearlyCost {
  id: string;
  name: string;
  /** Rupees, for the whole year. */
  amount: number;
  /** Month it is usually paid, 0 = January. */
  month: number;
  /** Spending category it is paid under, to recognise the payment (e.g. "education"). */
  category?: string | null;
}

export interface MoneyCycleData {
  yearlyCosts: YearlyCost[];
  salaryMarks: number[];
  updatedAt: number;
}

function load<T>(key: string, fallback: T): T {
  try {
    return mmkvStorage.getObject<T>(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function loadNumber(key: string): number {
  try {
    return Number(mmkvStorage.getString(key) || 0) || 0;
  } catch {
    return 0;
  }
}

function persist(data: MoneyCycleData) {
  try {
    mmkvStorage.setObject(MARKS_KEY, data.salaryMarks);
    mmkvStorage.setObject(YEARLY_KEY, data.yearlyCosts);
    mmkvStorage.setString(UPDATED_KEY, String(data.updatedAt));
  } catch {
    // Storage unavailable: the state still works for this session.
  }
}

interface MoneyCycleStoreState extends MoneyCycleData {
  markSalaryReceived: (at?: number) => void;
  undoSalaryMark: (at: number) => void;
  saveYearlyCost: (cost: YearlyCost) => void;
  removeYearlyCost: (id: string) => void;
  /** Take the server's copy when it is newer than this phone's. */
  hydrate: (data: MoneyCycleData | null | undefined) => void;
}

export const useMoneyCycleStore = create<MoneyCycleStoreState>((set) => {
  const change = (fn: (s: MoneyCycleData) => Partial<MoneyCycleData> | null) =>
    set((s) => {
      const patch = fn(s);
      if (!patch) return s;
      const next: MoneyCycleData = {
        yearlyCosts: patch.yearlyCosts ?? s.yearlyCosts,
        salaryMarks: patch.salaryMarks ?? s.salaryMarks,
        updatedAt: Date.now(),
      };
      persist(next);
      return next;
    });

  return {
    salaryMarks: load<number[]>(MARKS_KEY, []),
    yearlyCosts: load<YearlyCost[]>(YEARLY_KEY, []),
    updatedAt: loadNumber(UPDATED_KEY),
    markSalaryReceived: (at = Date.now()) =>
      change((s) => {
        // One mark per day is enough.
        const day = new Date(at).toDateString();
        if (s.salaryMarks.some((m) => new Date(m).toDateString() === day)) return null;
        return { salaryMarks: [...s.salaryMarks, at].sort((a, b) => a - b).slice(-MAX_MARKS) };
      }),
    undoSalaryMark: (at) => change((s) => ({ salaryMarks: s.salaryMarks.filter((m) => m !== at) })),
    saveYearlyCost: (cost) => change((s) => ({ yearlyCosts: [...s.yearlyCosts.filter((c) => c.id !== cost.id), cost] })),
    removeYearlyCost: (id) => change((s) => ({ yearlyCosts: s.yearlyCosts.filter((c) => c.id !== id) })),
    hydrate: (data) =>
      set((s) => {
        if (!data || !(data.updatedAt > s.updatedAt)) return s;
        const next: MoneyCycleData = {
          yearlyCosts: Array.isArray(data.yearlyCosts) ? data.yearlyCosts : [],
          salaryMarks: Array.isArray(data.salaryMarks) ? data.salaryMarks : [],
          updatedAt: data.updatedAt,
        };
        persist(next);
        return next;
      }),
  };
});

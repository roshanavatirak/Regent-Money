import { toISTDateString, roundUpTo100, parseYearMonth, diffInCalendarMonths, normalizeTargetYearMonth } from './goalPacingService';
import type { Goal, SavingsEntry } from './goalPacingService';

export const GOALS_SCHEMA_VERSION = 2;

/**
 * Migrates legacy goals (v1) to v2 schema:
 * 1. Converts legacy currentAmount into an opening entry (type: 'opening') without balance loss.
 * 2. Ensures committedMonthly is populated.
 * 3. Strips legacy currentAmount so entries remains the sole source of truth.
 * 4. Records migratedAt date to give users committedMonthly grace period.
 */
export function migrateGoalsV1toV2(rawGoals: any[], today: Date = new Date()): Goal[] {
  if (!Array.isArray(rawGoals)) return [];

  const todayISTStr = toISTDateString(today);

  return rawGoals.map((g): Goal => {
    const existingEntries: SavingsEntry[] = Array.isArray(g.entries) ? [...g.entries] : [];

    // If no entries exist, but there was a legacy currentAmount > 0
    const legacyCurrentAmount = Number(g.currentAmount || 0);
    if (existingEntries.length === 0 && legacyCurrentAmount > 0) {
      const createdAtDate = g.createdAt ? toISTDateString(g.createdAt) : todayISTStr;
      existingEntries.push({
        id: `mig_${g.id}_opening`,
        amount: legacyCurrentAmount,
        at: createdAtDate,
        type: 'opening',
        note: 'Opening balance',
      });
    }

    // Ensure committedMonthly is valid
    let committedMonthly = Number(g.committedMonthly || g.monthlyContribution || 0);
    const targetAmount = Math.max(1000, Number(g.targetAmount || 10000));

    if (committedMonthly <= 0) {
      const curParts = parseYearMonth(todayISTStr.slice(0, 7));
      const targetMonthStr = normalizeTargetYearMonth(g.targetDate);
      const targetParts = parseYearMonth(targetMonthStr);
      const monthsLeft = Math.max(1, diffInCalendarMonths(curParts, targetParts) + 1);
      const rem = Math.max(0, targetAmount - legacyCurrentAmount);
      committedMonthly = roundUpTo100(rem / monthsLeft);
      if (committedMonthly <= 0) {
        committedMonthly = roundUpTo100(targetAmount / 12);
      }
    }

    const savedBalance = existingEntries.reduce((sum, e) => sum + (e.type === 'withdraw' ? -e.amount : e.amount), 0);

    const migratedGoal: Goal = {
      id: String(g.id || `goal_${Date.now()}`),
      name: String(g.name || 'My Savings Goal'),
      category: g.category || 'custom',
      targetAmount,
      adjustForInflation: Boolean(g.adjustForInflation),
      targetDate: normalizeTargetYearMonth(g.targetDate),
      committedMonthly,
      createdAt: g.createdAt ? toISTDateString(g.createdAt) : todayISTStr,
      migratedAt: g.migratedAt || todayISTStr,
      entries: existingEntries,
      reminder: g.reminder,
      coverPresetKey: g.coverPresetKey,
      coverImageUri: g.coverImageUri,
      // Backward compatibility during migration
      currentAmount: savedBalance,
    } as Goal;

    return migratedGoal;
  });
}

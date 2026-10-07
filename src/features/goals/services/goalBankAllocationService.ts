import type { Goal } from './goalPacingService';
import { getSaved } from './goalPacingService';
import type { BankProfileType } from '../../../store';
import { formatIndianFullRupees, formatIndianCompactRupees } from './goalNudgeTemplates';

export interface BankAllocationSummary {
  bankId: string;
  bankName: string;
  suffix: string;
  totalBalance: number;
  totalAllocated: number;
  unallocatedBalance: number;
  isOverallocated: boolean;
  deficitAmount: number;
  linkedGoalsCount: number;
}

/**
 * Calculates allocation summary for a specific bank account across all goals.
 */
export function getBankAllocationSummary(
  bank: BankProfileType,
  allGoals: Goal[]
): BankAllocationSummary {
  const linkedGoals = allGoals.filter((g) => g.linkedBankId === bank.id);
  const totalAllocated = linkedGoals.reduce((sum, g) => sum + getSaved(g), 0);
  const balance = Number(bank.currentBalance) || 0;
  const diff = balance - totalAllocated;

  return {
    bankId: bank.id,
    bankName: bank.bankName || 'Savings Account',
    suffix: bank.accountNumberSuffix || '',
    totalBalance: balance,
    totalAllocated,
    unallocatedBalance: Math.max(0, diff),
    isOverallocated: diff < 0,
    deficitAmount: diff < 0 ? Math.abs(diff) : 0,
    linkedGoalsCount: linkedGoals.length,
  };
}

/**
 * Validates whether a proposed deposit or initial amount can be funded from the bank.
 */
export function validateBankDeposit(
  bank: BankProfileType,
  allGoals: Goal[],
  proposedAmount: number,
  targetGoalId?: string
): { valid: boolean; maxAllowed: number; errorMessage?: string } {
  // If targetGoalId is provided, we compute total allocated excluding this goal's current saved amount
  const otherGoals = allGoals.filter(
    (g) => g.linkedBankId === bank.id && g.id !== targetGoalId
  );
  const otherAllocated = otherGoals.reduce((sum, g) => sum + getSaved(g), 0);
  const balance = Number(bank.currentBalance) || 0;
  const maxAllowed = Math.max(0, balance - otherAllocated);

  if (proposedAmount <= maxAllowed) {
    return { valid: true, maxAllowed };
  }

  const bankTitle = `${bank.bankName || 'Bank'}${bank.accountNumberSuffix ? ` (••${bank.accountNumberSuffix})` : ''}`;
  return {
    valid: false,
    maxAllowed,
    errorMessage: `Exceeds unallocated balance of ${formatIndianFullRupees(maxAllowed)} in ${bankTitle}. Total balance is ${formatIndianFullRupees(balance)}.`,
  };
}

/**
 * Human-friendly subtitle for a bank option in selector
 */
export function formatBankOptionSubtitle(summary: BankAllocationSummary): string {
  if (summary.isOverallocated) {
    return `Deficit: -${formatIndianCompactRupees(summary.deficitAmount)} · Balance: ${formatIndianCompactRupees(summary.totalBalance)}`;
  }
  return `${formatIndianCompactRupees(summary.unallocatedBalance)} unallocated · ${formatIndianCompactRupees(summary.totalBalance)} total`;
}

import type { GoalPacing } from './goalPacingService';

/**
 * Goal Nudge Templates
 * 
 * Maps deterministic pacing facts to warm, concise user-facing copy.
 * Banned words: "Deposit", "Add money", "Critical", "Lag", "Fail", "Feasibility", "Net worth".
 */

export interface GoalCardCopy {
  statusDot: 'green' | 'amber' | 'grey' | 'gold';
  statusText: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
}

export function formatIndianCompactRupees(amount: number): string {
  if (!amount || isNaN(amount)) return '₹0';
  if (amount >= 10000000) {
    const cr = amount / 10000000;
    return `₹${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1)}Cr`;
  }
  if (amount >= 100000) {
    const l = amount / 100000;
    return `₹${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)}L`;
  }
  if (amount >= 1000) {
    const k = amount / 1000;
    return `₹${k % 1 === 0 ? k.toFixed(0) : k.toFixed(0)}K`;
  }
  return `₹${amount.toLocaleString('en-IN')}`;
}

export function formatIndianFullRupees(amount: number): string {
  return `₹${Math.round(amount || 0).toLocaleString('en-IN')}`;
}

export function formatFinishMonthDisplay(ymStr: string): string {
  if (!ymStr) return '';
  const [year, month] = ymStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[month - 1]} ${year}`;
}

export function getGoalCardCopy(pacing: GoalPacing, hasReminder: boolean = false): GoalCardCopy {
  switch (pacing.subStatus) {
    case 'completed':
      return {
        statusDot: 'gold',
        statusText: 'Goal achieved! Ready to celebrate.',
        primaryActionLabel: 'Share milestone',
        secondaryActionLabel: undefined,
      };

    case 'not_started':
      return {
        statusDot: 'grey',
        statusText: `Start with ${formatIndianFullRupees(pacing.requiredMonthly)} this month`,
        primaryActionLabel: 'Log first savings',
        secondaryActionLabel: hasReminder ? undefined : 'Set reminder',
      };

    case 'target_passed':
      return {
        statusDot: 'amber',
        statusText: 'Target month passed. Pick a new date?',
        primaryActionLabel: 'Log savings',
        secondaryActionLabel: 'Update target date',
      };

    case 'zero_pace':
      return {
        statusDot: 'amber',
        statusText: 'Log savings to see your finish date',
        primaryActionLabel: 'Log savings',
        secondaryActionLabel: hasReminder ? 'Raise monthly' : 'Set reminder',
      };

    case 'ahead': {
      const earlyMonths = pacing.monthsDelta;
      const finishText = formatFinishMonthDisplay(pacing.projectedFinish || '');
      const earlyClause = earlyMonths > 0 ? `, ${earlyMonths} month${earlyMonths > 1 ? 's' : ''} early` : '';
      return {
        statusDot: 'green',
        statusText: `On pace for ${finishText}${earlyClause}`,
        primaryActionLabel: 'Log savings',
        secondaryActionLabel: hasReminder ? undefined : 'Set reminder',
      };
    }

    case 'on_pace': {
      const finishText = formatFinishMonthDisplay(pacing.projectedFinish || '');
      return {
        statusDot: 'green',
        statusText: `On pace for ${finishText}`,
        primaryActionLabel: 'Log savings',
        secondaryActionLabel: hasReminder ? undefined : 'Set reminder',
      };
    }

    case 'slightly_behind': {
      const finishText = formatFinishMonthDisplay(pacing.projectedFinish || '');
      const gapText = formatIndianFullRupees(pacing.gapPerMonth);
      return {
        statusDot: 'amber',
        statusText: `Save ${gapText}/mo more to finish by ${finishText}`,
        primaryActionLabel: 'Log savings',
        secondaryActionLabel: 'Raise monthly',
      };
    }

    case 'behind': {
      const gapText = formatIndianFullRupees(pacing.gapPerMonth);
      return {
        statusDot: 'amber',
        statusText: `Need ${gapText}/mo more to catch up`,
        primaryActionLabel: 'Log savings',
        secondaryActionLabel: 'Raise monthly',
      };
    }

    default:
      return {
        statusDot: 'grey',
        statusText: 'On track with savings',
        primaryActionLabel: 'Log savings',
        secondaryActionLabel: undefined,
      };
  }
}

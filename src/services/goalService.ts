import { BACKEND_URL } from '../config/api';
import { authService } from './authService';
import { useGoalsStore, Goal } from '../store';

export interface GoalCategoryOption {
  id:
    | 'wealth_stash'
    | 'bike'
    | 'car'
    | 'home'
    | 'travel'
    | 'wedding'
    | 'education'
    | 'emergency'
    | 'gadget'
    | 'gold'
    | 'business'
    | 'fire'
    | 'custom';
  name: string;
  defaultTitle: string;
  defaultAmount: number;
  typicalMonths: number;
  icon: string;
  color: string;
  suggestedReturn: number;
  description: string;
}

export const formatIndianCompactAmount = (amount: number): string => {
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
};

export const GOAL_CATEGORIES: GoalCategoryOption[] = [
  {
    id: 'wealth_stash',
    name: 'Freedom Stash',
    defaultTitle: 'Freedom Stash (Save & Decide)',
    defaultAmount: 100000,
    typicalMonths: 12,
    icon: 'infinite',
    color: '#0ea5e9',
    suggestedReturn: 7.2,
    description: 'No fixed target. Accumulate capital, earn liquid returns, and decide later.',
  },
  {
    id: 'bike',
    name: 'Bike / Two-Wheeler',
    defaultTitle: 'New Motorbike',
    defaultAmount: 120000,
    typicalMonths: 12,
    icon: 'bicycle',
    color: '#3b82f6',
    suggestedReturn: 7.0,
    description: 'Safe liquid returns for your dream ride',
  },
  {
    id: 'car',
    name: 'Car / Automobile',
    defaultTitle: 'First Car Downpayment',
    defaultAmount: 800000,
    typicalMonths: 36,
    icon: 'car-sport',
    color: '#10b981',
    suggestedReturn: 9.5,
    description: 'Balanced hybrid growth over 3 years',
  },
  {
    id: 'home',
    name: 'First Home',
    defaultTitle: 'Home Downpayment',
    defaultAmount: 4000000,
    typicalMonths: 60,
    icon: 'home',
    color: '#8b5cf6',
    suggestedReturn: 12.5,
    description: 'Long-term equity compounding for your foundation',
  },
  {
    id: 'travel',
    name: 'Travel & Vacations',
    defaultTitle: 'International Trip',
    defaultAmount: 150000,
    typicalMonths: 9,
    icon: 'airplane',
    color: '#06b6d4',
    suggestedReturn: 6.5,
    description: 'Short-horizon recurring savings without market dips',
  },
  {
    id: 'wedding',
    name: 'Wedding & Celebration',
    defaultTitle: 'Wedding Celebration Fund',
    defaultAmount: 1000000,
    typicalMonths: 24,
    icon: 'heart',
    color: '#f43f5e',
    suggestedReturn: 8.5,
    description: 'High-safety debt & arbitrage allocation',
  },
  {
    id: 'education',
    name: 'Education / Upskilling',
    defaultTitle: 'Certification & Master’s',
    defaultAmount: 600000,
    typicalMonths: 24,
    icon: 'school',
    color: '#f59e0b',
    suggestedReturn: 9.0,
    description: 'Investing in your highest-yielding asset: yourself',
  },
  {
    id: 'emergency',
    name: 'Emergency Fund',
    defaultTitle: '6-Month Safety Cushion',
    defaultAmount: 200000,
    typicalMonths: 6,
    icon: 'shield-checkmark',
    color: '#14b8a6',
    suggestedReturn: 6.5,
    description: 'Immediate liquidity with zero capital volatility',
  },
  {
    id: 'gadget',
    name: 'Gadget & Tech',
    defaultTitle: 'Pro Workstation / Phone',
    defaultAmount: 90000,
    typicalMonths: 6,
    icon: 'phone-portrait',
    color: '#ec4899',
    suggestedReturn: 6.5,
    description: 'Planned tech upgrade without credit card debt',
  },
  {
    id: 'gold',
    name: 'Gold & Jewellery',
    defaultTitle: 'Gold Asset Accumulation',
    defaultAmount: 300000,
    typicalMonths: 18,
    icon: 'sparkles',
    color: '#eab308',
    suggestedReturn: 8.5,
    description: 'Sovereign gold & bullion wealth reserve',
  },
  {
    id: 'business',
    name: 'Startup & Business',
    defaultTitle: 'Business Seed Capital',
    defaultAmount: 500000,
    typicalMonths: 36,
    icon: 'rocket',
    color: '#6366f1',
    suggestedReturn: 11.0,
    description: 'Fueling your venture and independent income',
  },
  {
    id: 'fire',
    name: 'Retirement (FIRE)',
    defaultTitle: 'Early Financial Freedom',
    defaultAmount: 10000000,
    typicalMonths: 120,
    icon: 'trending-up',
    color: '#059669',
    suggestedReturn: 12.0,
    description: 'Long-horizon compounding for life independence',
  },
  {
    id: 'custom',
    name: 'Custom Milestone',
    defaultTitle: 'Personal Milestone',
    defaultAmount: 250000,
    typicalMonths: 18,
    icon: 'trophy',
    color: '#2dba4e',
    suggestedReturn: 10.0,
    description: 'Tailor-made roadmap for what matters to you',
  },
];

export interface InvestmentStrategy {
  title: string;
  expectedReturn: number;
  risk: 'Minimal' | 'Low' | 'Moderate' | 'High';
  assetVehicle: string;
  rationale: string;
}

/**
 * Returns financial instrument recommendation based on investment horizon (in months) or category
 */
export function getStrategyRecommendation(months: number, category?: string): InvestmentStrategy {
  if (category === 'wealth_stash') {
    return {
      title: 'Instant-Access Arbitrage & Liquid',
      expectedReturn: 7.2,
      risk: 'Minimal',
      assetVehicle: 'Arbitrage Funds / Ultra-Short Term Debt / Sweep FD',
      rationale: 'Open-ended wealth building. Zero lock-in, safe from stock drops, beats inflation, and ready to deploy whenever opportunity strikes.',
    };
  }

  if (months <= 12) {
    return {
      title: 'High-Yield Liquid & Arbitrage',
      expectedReturn: 6.5,
      risk: 'Minimal',
      assetVehicle: 'Liquid Mutual Funds / Bank Recurring Deposit',
      rationale: 'Timeframe is under 1 year. Zero equity risk to safeguard capital for your immediate deadline.',
    };
  } else if (months <= 36) {
    return {
      title: 'Short-Duration Debt & Arbitrage',
      expectedReturn: 8.5,
      risk: 'Low',
      assetVehicle: 'Ultra Short Debt / Multi-Asset Conservative',
      rationale: '1–3 year horizon. Low volatility beats traditional savings while offering stability.',
    };
  } else if (months <= 60) {
    return {
      title: 'Balanced & Hybrid Growth',
      expectedReturn: 10.5,
      risk: 'Moderate',
      assetVehicle: 'Aggressive Hybrid SIP / Large-Cap Index',
      rationale: '3–5 years gives equity room to smooth out dips while compounding at ~10-11% p.a.',
    };
  } else {
    return {
      title: 'Wealth Compounder (Equity SIP)',
      expectedReturn: 13.0,
      risk: 'High',
      assetVehicle: 'Nifty 50 Index + Flexi-cap Equity Funds',
      rationale: 'Over 5+ years, equities historically beat all inflation and create serious compounding alpha.',
    };
  }
}

export interface ProjectionPoint {
  period: string;
  months: number;
  totalInvested: number;
  futureValue: number;
  gains: number;
}

/**
 * Solves compound wealth growth across 1, 3, and 5 years for open-ended wealth accumulation
 */
export function calculateCompoundProjections(
  monthlyContribution: number,
  currentAmount: number = 0,
  annualReturnRate: number = 7.2
): ProjectionPoint[] {
  const monthlyRate = annualReturnRate / 100 / 12;
  const periods = [
    { period: '1 Year', months: 12 },
    { period: '3 Years', months: 36 },
    { period: '5 Years', months: 60 },
  ];

  return periods.map(({ period, months }) => {
    let fv = currentAmount;
    for (let i = 0; i < months; i++) {
      fv = (fv + monthlyContribution) * (1 + monthlyRate);
    }
    const totalInvested = currentAmount + monthlyContribution * months;
    const gains = Math.max(0, fv - totalInvested);
    return {
      period,
      months,
      totalInvested: Math.round(totalInvested),
      futureValue: Math.round(fv),
      gains: Math.round(gains),
    };
  });
}

/**
 * Solves for required monthly investment given target, current amount, months, and expected annual return
 */
export function calculateRequiredMonthly(
  targetAmount: number,
  currentAmount: number,
  months: number,
  annualReturnPercent: number,
): number {
  if (months <= 0) return Math.max(0, targetAmount - currentAmount);
  const r = annualReturnPercent / 12 / 100;
  
  // Future value of starting money
  const fvStarting = currentAmount * Math.pow(1 + r, months);
  const remainingNeeded = Math.max(0, targetAmount - fvStarting);

  if (remainingNeeded <= 0) return 0;
  if (r <= 0) return Math.round(remainingNeeded / months);

  const pmt = (remainingNeeded * r) / (Math.pow(1 + r, months) - 1);
  return Math.round(pmt);
}

/**
 * Solves for target date (in months) given monthly contribution
 */
export function calculateRequiredMonths(
  targetAmount: number,
  currentAmount: number,
  monthlyContribution: number,
  annualReturnPercent: number,
): number {
  if (currentAmount >= targetAmount) return 0;
  if (monthlyContribution <= 0) return 120; // fallback 10 years

  const r = annualReturnPercent / 12 / 100;
  if (r <= 0) {
    return Math.ceil((targetAmount - currentAmount) / monthlyContribution);
  }

  // Iterate to find exact month count
  let balance = currentAmount;
  let months = 0;
  const maxMonths = 360; // 30 years cap

  while (balance < targetAmount && months < maxMonths) {
    months++;
    balance = (balance + monthlyContribution) * (1 + r);
  }

  return months;
}

/**
 * Generates monthly/yearly compounding projection curve for charts
 */
export function generateProjectionCurve(
  startingAmount: number,
  monthlyContribution: number,
  annualReturnPercent: number,
  totalMonths: number,
) {
  const points = [];
  const r = annualReturnPercent / 12 / 100;
  let balance = startingAmount;
  let totalInvested = startingAmount;

  // Step points (up to 12 points for clean chart display)
  const step = Math.max(1, Math.floor(totalMonths / 10));

  for (let m = 0; m <= totalMonths; m++) {
    if (m === 0) {
      points.push({ month: 0, balance: Math.round(balance), invested: Math.round(totalInvested), gains: 0 });
    } else {
      balance = (balance + monthlyContribution) * (1 + r);
      totalInvested += monthlyContribution;
      if (m % step === 0 || m === totalMonths) {
        points.push({
          month: m,
          balance: Math.round(balance),
          invested: Math.round(totalInvested),
          gains: Math.max(0, Math.round(balance - totalInvested)),
        });
      }
    }
  }

  return points;
}

/**
 * Computes pacing status: Ahead, On-Track, or Behind
 */
export function getGoalPacing(goal: Goal) {
  const now = Date.now();
  const targetTime = goal.targetDate || now + 365 * 24 * 3600 * 1000;
  const daysLeft = Math.max(0, Math.ceil((targetTime - now) / (1000 * 60 * 60 * 24)));
  const progressPercent = Math.min(100, Math.round((goal.currentAmount / (goal.targetAmount || 1)) * 100));

  // Determine whether ahead/behind based on linear pacing benchmark
  const assumedDurationDays = 365; // fallback
  const expectedProgress = Math.min(100, Math.round(((assumedDurationDays - daysLeft) / assumedDurationDays) * 100));

  let status: 'on_track' | 'behind' | 'achieved' = 'on_track';
  let statusText = 'On Track';
  let statusColor = '#2dba4e';

  if (progressPercent >= 100) {
    status = 'achieved';
    statusText = 'Goal Achieved! 🎉';
    statusColor = '#2dba4e';
  } else if (progressPercent < expectedProgress - 15) {
    status = 'behind';
    const lagAmount = Math.max(0, Math.round(((expectedProgress - progressPercent) / 100) * goal.targetAmount));
    statusText = `Behind by ₹${lagAmount.toLocaleString('en-IN')}`;
    statusColor = '#f59e0b';
  } else {
    statusText = 'On Track';
    statusColor = '#2dba4e';
  }

  return {
    daysLeft,
    monthsLeft: Math.ceil(daysLeft / 30),
    progressPercent,
    status,
    statusText,
    statusColor,
  };
}

export const goalService = {
  /**
   * Create goal (optimistic store + backend sync)
   */
  async createGoal(data: {
    name: string;
    category: string;
    targetAmount: number;
    currentAmount: number;
    monthlyContribution: number;
    expectedReturnRate: number;
    targetDate: number;
    priority?: string;
    color?: string;
    icon?: string;
    isMilestoneBased?: boolean;
    milestoneStep?: number;
  }): Promise<Goal> {
    const id = 'goal_' + Math.random().toString(36).substr(2, 9);
    const months = Math.max(1, Math.ceil((data.targetDate - Date.now()) / (1000 * 60 * 60 * 24 * 30)));
    const strategy = getStrategyRecommendation(months, data.category).title;

    const newGoal: Goal = {
      id,
      name: data.name,
      category: data.category,
      targetAmount: data.targetAmount,
      currentAmount: data.currentAmount,
      monthlyContribution: data.monthlyContribution,
      expectedReturnRate: data.expectedReturnRate,
      targetDate: data.targetDate,
      priority: data.priority || 'medium',
      color: data.color || '#2dba4e',
      icon: data.icon || 'trophy',
      strategy,
      streakMonths: 0,
      status: 'active',
      isMilestoneBased: data.isMilestoneBased ?? (data.category === 'wealth_stash'),
      milestoneStep: data.milestoneStep ?? 1,
    };

    // Optimistic local update
    useGoalsStore.getState().addGoal(newGoal);

    // Backend sync
    const token = authService.getAccessToken();
    if (token) {
      try {
        await fetch(`${BACKEND_URL}/sync/goal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(newGoal),
        });
      } catch (err) {
        console.warn('[GoalService] Failed to sync created goal to backend:', err);
      }
    }

    return newGoal;
  },

  /**
   * Advance milestone target for open-ended / milestone-based goals
   */
  async advanceMilestone(goalId: string, incrementAmount: number = 100000): Promise<Goal> {
    const goal = useGoalsStore.getState().goals.find((g) => g.id === goalId);
    if (!goal) throw new Error('Goal not found');
    const newTarget = (goal.targetAmount || 0) + incrementAmount;
    const newStep = (goal.milestoneStep || 1) + 1;
    await this.updateGoal(goalId, {
      targetAmount: newTarget,
      milestoneStep: newStep,
    });
    return (useGoalsStore.getState().goals.find((g) => g.id === goalId) || goal);
  },

  /**
   * Deploy capital from an open-ended goal (Freedom Stash) to a new goal
   */
  async deployCapital(
    sourceGoalId: string,
    amountToTransfer: number,
    newGoalPayload: {
      name: string;
      category: string;
      targetAmount: number;
      monthlyContribution?: number;
      targetMonths?: number;
      priority?: string;
      color?: string;
      icon?: string;
    }
  ): Promise<{ sourceGoal: Goal | null; createdGoal: Goal }> {
    const goals = useGoalsStore.getState().goals;
    const source = goals.find((g) => g.id === sourceGoalId);
    if (!source) throw new Error('Source goal not found');
    if (source.currentAmount < amountToTransfer) {
      throw new Error(`Insufficient funds in ${source.name} (Available: ₹${source.currentAmount})`);
    }

    // 1. Deduct from source goal
    const updatedSourceAmount = Math.max(0, source.currentAmount - amountToTransfer);
    await this.updateGoal(sourceGoalId, { currentAmount: updatedSourceAmount });

    // 2. Create target goal funded with the deployed amount
    const targetMonths = newGoalPayload.targetMonths || 12;
    const targetDate = Date.now() + targetMonths * 30 * 24 * 60 * 60 * 1000;
    const strategyObj = getStrategyRecommendation(targetMonths, newGoalPayload.category);

    const createdGoal = await this.createGoal({
      name: newGoalPayload.name,
      category: newGoalPayload.category,
      targetAmount: newGoalPayload.targetAmount,
      currentAmount: amountToTransfer,
      monthlyContribution: newGoalPayload.monthlyContribution || 0,
      expectedReturnRate: strategyObj.expectedReturn,
      targetDate,
      priority: newGoalPayload.priority || 'medium',
      color: newGoalPayload.color,
      icon: newGoalPayload.icon,
    });

    const updatedSource = useGoalsStore.getState().goals.find((g) => g.id === sourceGoalId) || null;
    return { sourceGoal: updatedSource, createdGoal };
  },

  /**
   * Contribute funds to a goal
   */
  async contribute(id: string, amount: number): Promise<void> {
    useGoalsStore.getState().contributeToGoal(id, amount);

    const token = authService.getAccessToken();
    if (token) {
      try {
        await fetch(`${BACKEND_URL}/sync/goal/${id}/contribute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ amount }),
        });
      } catch (err) {
        console.warn('[GoalService] Failed to sync contribution to backend:', err);
      }
    }
  },

  /**
   * Update goal details
   */
  async updateGoal(id: string, updates: Partial<Goal>): Promise<void> {
    useGoalsStore.getState().updateGoal(id, updates);

    const token = authService.getAccessToken();
    if (token) {
      try {
        await fetch(`${BACKEND_URL}/sync/goal/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updates),
        });
      } catch (err) {
        console.warn('[GoalService] Failed to sync goal update to backend:', err);
      }
    }
  },

  /**
   * Delete goal
   */
  async deleteGoal(id: string): Promise<void> {
    useGoalsStore.getState().deleteGoal(id);

    const token = authService.getAccessToken();
    if (token) {
      try {
        await fetch(`${BACKEND_URL}/sync/goal/${id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (err) {
        console.warn('[GoalService] Failed to sync goal deletion to backend:', err);
      }
    }
  },
};

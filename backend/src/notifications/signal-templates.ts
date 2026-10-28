// backend/src/notifications/signal-templates.ts
//
// Regent Money: The Witty Indian Friend Template Bank
// Quick, a little cheeky, always on your side. Never hurtful.

export type SignalType = 'pace' | 'spike' | 'habit' | 'runway' | 'win' | 'salary';
export type SignalTone = 'playful' | 'nudging' | 'straight';

export interface TemplateDefinition {
  title: string;
  body: string;
  tone: SignalTone;
}

export interface SignalFacts {
  name?: string;
  amount?: number;
  category?: string;
  merchant?: string;
  count?: number | string;
  daysEarly?: number;
  burnoutDate?: string;
  runwayAmount?: number;
  perDay?: number;
  daysLeft?: number;
  goalName?: string;
  pct?: number;
  gap?: number;
  ratio?: number | string;
  pctDown?: number;
}

// Sensitive categories must NEVER be joked about
export const SENSITIVE_CATEGORIES = new Set([
  'rent',
  'emi',
  'loan',
  'medical',
  'hospital',
  'doctor',
  'pharmacy',
  'medicine',
  'education',
  'school',
  'college',
  'tuition',
  'family',
  'parents',
  'children',
  'insurance',
  'tax',
]);

export const formatINR = (val?: number | null): string => {
  if (val === undefined || val === null || isNaN(val)) return '₹0';
  const rounded = Math.round(val);
  return '₹' + rounded.toLocaleString('en-IN');
};

export const TEMPLATE_BANK: Record<SignalType, TemplateDefinition[]> = {
  /* ------------------------------------------------------------------ */
  /* 1. PACE (Budget burn rate against month end)                       */
  /* ------------------------------------------------------------------ */
  pace: [
    // Playful
    {
      tone: 'playful',
      title: 'Your {category} budget has a plan 💀',
      body: 'Dying on the {burnout_date}: {amount} spent with {days_early} days still to go. Cook one dinner and save its life.',
    },
    {
      tone: 'playful',
      title: '{category} is moving at bullet train speed 🚄',
      body: 'Ran through {amount} already. It expires on the {burnout_date} unless we pull the emergency brake.',
    },
    {
      tone: 'playful',
      title: 'RIP {category} budget: {burnout_date} 🪦',
      body: '{amount} spent so far. We can still save its life if you switch to chill mode for a week.',
    },
    {
      tone: 'playful',
      title: '{category} cash vanishes on the {burnout_date} ⏳',
      body: 'That is {days_early} days before payday! Time for a tactical retreat, boss.',
    },
    {
      tone: 'playful',
      title: '{category} budget in ICU 📉',
      body: '{amount} consumed already. At this speed, it runs out on the {burnout_date}. Let’s nurse it back to health.',
    },
    {
      tone: 'playful',
      title: 'Cart ko thoda break do 🛒',
      body: '{category} pace is running hot ({amount} spent). It burns out {days_early} days early on the {burnout_date}.',
    },

    // Nudging
    {
      tone: 'nudging',
      title: '{category} pace check ⚠️',
      body: '{amount} spent. At this speed, budget runs out {days_early} days early on the {burnout_date}. A quick tap on the brakes?',
    },
    {
      tone: 'nudging',
      title: 'Careful yaar: {category} is running hot',
      body: 'Budget projected to exhaust on the {burnout_date}. Sticking to ₹{per_day}/day keeps you safely on track.',
    },
    {
      tone: 'nudging',
      title: 'Pacing alert on {category}',
      body: '{amount} consumed with {days_early} days left until month end. A slight adjustment today saves month-end stress.',
    },
    {
      tone: 'nudging',
      title: 'Heads up {name}: {category} speed',
      body: 'At current pace, your {category} limit finishes on the {burnout_date}. Slow down today to protect your buffer.',
    },
    {
      tone: 'nudging',
      title: '{category} budget trajectory 📊',
      body: '{amount} spent so far. Projected burnout is {burnout_date}. Tap to see recommended daily pace.',
    },

    // Straight
    {
      tone: 'straight',
      title: 'Budget Alert: {category}',
      body: '{category} spending ({amount}) is on pace to exhaust on the {burnout_date}, {days_early} days early.',
    },
    {
      tone: 'straight',
      title: '{category} Pace Notice',
      body: '{amount} consumed. Recommended maximum daily spend for remaining days is ₹{per_day}.',
    },
    {
      tone: 'straight',
      title: '{category} Limit Update',
      body: 'Current spending trajectory indicates {category} budget will be reached {days_early} days ahead of cycle end.',
    },
    {
      tone: 'straight',
      title: 'Monthly Pace: {category}',
      body: 'Spending has reached {amount}. Projected exhaust date is {burnout_date}. Review category allocations.',
    },
    {
      tone: 'straight',
      title: 'Budget Variance: {category}',
      body: '{category} pace exceeds monthly allocation rate by {days_early} days.',
    },
  ],

  /* ------------------------------------------------------------------ */
  /* 2. HABIT (Merchant frequency in 7 days)                            */
  /* ------------------------------------------------------------------ */
  habit: [
    // Playful
    {
      tone: 'playful',
      title: '{merchant} knows your address by heart 🛵',
      body: '{count} orders, {amount} this week. Tonight, homemade dinner?',
    },
    {
      tone: 'playful',
      title: 'You and {merchant}: true love story 🛵',
      body: '{count} visits this week ({amount}). At this point you are funding their quarterly bonus, yaar.',
    },
    {
      tone: 'playful',
      title: '{merchant} delivery hero is basically family 👋',
      body: '{count} orders totaling {amount} in 7 days. Your kitchen is getting seriously jealous.',
    },
    {
      tone: 'playful',
      title: 'Another {merchant} notification? 🍽️',
      body: 'That’s order #{count} this week ({amount}). Let’s give the delivery app a night off.',
    },
    {
      tone: 'playful',
      title: '{merchant} loyalty badge unlocked 🏆',
      body: '{count} times this week, {amount} spent. Time to raid the pantry instead tonight.',
    },
    {
      tone: 'playful',
      title: 'Convenience tax check: {merchant}',
      body: '{count} orders, {amount} total this week. A quick Maggi tonight saves ₹500 instantly.',
    },

    // Nudging
    {
      tone: 'nudging',
      title: 'Convenience adds up: {merchant}',
      body: '{count} orders totaling {amount} this week. Small habits quietly add up over a month.',
    },
    {
      tone: 'nudging',
      title: '{merchant} habit check-in ☕',
      body: 'You’ve spent {amount} across {count} transactions at {merchant} this week. Tap to review weekly spending.',
    },
    {
      tone: 'nudging',
      title: 'Frequent spending: {merchant}',
      body: '{count} charges at {merchant} ({amount}) in the past 7 days. Keeping tabs on convenience?',
    },
    {
      tone: 'nudging',
      title: 'Weekly merchant check: {merchant}',
      body: '{merchant} accounted for {count} visits and {amount} this week. A small reset today pays off.',
    },
    {
      tone: 'nudging',
      title: 'Notice: {merchant} frequency',
      body: '{count} transactions recorded at {merchant} ({amount}). Check your discretionary total.',
    },

    // Straight
    {
      tone: 'straight',
      title: 'Frequent Merchant Notice: {merchant}',
      body: '{count} transactions at {merchant} this week totaling {amount}.',
    },
    {
      tone: 'straight',
      title: 'Merchant Activity: {merchant}',
      body: '{merchant} accounts for {amount} across {count} charges in the past 7 days.',
    },
    {
      tone: 'straight',
      title: 'Weekly Summary: {merchant}',
      body: 'Total of {amount} recorded across {count} visits to {merchant}.',
    },
    {
      tone: 'straight',
      title: 'Merchant Frequency Alert',
      body: '{count} purchases logged at {merchant} ({amount}) over the trailing 7 days.',
    },
    {
      tone: 'straight',
      title: 'Expense Summary: {merchant}',
      body: '{merchant} charges stand at {amount} across {count} transactions this week.',
    },
  ],

  /* ------------------------------------------------------------------ */
  /* 3. RUNWAY (Liquid cash divided by days remaining)                  */
  /* ------------------------------------------------------------------ */
  runway: [
    // Playful
    {
      tone: 'playful',
      title: 'Main character energy: budget edition 🎬',
      body: '{runway_amount} left, {days_left} days to payday. That’s {per_day} a day. Eyes on the finish line!',
    },
    {
      tone: 'playful',
      title: 'Mission: {per_day}/day survival mode 🛡️',
      body: '{runway_amount} across {days_left} days. Skip the fancy lattes and you cross month-end in first class.',
    },
    {
      tone: 'playful',
      title: '{per_day} daily allowance 🧘',
      body: '{runway_amount} for {days_left} days. Willpower mode activated. You got this, boss.',
    },
    {
      tone: 'playful',
      title: 'The final countdown: {days_left} days ⏳',
      body: '{runway_amount} in the bank = {per_day} daily budget. Finish strong and protect your savings.',
    },
    {
      tone: 'playful',
      title: '{per_day} a day until payday ☕',
      body: 'Total cash buffer is {runway_amount} for {days_left} days. Keep it simple and win the month.',
    },

    // Nudging
    {
      tone: 'nudging',
      title: 'Cash runway check: {per_day}/day',
      body: '{runway_amount} available across the next {days_left} days. Staying within {per_day}/day protects your buffer.',
    },
    {
      tone: 'nudging',
      title: 'Remaining cycle runway 📊',
      body: '{days_left} days until next cycle with {runway_amount} left. Prioritize essentials to finish comfortably.',
    },
    {
      tone: 'nudging',
      title: 'Daily allowance: {per_day}',
      body: 'You have {runway_amount} for {days_left} days. Tap to review your upcoming commitments.',
    },
    {
      tone: 'nudging',
      title: 'Runway update for {name}',
      body: '{runway_amount} remaining across {days_left} days ({per_day} daily target). Keep daily spends light.',
    },
    {
      tone: 'nudging',
      title: 'Month-end runway pacing',
      body: '{days_left} days to go with {runway_amount} liquid. Planning {per_day}/day keeps accounts balanced.',
    },

    // Straight (Always used if runway < ₹150/day)
    {
      tone: 'straight',
      title: 'Cash Runway Status',
      body: '{runway_amount} available for the remaining {days_left} days (₹{per_day} per day).',
    },
    {
      tone: 'straight',
      title: 'Account Liquidity Update',
      body: 'Liquid balance stands at {runway_amount} with {days_left} days remaining until next income.',
    },
    {
      tone: 'straight',
      title: 'Daily Safe-Spend Target',
      body: 'Recommended daily ceiling: ₹{per_day} across {days_left} days ({runway_amount} total buffer).',
    },
    {
      tone: 'straight',
      title: 'Cycle Cash Flow Notice',
      body: '{runway_amount} available across {days_left} days. Focus on mandatory commitments.',
    },
    {
      tone: 'straight',
      title: 'Liquidity Overview',
      body: 'Current allocation is ₹{per_day} per day for the next {days_left} days ({runway_amount} total).',
    },
  ],

  /* ------------------------------------------------------------------ */
  /* 4. SPIKE (Category spending way above 30/90-day average)          */
  /* ------------------------------------------------------------------ */
  spike: [
    // Playful
    {
      tone: 'playful',
      title: '{category} went full Big Billion Days 🛍️',
      body: '{amount} spent, which is {ratio} your usual average! Cart ko thoda rest do?',
    },
    {
      tone: 'playful',
      title: 'Who gave {category} a blank cheque? 💳',
      body: '{amount} spent this cycle, running {ratio} above normal. Let’s bring it back to earth.',
    },
    {
      tone: 'playful',
      title: 'Spike detected in {category} 🚀',
      body: '{category} is {ratio} higher than your typical 3-month baseline ({amount}). Evil twin borrowing your card?',
    },
    {
      tone: 'playful',
      title: '{category} had a party this week 🎉',
      body: '{amount} spent ({ratio} of standard). Time to pause and balance things out before month end.',
    },
    {
      tone: 'playful',
      title: '{category} is breaking speed limits 🏎️',
      body: 'Spending jumped to {amount} ({ratio} normal). Tap to review the damage.',
    },

    // Nudging
    {
      tone: 'nudging',
      title: 'Unusual spike in {category} 📈',
      body: '{category} reached {amount}, which is {ratio} your typical average. Worth a quick review?',
    },
    {
      tone: 'nudging',
      title: 'Spend variance: {category}',
      body: 'Heads up: {category} is trending {ratio} above your 3-month baseline ({amount} total).',
    },
    {
      tone: 'nudging',
      title: 'Category alert: {category}',
      body: '{amount} spent in {category} ({ratio} usual). Check if any unplanned charges slipped in.',
    },
    {
      tone: 'nudging',
      title: '{category} running {ratio} above normal',
      body: 'Total has climbed to {amount}. A quick check ensures you stay within your monthly target.',
    },
    {
      tone: 'nudging',
      title: 'Notice: {category} surge',
      body: '{category} charges are {ratio} higher than standard ({amount}). Tap to inspect recent transactions.',
    },

    // Straight
    {
      tone: 'straight',
      title: 'Spending Anomaly: {category}',
      body: '{category} charges ({amount}) are {ratio} above your 90-day baseline average.',
    },
    {
      tone: 'straight',
      title: 'Category Variance Report',
      body: '{category} outflows stand at {amount}, representing a {ratio} increase over baseline.',
    },
    {
      tone: 'straight',
      title: 'Unusual Outflow: {category}',
      body: '{category} spending reached {amount} ({ratio} of expected monthly distribution).',
    },
    {
      tone: 'straight',
      title: 'Expense Notice: {category}',
      body: '{category} variance detected: {amount} spent ({ratio} historic average).',
    },
    {
      tone: 'straight',
      title: 'Outflow Verification: {category}',
      body: '{category} has experienced an increase of {ratio} compared to typical cycles.',
    },
  ],

  /* ------------------------------------------------------------------ */
  /* 5. WIN (No-spend streaks, goal milestones, lower spend)           */
  /* ------------------------------------------------------------------ */
  win: [
    // Playful
    {
      tone: 'playful',
      title: 'Your wallet is meditating 🧘',
      body: '{days_left} days, ₹0 spent. One more clean day beats your personal record!',
    },
    {
      tone: 'playful',
      title: 'Look at you being financially mature 💅',
      body: '{days_left} zero-spend days in a row! Bank balance is sleeping peacefully.',
    },
    {
      tone: 'playful',
      title: '{pct} of {goal_name} locked in! 🎯',
      body: 'Only {gap} left to the finish line. Someone is getting their dream very soon.',
    },
    {
      tone: 'playful',
      title: 'Spend dropped {pct_down} this week 📉',
      body: 'Whoever you are right now, please stay like this. Beautiful money management!',
    },
    {
      tone: 'playful',
      title: 'Zero rupees spent yesterday 🏆',
      body: 'The cleanest transaction sheet all week. Keep flexing that discipline, boss.',
    },

    // Nudging
    {
      tone: 'nudging',
      title: 'Solid discipline, {name} 👏',
      body: '{days_left} consecutive days with zero discretionary outflow. Momentum in action!',
    },
    {
      tone: 'nudging',
      title: 'Milestone reached: {goal_name}',
      body: '{goal_name} is now {pct} complete! Just {gap} remaining to achieve your target.',
    },
    {
      tone: 'nudging',
      title: 'Weekly win: spend is down {pct_down} 📉',
      body: 'You spent {pct_down} less this week compared to last week. Great progress!',
    },
    {
      tone: 'nudging',
      title: 'Goal progress: {goal_name} at {pct}',
      body: 'You’re within {gap} of completing {goal_name}. Tap to see your estimated finish date.',
    },
    {
      tone: 'nudging',
      title: 'Financial momentum building 🌟',
      body: '{days_left} zero-spend days recorded. Saving small amounts daily creates massive wins.',
    },

    // Straight
    {
      tone: 'straight',
      title: 'Goal Milestone: {goal_name}',
      body: '{goal_name} has reached {pct} of total target ({gap} remaining to completion).',
    },
    {
      tone: 'straight',
      title: 'Weekly Expense Reduction',
      body: 'Net expenditure decreased by {pct_down} compared to the trailing 7-day period.',
    },
    {
      tone: 'straight',
      title: 'Discipline Streak Recorded',
      body: '{days_left} consecutive zero-outflow days logged. Cash reserves preserved.',
    },
    {
      tone: 'straight',
      title: 'Savings Goal Update: {goal_name}',
      body: '{goal_name} stands at {pct} of target ({gap} needed). Target remains on schedule.',
    },
    {
      tone: 'straight',
      title: 'Expense Performance Update',
      body: 'Discretionary outflows are {pct_down} lower than the preceding weekly cycle.',
    },
  ],

  /* ------------------------------------------------------------------ */
  /* 6. SALARY / INFLOW (Fresh income arrival)                          */
  /* ------------------------------------------------------------------ */
  salary: [
    // Playful
    {
      tone: 'playful',
      title: 'Salary landed: {amount} 🎉',
      body: 'Quick, move a slice to your goals before your weekend self discovers it!',
    },
    {
      tone: 'playful',
      title: 'The sweetest text of the month arrived 💰',
      body: '{amount} credited! High score restored. Treat future-you first before Swiggy finds out.',
    },
    {
      tone: 'playful',
      title: 'Fresh salary detected: {amount} 🚀',
      body: 'Secure your savings transfer early and make this paycheck last longer than the last one.',
    },
    {
      tone: 'playful',
      title: 'Payday energy: {amount} in the bank 🥂',
      body: 'Lock in your savings first, then enjoy the weekend guilt-free, boss.',
    },
    {
      tone: 'playful',
      title: 'Account topped up with {amount} 💳',
      body: 'Pay yourself first today. Even ₹2,000 to goals makes future-you very happy.',
    },

    // Nudging
    {
      tone: 'nudging',
      title: 'Inflow alert: {amount} salary received',
      body: 'Great time to fund your savings goals and set aside fixed expenses while cash is fresh.',
    },
    {
      tone: 'nudging',
      title: 'Salary credited: {amount} 💼',
      body: 'Allocating your savings and commitments now keeps the rest of the month smooth and stress-free.',
    },
    {
      tone: 'nudging',
      title: 'Payday notice for {name}',
      body: '{amount} received today. A quick 10% transfer to your goals sets up an easy month.',
    },
    {
      tone: 'nudging',
      title: 'Monthly inflow confirmed: {amount}',
      body: 'Review your budget allocations for the period ahead while liquidity is strong.',
    },
    {
      tone: 'nudging',
      title: 'Fresh income: {amount}',
      body: 'Deposit confirmed. Tap to review your monthly plan and allocate savings.',
    },

    // Straight
    {
      tone: 'straight',
      title: 'Salary Deposit Confirmed',
      body: '{amount} credited to your account. Monthly allocations are ready for review.',
    },
    {
      tone: 'straight',
      title: 'Income Inflow Recorded',
      body: '{amount} deposited. Consider reviewing savings goal allocations.',
    },
    {
      tone: 'straight',
      title: 'Credit Transaction: {amount}',
      body: 'Salary credit received. Budget limits and goal allocations refreshed for the cycle.',
    },
    {
      tone: 'straight',
      title: 'Account Credit Notice',
      body: 'Inflow of {amount} logged. Tap to review current account distribution.',
    },
    {
      tone: 'straight',
      title: 'Deposit Notification',
      body: '{amount} received in account. Fixed obligation allocations available.',
    },
  ],
};

/**
 * Replaces template placeholders with real values.
 */
export const renderTemplate = (
  template: { title: string; body: string },
  facts: SignalFacts,
): { title: string; body: string } => {
  const replacer = (text: string): string => {
    return text
      .replace(/{name}/g, facts.name || 'there')
      .replace(/{amount}/g, formatINR(facts.amount))
      .replace(/{category}/g, facts.category || 'spending')
      .replace(/{merchant}/g, facts.merchant || 'merchant')
      .replace(/{count}/g, String(facts.count || '1'))
      .replace(/{days_early}/g, String(facts.daysEarly || 'a few'))
      .replace(/{burnout_date}/g, facts.burnoutDate || 'month end')
      .replace(/{runway_amount}/g, formatINR(facts.runwayAmount))
      .replace(/{per_day}/g, facts.perDay ? Math.round(facts.perDay).toLocaleString('en-IN') : '0')
      .replace(/{days_left}/g, String(facts.daysLeft || '0'))
      .replace(/{goal_name}/g, facts.goalName || 'Savings Goal')
      .replace(/{pct}/g, `${facts.pct || 0}%`)
      .replace(/{gap}/g, formatINR(facts.gap))
      .replace(/{ratio}/g, typeof facts.ratio === 'number' ? `${facts.ratio.toFixed(1)}×` : facts.ratio || '2×')
      .replace(/{pct_down}/g, `${facts.pctDown || 0}%`);
  };

  return {
    title: replacer(template.title),
    body: replacer(template.body),
  };
};

/**
 * Selects an optimal template variation respecting tone and safety guardrails.
 */
export const selectTemplate = (
  type: SignalType,
  preferredTone: SignalTone,
  facts: SignalFacts,
  recentlySentBodies: string[] = [],
): { title: string; body: string; tone: SignalTone } => {
  let effectiveTone = preferredTone;

  // Guardrail 1: Sensitive categories MUST be straight tone
  if (facts.category && SENSITIVE_CATEGORIES.has(facts.category.trim().toLowerCase())) {
    effectiveTone = 'straight';
  }

  // Guardrail 2: Low runway (< ₹150/day) MUST be empathetic straight tone
  if (type === 'runway' && facts.perDay !== undefined && facts.perDay < 150) {
    effectiveTone = 'straight';
  }

  const templatesForType = TEMPLATE_BANK[type] || TEMPLATE_BANK.runway;
  const filtered = templatesForType.filter((t) => t.tone === effectiveTone);
  const pool = filtered.length > 0 ? filtered : templatesForType;

  // Pick one that does not overlap heavily with recently sent notifications
  const recentBodiesLower = recentlySentBodies.map((b) => b.toLowerCase());
  const freshTemplates = pool.filter((t) => {
    const rendered = renderTemplate(t, facts);
    return !recentBodiesLower.some((recent) => recent.includes(rendered.body.slice(0, 25).toLowerCase()));
  });

  const chosen = freshTemplates.length > 0
    ? freshTemplates[Math.floor(Math.random() * freshTemplates.length)]
    : pool[Math.floor(Math.random() * pool.length)];

  const rendered = renderTemplate(chosen, facts);

  return {
    title: rendered.title,
    body: rendered.body,
    tone: chosen.tone,
  };
};

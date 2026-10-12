/**
 * Executive Prompt Card Sets - Regent AI Financial Intelligence
 * 11 thematic sets, each containing exactly 11 cards (121 cards total).
 * Rotates weekly by default, and advances dynamically when all cards in a set are explored.
 */

export interface ExecutivePromptCard {
  id: string;
  icon: string;
  title: string;
  query: string;
}

export interface ExecutivePromptSet {
  id: string;
  category: string;
  badge: string;
  cards: ExecutivePromptCard[];
}

export const EXECUTIVE_PROMPT_SETS: ExecutivePromptSet[] = [
  // SET 0: Total Liquidity & Treasury
  {
    id: 'set-0-liquidity',
    category: 'Treasury & Liquidity',
    badge: 'Liquidity',
    cards: [
      {
        id: 's0-c1',
        icon: 'briefcase',
        title: 'Total Liquidity & Balances',
        query: 'What is my total liquidity across all connected bank accounts?',
      },
      {
        id: 's0-c2',
        icon: 'percent',
        title: 'Idle Cash Optimization',
        query: 'How much idle cash can I sweep into higher-yield liquid funds?',
      },
      {
        id: 's0-c3',
        icon: 'layers',
        title: 'Account Balances Spread',
        query: 'Break down my current balance across each bank account and wallet.',
      },
      {
        id: 's0-c4',
        icon: 'shield',
        title: 'Emergency Liquidity Buffer',
        query: 'Do I have at least 3 to 6 months of liquid emergency reserves available?',
      },
      {
        id: 's0-c5',
        icon: 'activity',
        title: 'Working Capital Health',
        query: 'What is my liquid working capital available for daily operations this week?',
      },
      {
        id: 's0-c6',
        icon: 'repeat',
        title: 'Bank Transfer Velocity',
        query: 'Show all inter-bank transfers and account rebalancing moved recently.',
      },
      {
        id: 's0-c7',
        icon: 'anchor',
        title: 'Primary Account Cushion',
        query: 'What is the safe operating balance on my primary transaction account?',
      },
      {
        id: 's0-c8',
        icon: 'trending-up',
        title: 'High Balance Alerts',
        query: 'Which accounts currently hold more cash than their target thresholds?',
      },
      {
        id: 's0-c9',
        icon: 'alert-circle',
        title: 'Low Balance Exposure',
        query: 'Are any connected bank accounts nearing minimum balance thresholds?',
      },
      {
        id: 's0-c10',
        icon: 'compass',
        title: 'Multi-Account Consolidation',
        query: 'Could I consolidate unused bank accounts to simplify management?',
      },
      {
        id: 's0-c11',
        icon: 'dollar-sign',
        title: 'Unallocated Cash Summary',
        query: 'How much liquid money is completely unallocated right now?',
      },
    ],
  },

  // SET 1: Cash Flow & Monthly Burn Rate
  {
    id: 'set-1-cashflow',
    category: 'Cash Flow & Burn Rate',
    badge: 'Cash Flow',
    cards: [
      {
        id: 's1-c1',
        icon: 'activity',
        title: 'Cash Flow & Burn Rate',
        query: 'Analyze my net cash flow and monthly burn rate this month.',
      },
      {
        id: 's1-c2',
        icon: 'clock',
        title: 'Daily Burn Velocity',
        query: 'What is my average daily cash burn rate over the past 30 days?',
      },
      {
        id: 's1-c3',
        icon: 'trending-up',
        title: 'Inflow vs Outflow Gap',
        query: 'Compare my total income deposits versus total expenditures this month.',
      },
      {
        id: 's1-c4',
        icon: 'bar-chart-2',
        title: 'Mid-Month Burn Pacing',
        query: 'Am I burning cash faster or slower than last month at this exact date?',
      },
      {
        id: 's1-c5',
        icon: 'calendar',
        title: 'Projected Month-End Cash',
        query: 'What is my projected end-of-month cash surplus based on current pacing?',
      },
      {
        id: 's1-c6',
        icon: 'zap',
        title: 'Runaway Spend Alerts',
        query: 'Highlight categories where spending accelerated dramatically this week.',
      },
      {
        id: 's1-c7',
        icon: 'pie-chart',
        title: 'Fixed vs Variable Burn',
        query: 'What percentage of my monthly burn is fixed commitments vs variable spends?',
      },
      {
        id: 's1-c8',
        icon: 'coffee',
        title: 'Weekend Burn Spikes',
        query: 'How much higher is my spending rate on weekends compared to weekdays?',
      },
      {
        id: 's1-c9',
        icon: 'clock',
        title: 'Cash Inflow Lag',
        query: 'Are any expected payouts or scheduled receipts delayed this cycle?',
      },
      {
        id: 's1-c10',
        icon: 'target',
        title: 'Discretionary Burn Cushion',
        query: 'How much discretionary spending buffer do I have left before breaking even?',
      },
      {
        id: 's1-c11',
        icon: 'check-circle',
        title: 'Zero-Based Allocation',
        query: 'How closely does my cash flow follow a zero-based budget this month?',
      },
    ],
  },

  // SET 2: Budget & Capital Allocation
  {
    id: 'set-2-budgets',
    category: 'Budget & Capital Allocation',
    badge: 'Budgets',
    cards: [
      {
        id: 's2-c1',
        icon: 'target',
        title: 'Budget & Capital Allocation',
        query: 'Review my remaining budget and category spending limits.',
      },
      {
        id: 's2-c2',
        icon: 'pie-chart',
        title: '50/30/20 Rule Health',
        query: 'How does my current spending map to Needs (50%), Wants (30%), and Savings (20%)?',
      },
      {
        id: 's2-c3',
        icon: 'alert-circle',
        title: 'Over-Budget Alerts',
        query: 'Which spending categories have exceeded or are near 90% of their limits?',
      },
      {
        id: 's2-c4',
        icon: 'shopping-bag',
        title: 'Grocery & Essentials Cap',
        query: 'How much budget remains for groceries, supermarkets, and essentials?',
      },
      {
        id: 's2-c5',
        icon: 'coffee',
        title: 'Dining & Entertainment Budget',
        query: 'What is my remaining allowance for restaurants, cafés, and entertainment?',
      },
      {
        id: 's2-c6',
        icon: 'compass',
        title: 'Transport & Fuel Allocation',
        query: 'Review my monthly fuel, cab, and commute expenditures against limits.',
      },
      {
        id: 's2-c7',
        icon: 'tag',
        title: 'Shopping & Discretionary Cap',
        query: 'What is my remaining discretionary shopping budget for this month?',
      },
      {
        id: 's2-c8',
        icon: 'file-text',
        title: 'Utility & Bills Budget',
        query: 'Are utility and household bill expenses within their planned monthly caps?',
      },
      {
        id: 's2-c9',
        icon: 'repeat',
        title: 'Mid-Month Budget Rebalance',
        query: 'Suggest budget reallocation from under-spent categories to tight ones.',
      },
      {
        id: 's2-c10',
        icon: 'trending-up',
        title: 'Unused Budget Rollover',
        query: 'Which budget categories had surplus cash left over last month?',
      },
      {
        id: 's2-c11',
        icon: 'lock',
        title: 'Strict Spend Discipline',
        query: 'Where can I trim 10% this week to keep my overall budget fully intact?',
      },
    ],
  },

  // SET 3: Expenses & Transaction Intelligence
  {
    id: 'set-3-expenses',
    category: 'Expense Intelligence',
    badge: 'Expenses',
    cards: [
      {
        id: 's3-c1',
        icon: 'trending-down',
        title: 'Top Expense Analysis',
        query: 'What are my largest single transactions and expenses recently?',
      },
      {
        id: 's3-c2',
        icon: 'shopping-bag',
        title: 'Top 5 Merchant Drains',
        query: 'Which 5 merchants or companies received the most money from me this month?',
      },
      {
        id: 's3-c3',
        icon: 'clock',
        title: 'Micro-Transaction Creep',
        query: 'Total up all small UPI transactions under ₹200 to see their cumulative impact.',
      },
      {
        id: 's3-c4',
        icon: 'bar-chart-2',
        title: 'Week-Over-Week Expense Jump',
        query: 'Did my overall expenses increase or decrease compared to last week?',
      },
      {
        id: 's3-c5',
        icon: 'pie-chart',
        title: 'Category Concentration',
        query: 'What single expense category accounts for the highest percentage of outflows?',
      },
      {
        id: 's3-c6',
        icon: 'layers',
        title: 'One-Time vs Routine Outflows',
        query: 'Separate extraordinary one-off expenses from regular recurring spends.',
      },
      {
        id: 's3-c7',
        icon: 'check-circle',
        title: 'Refund & Cashback Verification',
        query: 'Track recent merchant refunds, reversed charges, and cashbacks received.',
      },
      {
        id: 's3-c8',
        icon: 'clock',
        title: 'Late Night Spend Audit',
        query: 'Review transactions made late at night or during unusual spending hours.',
      },
      {
        id: 's3-c9',
        icon: 'repeat',
        title: 'High-Frequency Merchants',
        query: 'Which stores or apps do I interact with more than 10 times a month?',
      },
      {
        id: 's3-c10',
        icon: 'crosshair',
        title: 'Expense Category Drilldown',
        query: 'Provide a granular breakdown of miscellaneous and unassigned expenditures.',
      },
      {
        id: 's3-c11',
        icon: 'dollar-sign',
        title: 'Big-Ticket Prioritization',
        query: 'Analyze the top 3 purchases this month and their necessity rating.',
      },
    ],
  },

  // SET 4: Recurring Subscriptions & Fixed Bills
  {
    id: 'set-4-subscriptions',
    category: 'Subscriptions & Bills',
    badge: 'Recurring',
    cards: [
      {
        id: 's4-c1',
        icon: 'repeat',
        title: 'Recurring Subscriptions & Bills',
        query: 'Identify all my recurring payments and utility charges.',
      },
      {
        id: 's4-c2',
        icon: 'trash-2',
        title: 'Subscription Waste Audit',
        query: 'Find recurring subscriptions that haven’t been actively used in 60 days.',
      },
      {
        id: 's4-c3',
        icon: 'calendar',
        title: 'Annual vs Monthly Plans',
        query: 'Which recurring services would be significantly cheaper if switched to annual billing?',
      },
      {
        id: 's4-c4',
        icon: 'clock',
        title: 'Upcoming Auto-Debits',
        query: 'List all auto-debits and recurring mandates scheduled to trigger in the next 7 days.',
      },
      {
        id: 's4-c5',
        icon: 'layers',
        title: 'Streaming & SaaS Overhead',
        query: 'Calculate total monthly spend across digital streaming, software, and apps.',
      },
      {
        id: 's4-c6',
        icon: 'alert-circle',
        title: 'Subscription Price Increases',
        query: 'Detect any recurring services that silently raised their monthly charges recently.',
      },
      {
        id: 's4-c7',
        icon: 'activity',
        title: 'Gym & Fitness Memberships',
        query: 'Track monthly payments toward health clubs, gyms, and sports subscriptions.',
      },
      {
        id: 's4-c8',
        icon: 'cpu',
        title: 'Telecom & Internet Invoices',
        query: 'Review monthly broadband, mobile recharge, and telecom plan charges.',
      },
      {
        id: 's4-c9',
        icon: 'lock',
        title: 'Dormant Trial Traps',
        query: 'Check for any free trials or introductory rates about to convert to full price.',
      },
      {
        id: 's4-c10',
        icon: 'zap',
        title: 'Utility Bill Optimization',
        query: 'Compare electricity, water, and gas bills against seasonal historical averages.',
      },
      {
        id: 's4-c11',
        icon: 'target',
        title: 'Subscription Spend Cap',
        query: 'What is my total fixed subscription load as a percentage of take-home income?',
      },
    ],
  },

  // SET 5: Income Streams & Capital Inflows
  {
    id: 'set-5-inflows',
    category: 'Income Streams & Inflows',
    badge: 'Inflows',
    cards: [
      {
        id: 's5-c1',
        icon: 'dollar-sign',
        title: 'Income & Credit Inflow',
        query: 'Summarize all credit deposits and salary inflows this month.',
      },
      {
        id: 's5-c2',
        icon: 'trending-up',
        title: 'Secondary Inflow Streams',
        query: 'How much secondary income did I earn outside my primary salary this month?',
      },
      {
        id: 's5-c3',
        icon: 'percent',
        title: 'Dividend & Interest Yields',
        query: 'Calculate total dividend payouts and savings account interest credited this quarter.',
      },
      {
        id: 's5-c4',
        icon: 'file-text',
        title: 'Client Invoice Tracking',
        query: 'Are there any expected freelance, consulting, or client payments still pending?',
      },
      {
        id: 's5-c5',
        icon: 'layers',
        title: 'Salary Day Capital Split',
        query: 'How quickly is my salary dispersed into savings, bills, and discretionary pools?',
      },
      {
        id: 's5-c6',
        icon: 'activity',
        title: 'Income Consistency Index',
        query: 'Analyze the month-on-month volatility and reliability of my income streams.',
      },
      {
        id: 's5-c7',
        icon: 'home',
        title: 'Rental & Passive Receipts',
        query: 'Verify that all expected rental or passive income deposits were recorded on time.',
      },
      {
        id: 's5-c8',
        icon: 'award',
        title: 'Quarterly Bonus & Lump Sums',
        query: 'Summarize one-off bonus deposits and incentive credits received year-to-date.',
      },
      {
        id: 's5-c9',
        icon: 'bar-chart-2',
        title: 'Capital Inflow Trajectory',
        query: 'Compare my trailing 6-month earnings growth against the prior 6 months.',
      },
      {
        id: 's5-c10',
        icon: 'shield',
        title: 'Tax Withholding at Source',
        query: 'Check the TDS and tax withholdings deducted from recent client or employer payments.',
      },
      {
        id: 's5-c11',
        icon: 'flag',
        title: 'Peak Income Milestones',
        query: 'What was my highest cash inflow month this calendar year and what drove it?',
      },
    ],
  },

  // SET 6: Debt Optimization & Credit Management
  {
    id: 'set-6-debt',
    category: 'Debt & Credit Management',
    badge: 'Debt & Credit',
    cards: [
      {
        id: 's6-c1',
        icon: 'credit-card',
        title: 'Credit Utilization & Dues',
        query: 'What is my current credit card balance and credit utilization ratio?',
      },
      {
        id: 's6-c2',
        icon: 'calendar',
        title: 'EMI & Loan Obligations',
        query: 'List all active EMIs, principal balances, and monthly installment commitments.',
      },
      {
        id: 's6-c3',
        icon: 'trending-down',
        title: 'Interest Leakage Audit',
        query: 'Am I paying any finance charges, late fees, or high revolving card interest?',
      },
      {
        id: 's6-c4',
        icon: 'clock',
        title: 'Credit Card Billing Cycle',
        query: 'When are the statement dates and grace periods for all my active credit cards?',
      },
      {
        id: 's6-c5',
        icon: 'target',
        title: 'Debt Snowball / Avalanche',
        query: 'Which outstanding balance should I clear first to save the most interest?',
      },
      {
        id: 's6-c6',
        icon: 'percent',
        title: 'Total Debt-to-Income Ratio',
        query: 'What percentage of my monthly earnings is currently committed to debt servicing?',
      },
      {
        id: 's6-c7',
        icon: 'check-circle',
        title: 'Zero-Cost EMI Verification',
        query: 'Check if any "no-cost" EMIs added hidden processing fees or GST surcharges.',
      },
      {
        id: 's6-c8',
        icon: 'shield',
        title: 'Credit Limit Optimization',
        query: 'Are my card credit limits high enough to keep utilization safely under 30%?',
      },
      {
        id: 's6-c9',
        icon: 'award',
        title: 'Loan Prepayment Feasibility',
        query: 'How much interest would I save by making an extra principal payment this quarter?',
      },
      {
        id: 's6-c10',
        icon: 'alert-circle',
        title: 'Minimum Due Pitfall',
        query: 'Show the total cost penalty if only paying minimum amount due on credit cards.',
      },
      {
        id: 's6-c11',
        icon: 'flag',
        title: 'Debt-Free Timeline',
        query: 'At my current monthly payment pace, on what date will all my loans be 100% paid off?',
      },
    ],
  },

  // SET 7: Investments, Net Worth & Portfolio
  {
    id: 'set-7-wealth',
    category: 'Investments & Net Worth',
    badge: 'Net Worth',
    cards: [
      {
        id: 's7-c1',
        icon: 'pie-chart',
        title: 'Monthly Net Worth Snapshot',
        query: 'Calculate my total estimated net worth across all accounts.',
      },
      {
        id: 's7-c2',
        icon: 'layers',
        title: 'Asset vs Liability Ratio',
        query: 'What is the ratio of my liquid and invested assets compared to all liabilities?',
      },
      {
        id: 's7-c3',
        icon: 'repeat',
        title: 'Monthly SIP Execution',
        query: 'Verify that all scheduled mutual fund SIPs and automated investments executed.',
      },
      {
        id: 's7-c4',
        icon: 'bar-chart-2',
        title: 'Asset Allocation Balance',
        query: 'Break down my portfolio allocation between Equities, Debt, Gold, and Cash.',
      },
      {
        id: 's7-c5',
        icon: 'trending-up',
        title: 'Compounding Milestones',
        query: 'Project how much my regular monthly investments will grow in 5 and 10 years.',
      },
      {
        id: 's7-c6',
        icon: 'dollar-sign',
        title: 'Dividend Reinvestment Check',
        query: 'How much investment income was automatically reinvested into growth portfolios?',
      },
      {
        id: 's7-c7',
        icon: 'crosshair',
        title: 'Idle Cash to SIP Transfer',
        query: 'Could surplus savings support an extra 10% increase to my active monthly SIPs?',
      },
      {
        id: 's7-c8',
        icon: 'lock',
        title: 'Gold & Fixed Deposit Holdings',
        query: 'Summarize my conservative wealth hedges across sovereign gold bonds and FDs.',
      },
      {
        id: 's7-c9',
        icon: 'activity',
        title: 'Net Worth Growth Velocity',
        query: 'How much has my overall net worth expanded over the last 12 months?',
      },
      {
        id: 's7-c10',
        icon: 'shield',
        title: 'Portfolio Risk Exposure',
        query: 'Is my invested capital diversified enough across asset classes and fund houses?',
      },
      {
        id: 's7-c11',
        icon: 'briefcase',
        title: 'Lump Sum Investment Timing',
        query: 'Where should I deploy recent unallocated surplus capital for optimal growth?',
      },
    ],
  },

  // SET 8: Lifestyle, Dining & Leisure Spending
  {
    id: 'set-8-lifestyle',
    category: 'Lifestyle & Leisure Spending',
    badge: 'Lifestyle',
    cards: [
      {
        id: 's8-c1',
        icon: 'coffee',
        title: 'Dining & Lifestyle Spending',
        query: 'How much have I spent on food, dining, and travel recently?',
      },
      {
        id: 's8-c2',
        icon: 'shopping-bag',
        title: 'Food Delivery vs Cooking',
        query: 'Compare my spending on food delivery apps (Zomato/Swiggy) vs fresh groceries.',
      },
      {
        id: 's8-c3',
        icon: 'coffee',
        title: 'Café & Coffee Outings',
        query: 'Total up all coffee shop, café, and quick-bite charges this month.',
      },
      {
        id: 's8-c4',
        icon: 'activity',
        title: 'Weekend Leisure Outflows',
        query: 'How much capital went toward weekend entertainment, movies, and outings?',
      },
      {
        id: 's8-c5',
        icon: 'compass',
        title: 'Travel & Vacation Fund',
        query: 'How much have I spent on flights, hotels, and cabs over the last quarter?',
      },
      {
        id: 's8-c6',
        icon: 'tag',
        title: 'Impulse Shopping Audit',
        query: 'Review non-essential e-commerce and retail transactions made on impulse.',
      },
      {
        id: 's8-c7',
        icon: 'cpu',
        title: 'Gadget & Tech Purchases',
        query: 'Total up spending on tech gadgets, electronics, and device accessories this year.',
      },
      {
        id: 's8-c8',
        icon: 'heart',
        title: 'Fitness & Wellness Costs',
        query: 'What is my monthly investment into sports, gym, supplements, and wellness?',
      },
      {
        id: 's8-c9',
        icon: 'gift',
        title: 'Social Event & Gifting',
        query: 'How much money did I spend on gifts, celebrations, and festive parties?',
      },
      {
        id: 's8-c10',
        icon: 'dollar-sign',
        title: 'Guilt-Free Spending Allowance',
        query: 'How much fun, guilt-free money do I have left without hurting savings targets?',
      },
      {
        id: 's8-c11',
        icon: 'trending-up',
        title: 'Lifestyle Inflation Check',
        query: 'Has my lifestyle spending grown faster than my income over the past 6 months?',
      },
    ],
  },

  // SET 9: Security, Anomalies & Audit Intelligence
  {
    id: 'set-9-security',
    category: 'Security & Anomaly Detection',
    badge: 'Security',
    cards: [
      {
        id: 's9-c1',
        icon: 'shield',
        title: 'Anomaly & Security Check',
        query: 'Were there any unusual spikes or suspicious transactions?',
      },
      {
        id: 's9-c2',
        icon: 'alert-circle',
        title: 'Duplicate Transaction Scan',
        query: 'Scan for identical transaction amounts billed multiple times within 24 hours.',
      },
      {
        id: 's9-c3',
        icon: 'trending-up',
        title: 'Sudden Merchant Spikes',
        query: 'Which merchants billed me significantly higher than my historical average?',
      },
      {
        id: 's9-c4',
        icon: 'crosshair',
        title: 'Unfamiliar Merchant Lookups',
        query: 'List transactions with cryptic or unrecognized vendor descriptions.',
      },
      {
        id: 's9-c5',
        icon: 'clock',
        title: 'Midnight Transaction Review',
        query: 'Audit transactions initiated between midnight and 5 AM for security verification.',
      },
      {
        id: 's9-c6',
        icon: 'credit-card',
        title: 'Card Swipe vs UPI Ratio',
        query: 'What percentage of my transactions were done via UPI vs physical card swipes?',
      },
      {
        id: 's9-c7',
        icon: 'compass',
        title: 'International Currency Fees',
        query: 'Were there any forex markup fees or foreign currency charges billed recently?',
      },
      {
        id: 's9-c8',
        icon: 'file-text',
        title: 'Refund Pending Verification',
        query: 'Highlight returned online orders where the bank refund has not landed yet.',
      },
      {
        id: 's9-c9',
        icon: 'dollar-sign',
        title: 'ATM Cash Withdrawal Audit',
        query: 'Review all physical ATM cash withdrawals and cash spending velocity.',
      },
      {
        id: 's9-c10',
        icon: 'zap',
        title: 'High-Value Outlier Charges',
        query: 'Flag any single transactions exceeding 3 standard deviations from my normal spend.',
      },
      {
        id: 's9-c11',
        icon: 'lock',
        title: 'Account Access & Security Pulse',
        query: 'Confirm all financial accounts have up-to-date sync and clean transaction history.',
      },
    ],
  },

  // SET 10: Long-Term Goals, FIRE & Wealth Compounding
  {
    id: 'set-10-goals',
    category: 'Goals, FIRE & Wealth Growth',
    badge: 'Goals & FIRE',
    cards: [
      {
        id: 's10-c1',
        icon: 'award',
        title: 'Savings & Wealth Goals',
        query: 'What is my progress toward my active savings targets?',
      },
      {
        id: 's10-c2',
        icon: 'flag',
        title: 'FIRE Target Progress',
        query: 'What is my current progress toward Financial Independence, Retire Early (FIRE)?',
      },
      {
        id: 's10-c3',
        icon: 'shield',
        title: 'Emergency Runway in Months',
        query: 'If all income stopped today, how many months of current expenses could I survive?',
      },
      {
        id: 's10-c4',
        icon: 'percent',
        title: 'Annual Savings Rate %',
        query: 'What percentage of my gross annual income did I save and invest this year?',
      },
      {
        id: 's10-c5',
        icon: 'home',
        title: 'Home Ownership Milestone',
        query: 'How much capital have I saved toward my dream home down payment or property?',
      },
      {
        id: 's10-c6',
        icon: 'calendar',
        title: 'Retirement Corpus Pacing',
        query: 'Is my retirement fund trajectory tracking ahead of or behind my target age goal?',
      },
      {
        id: 's10-c7',
        icon: 'trending-up',
        title: '10-Year Wealth Projection',
        query: 'Project my net worth in 10 years assuming a conservative 11% CAGR.',
      },
      {
        id: 's10-c8',
        icon: 'target',
        title: 'Child Education / Big Goal Fund',
        query: 'Track funded progress toward key long-term family and education milestones.',
      },
      {
        id: 's10-c9',
        icon: 'activity',
        title: 'Wealth Longevity Stress Test',
        query: 'Simulate how a 6-month recession or market drop would affect my wealth plan.',
      },
      {
        id: 's10-c10',
        icon: 'check-circle',
        title: 'Financial Freedom Milestones',
        query: 'Which major financial milestone is closest to completion right now?',
      },
      {
        id: 's10-c11',
        icon: 'briefcase',
        title: 'Generational Wealth Strategy',
        query: 'Provide 3 recommendations to accelerate long-term capital compounding.',
      },
    ],
  },
];

/**
 * Calculates current weekly set index (0 to 10) based on epoch week.
 * Changes automatically every week!
 */
export const getWeeklySetIndex = (): number => {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const currentWeek = Math.floor(Date.now() / msPerWeek);
  return Math.abs(currentWeek) % EXECUTIVE_PROMPT_SETS.length;
};

/**
 * Gets a fresh, random opening card index (0 to 10) so every fresh open
 * or different user sees a dynamic opening card.
 */
export const getRandomCardIndex = (maxCards: number = 11): number => {
  return Math.floor(Math.random() * maxCards);
};

/**
 * Retrieves the active 11-card deck for a given set index.
 * Guaranteed to return exactly 11 cards.
 */
export const getExecutiveDeck = (setIndex: number): ExecutivePromptCard[] => {
  const safeIndex = ((setIndex % EXECUTIVE_PROMPT_SETS.length) + EXECUTIVE_PROMPT_SETS.length) % EXECUTIVE_PROMPT_SETS.length;
  return EXECUTIVE_PROMPT_SETS[safeIndex].cards;
};

/**
 * AI Greeting Templates - Executive Financial Intelligence
 * Short, crisp, and time-aware opening greetings (max 1 line / 4-6 words).
 */

const MORNING_GREETINGS = [
  'Good morning, {name}',
  'Morning briefing ready, {name}',
  'Ready for today, {name}?',
  'Good morning, {name}. Ready?',
  'Morning insights ready, {name}',
  'Start strong today, {name}',
  'What’s the plan, {name}?',
  'Cash flow ready, {name}',
  'Where to start, {name}?',
  'Morning check-in, {name}',
  'Today’s financial pulse, {name}',
  'Ready to optimize, {name}?',
  'Early start, {name}?',
  'Capital overview ready, {name}',
  'Today’s numbers ready, {name}',
  'Morning review, {name}',
  'What’s on your agenda, {name}?',
  'Ready to review, {name}?',
  'Let’s review cash flow, {name}',
  'Your morning pulse, {name}',
  'Let’s conquer today, {name}',
  'Morning strategy, {name}',
  'Financial briefing ready, {name}',
  'Ready for today’s moves, {name}?',
  'Good morning, {name}',
];

const AFTERNOON_GREETINGS = [
  'Good afternoon, {name}',
  'Midday check-in, {name}',
  'How are targets tracking, {name}?',
  'Afternoon update ready, {name}',
  'What’s on your mind, {name}?',
  'Review today’s numbers, {name}?',
  'Midday pulse check, {name}',
  'How can I help, {name}?',
  'Good afternoon, {name}. Ready?',
  'Afternoon briefing, {name}',
  'Let’s check balances, {name}',
  'Cash flow update, {name}',
  'Track your goals, {name}',
  'Afternoon strategy, {name}',
  'What’s on your radar, {name}?',
  'Ready for insights, {name}?',
  'Keep targets on track, {name}',
  'Midday overview, {name}',
  'Where should we focus, {name}?',
  'Quick numbers check, {name}?',
  'Capital status ready, {name}',
  'Afternoon review, {name}',
  'Ready to assist, {name}',
  'Today’s progress, {name}',
  'Good afternoon, {name}',
];

const EVENING_GREETINGS = [
  'Good evening, {name}',
  'Evening wrap-up, {name}',
  'Review today’s spend, {name}?',
  'Evening briefing ready, {name}',
  'How was today, {name}?',
  'Good evening, {name}. Ready?',
  'Close out the day, {name}',
  'Check tonight’s balances, {name}',
  'Today’s final numbers, {name}',
  'Evening check-in, {name}',
  'Reflect on today, {name}',
  'Wrap up your finances, {name}',
  'End of day review, {name}',
  'Today’s transactions ready, {name}',
  'Plan for tomorrow, {name}?',
  'Evening strategy, {name}',
  'Peace of mind tonight, {name}',
  'Ready to review, {name}?',
  'Tonight’s liquidity status, {name}',
  'Evening pulse, {name}',
  'How did finances go, {name}?',
  'Review your progress, {name}',
  'Balance check tonight, {name}',
  'Wrap today’s numbers, {name}',
  'Good evening, {name}',
];

const NIGHT_GREETINGS = [
  'Late night strategy, {name}?',
  'Quiet hours review, {name}',
  'Burning midnight oil, {name}?',
  'Night session, {name}',
  'Midnight review ready, {name}',
  'Late night check-in, {name}',
  'Working late, {name}?',
  'Still planning, {name}?',
  'Late hours clarity, {name}',
  'Quiet strategy session, {name}',
  'Midnight numbers check, {name}',
  'Late review ready, {name}',
  'Night briefing, {name}',
  'Unwind with clarity, {name}',
  'After hours focus, {name}',
];

const STRATEGIC_ANYTIME_GREETINGS = [
  'Welcome back, {name}',
  'Ready when you are, {name}',
  'How can I help, {name}?',
  'What’s on your mind, {name}?',
  'Intelligence on demand, {name}',
  'At your service, {name}',
  'Where should we start, {name}?',
  'Ask anything, {name}',
  'Capital insights ready, {name}',
  'Financial clarity, {name}',
  'Ready to assist, {name}',
  'Your co-pilot is ready, {name}',
  'Let’s explore your data, {name}',
  'What can I solve, {name}?',
  'Welcome, {name}',
  'Ready for questions, {name}',
  'Real-time clarity, {name}',
  'Decision support ready, {name}',
  'How may I assist, {name}?',
  'Numbers at your command, {name}',
];

/**
 * Returns a dynamically selected, ultra-crisp executive greeting
 * based on the user's native local time and first name. Max 1 line.
 */
export function getExecutiveGreeting(rawName?: string): string {
  let firstName = '';
  if (rawName && typeof rawName === 'string') {
    const parts = rawName.trim().split(/\s+/);
    if (parts.length > 0 && parts[0].length > 0) {
      const first = parts[0];
      firstName = first.charAt(0).toUpperCase() + first.slice(1);
    }
  }

  const hour = new Date().getHours();

  let pool: string[];
  if (hour >= 5 && hour < 12) {
    // 5:00 AM - 11:59 AM
    pool = [...MORNING_GREETINGS, ...STRATEGIC_ANYTIME_GREETINGS.slice(0, 5)];
  } else if (hour >= 12 && hour < 17) {
    // 12:00 PM - 4:59 PM
    pool = [...AFTERNOON_GREETINGS, ...STRATEGIC_ANYTIME_GREETINGS.slice(5, 10)];
  } else if (hour >= 17 && hour < 22) {
    // 5:00 PM - 9:59 PM
    pool = [...EVENING_GREETINGS, ...STRATEGIC_ANYTIME_GREETINGS.slice(10, 15)];
  } else {
    // 10:00 PM - 4:59 AM (Late Night)
    pool = [...NIGHT_GREETINGS, ...STRATEGIC_ANYTIME_GREETINGS.slice(15)];
  }

  const randomIndex = Math.floor(Math.random() * pool.length);
  const template = pool[randomIndex];

  if (firstName) {
    return template.replace(/\{name\}/g, firstName);
  }

  // Fallback when name is absent
  return template
    .replace(/,\s*\{name\}/g, '')
    .replace(/\{name\},\s*/g, '')
    .replace(/\{name\}/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

let cachedSessionGreeting: string | null = null;
let cachedSessionUser: string | null = null;

/**
 * Returns a persistent session greeting that stays steady across tab switches
 * and only resets when the app is restarted / cleared from the background.
 */
export function getSessionGreeting(rawName?: string): string {
  if (cachedSessionGreeting) {
    if (cachedSessionUser || !rawName) {
      return cachedSessionGreeting;
    }
  }

  const greeting = getExecutiveGreeting(rawName);
  cachedSessionGreeting = greeting;
  if (rawName) {
    cachedSessionUser = rawName;
  }
  return greeting;
}


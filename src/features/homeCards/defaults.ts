import type { ArtKey, HomeCard } from './schema';

/** The six cards the app showed before cards became editable. Shown until a release is downloaded. */
export const DEFAULT_CARDS: HomeCard[] = [
  { id: 'bank', template: 'bank', title: 'Link your first bank account to see your real balance', cta: 'Add bank', art: 'bank', theme: 'amber', action: 'add_bank', rule: 'no_bank', platform: 'all', enabled: true },
  { id: 'overspend', template: 'overspend', title: 'You spent ₹{{spent_per_rupee}} for every ₹1 you earned', cta: 'See where it went', art: 'overspend', theme: 'coral', action: 'breakdown', rule: 'overspent', platform: 'all', enabled: true },
  { id: 'kept', template: 'kept', title: 'You kept {{kept_pct}}% of what you earned this month', cta: 'See breakdown', art: 'kept', theme: 'lime', action: 'breakdown', rule: 'saved', platform: 'all', enabled: true },
  { id: 'cash', template: 'cash', title: 'Got cash? Add it to your net worth', cta: 'Add cash', art: 'cash', theme: 'lime', action: 'open_cash', rule: 'no_cash', platform: 'all', enabled: true },
  { id: 'sms', template: 'sms', title: 'Track every rupee without typing', cta: 'Turn on auto-tracking', art: 'sms', theme: 'lilac', action: 'setup_tracking', rule: 'sms_off', platform: 'android', enabled: true },
  { id: 'regent', template: 'regent', title: 'Ask Regent where your money went this month', cta: 'Ask Regent', art: 'regent', theme: 'lime', action: 'open_regent', rule: 'always', platform: 'all', enabled: true },
];

/** The 10 standard templates admins start from. */
export const TEMPLATES: { key: ArtKey; name: string; card: Omit<HomeCard, 'id'> }[] = [
  ...DEFAULT_CARDS.map(({ id: _id, ...card }) => ({
    key: card.template,
    name: ({ bank: 'Link a bank', overspend: 'Overspend alert', kept: 'Savings win', cash: 'Add cash', sms: 'Auto-tracking', regent: 'Ask Regent' } as Record<string, string>)[card.template],
    card,
  })),
  { key: 'budget', name: 'Start a budget', card: { template: 'budget', title: 'Set a monthly budget and get a nudge before you overspend', cta: 'Create budget', art: 'budget', theme: 'sky', action: 'open_budgets', rule: 'no_budget', platform: 'all', enabled: true } },
  { key: 'goal', name: 'Savings goal', card: { template: 'goal', title: 'Saving for something? Start a goal and watch it fill up', cta: 'Start a goal', art: 'goal', theme: 'amber', action: 'open_goals', rule: 'always', platform: 'all', enabled: true } },
  { key: 'bills', name: 'Bill reminders', card: { template: 'bills', title: 'Never miss a due date. See every bill on your calendar', cta: 'Open calendar', art: 'bills', theme: 'coral', action: 'open_calendar', rule: 'always', platform: 'all', enabled: true } },
  { key: 'refer', name: 'Invite friends', card: { template: 'refer', title: 'Invite a friend to Regent Money', cta: 'Share invite', art: 'refer', theme: 'lilac', action: 'invite', rule: 'always', platform: 'all', enabled: true } },
];

/**
 * Home carousel card shape. Mirrors backend/src/home-cards/home-cards.schema.ts.
 * Pure TypeScript (no React Native imports) so it runs under `npm run test:unit`.
 */

export const ART_KEYS = ['bank', 'sms', 'cash', 'regent', 'overspend', 'kept', 'budget', 'goal', 'bills', 'refer'] as const;
export const PRESET_KEYS = ['lime', 'lilac', 'amber', 'coral', 'sky', 'forest'] as const;
export const RULE_KEYS = ['always', 'no_bank', 'sms_off', 'no_cash', 'overspent', 'saved', 'no_budget'] as const;
export const ACTION_KEYS = [
  'add_bank',
  'setup_tracking',
  'open_cash',
  'open_regent',
  'breakdown',
  'open_budgets',
  'open_goals',
  'open_calendar',
  'invite',
  'url',
] as const;
export const PLATFORM_KEYS = ['all', 'android', 'ios'] as const;

export type ArtKey = (typeof ART_KEYS)[number];
export type PresetKey = (typeof PRESET_KEYS)[number];
export type ThemeKey = PresetKey | 'custom';
export type RuleKey = (typeof RULE_KEYS)[number];
export type ActionKey = (typeof ACTION_KEYS)[number];
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export interface CustomColors {
  bg: string;
  fg: string;
  ctaBg: string;
  ctaFg: string;
}

export interface HomeCard {
  id: string;
  template: ArtKey;
  title: string;
  cta: string;
  art: ArtKey;
  theme: ThemeKey;
  colors?: CustomColors;
  action: ActionKey;
  url?: string;
  rule: RuleKey;
  platform: PlatformKey;
  enabled: boolean;
  startsAt?: string;
  endsAt?: string;
}

export const LIMITS = { maxCards: 12, maxVisible: 6, title: 70, cta: 22 } as const;

export const RULE_LABELS: Record<RuleKey, string> = {
  always: 'Everyone',
  no_bank: 'No bank linked',
  sms_off: 'SMS tracking off',
  no_cash: 'No cash wallet',
  overspent: 'Spent more than earned',
  saved: 'Saved money this month',
  no_budget: 'No budget yet',
};

export const ACTION_LABELS: Record<ActionKey, string> = {
  add_bank: 'Add bank',
  setup_tracking: 'Turn on SMS tracking',
  open_cash: 'Open cash wallet',
  open_regent: 'Open Regent chat',
  breakdown: 'Scroll to spending breakdown',
  open_budgets: 'Open budgets',
  open_goals: 'Open goals',
  open_calendar: 'Open calendar',
  invite: 'Share invite',
  url: 'Open a web link',
};

export const PLATFORM_LABELS: Record<PlatformKey, string> = { all: 'Android and iOS', android: 'Android only', ios: 'iOS only' };

/** Fill-ins the title may use; the phone replaces them with the user's own numbers. */
export const TOKENS = ['{{first_name}}', '{{spent_per_rupee}}', '{{kept_pct}}', '{{month}}'] as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const oneOf = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
};
export const contrastRatio = (a: string, b: string) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/**
 * Turns whatever came from the server or storage into cards this build can draw.
 * A card with a key this build doesn't know (added in a later release) is dropped, not drawn wrong.
 */
export function readCards(input: unknown): HomeCard[] {
  if (!Array.isArray(input)) return [];
  const out: HomeCard[] = [];
  for (const raw of input as any[]) {
    if (!raw || typeof raw !== 'object') continue;
    if (typeof raw.id !== 'string' || typeof raw.title !== 'string' || typeof raw.cta !== 'string') continue;
    if (!raw.title.trim() || !raw.cta.trim()) continue;
    if (!oneOf(ART_KEYS, raw.art) || !oneOf(RULE_KEYS, raw.rule) || !oneOf(ACTION_KEYS, raw.action)) continue;
    if (!oneOf(PLATFORM_KEYS, raw.platform)) continue;
    const custom = raw.theme === 'custom';
    if (!custom && !oneOf(PRESET_KEYS, raw.theme)) continue;
    if (custom && !(raw.colors && [raw.colors.bg, raw.colors.fg, raw.colors.ctaBg, raw.colors.ctaFg].every(isHex))) continue;
    if (raw.action === 'url' && !(typeof raw.url === 'string' && raw.url.startsWith('https://'))) continue;
    out.push({
      id: raw.id,
      template: oneOf(ART_KEYS, raw.template) ? raw.template : raw.art,
      title: raw.title.slice(0, LIMITS.title),
      cta: raw.cta.slice(0, LIMITS.cta),
      art: raw.art,
      theme: raw.theme,
      ...(custom ? { colors: { bg: raw.colors.bg, fg: raw.colors.fg, ctaBg: raw.colors.ctaBg, ctaFg: raw.colors.ctaFg } } : {}),
      action: raw.action,
      ...(raw.action === 'url' ? { url: raw.url } : {}),
      rule: raw.rule,
      platform: raw.platform,
      enabled: raw.enabled !== false,
      ...(typeof raw.startsAt === 'string' && DAY.test(raw.startsAt) ? { startsAt: raw.startsAt } : {}),
      ...(typeof raw.endsAt === 'string' && DAY.test(raw.endsAt) ? { endsAt: raw.endsAt } : {}),
    });
  }
  return out;
}

/** Problems that block publishing, keyed by field, for the admin editor. */
export function cardProblems(c: HomeCard): Partial<Record<'title' | 'cta' | 'url' | 'dates' | 'colors', string>> {
  const p: Partial<Record<'title' | 'cta' | 'url' | 'dates' | 'colors', string>> = {};
  if (!c.title.trim()) p.title = 'Add a title.';
  else if (c.title.length > LIMITS.title) p.title = `Keep it under ${LIMITS.title} characters.`;
  if (!c.cta.trim()) p.cta = 'Add button text.';
  else if (c.cta.length > LIMITS.cta) p.cta = `Keep it under ${LIMITS.cta} characters.`;
  if (c.action === 'url' && !/^https:\/\/[^\s/]+\.[^\s]+/.test(c.url || '')) p.url = 'Use a full https:// link.';
  if ((c.startsAt && !DAY.test(c.startsAt)) || (c.endsAt && !DAY.test(c.endsAt))) p.dates = 'Use YYYY-MM-DD.';
  else if (c.startsAt && c.endsAt && c.endsAt < c.startsAt) p.dates = 'End date is before the start date.';
  if (c.theme === 'custom') {
    const k = c.colors;
    if (!k || ![k.bg, k.fg, k.ctaBg, k.ctaFg].every(isHex)) p.colors = 'Colours must look like #0B3D2C.';
    else if (contrastRatio(k.bg, k.fg) < 4.5) p.colors = 'Title text is hard to read on this background.';
    else if (contrastRatio(k.ctaBg, k.ctaFg) < 4.5) p.colors = 'Button text is hard to read on the button.';
  }
  return p;
}

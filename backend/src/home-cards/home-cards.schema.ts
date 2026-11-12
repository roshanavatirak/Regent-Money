/**
 * Shape and rules for the cards on the app's Home carousel.
 * The app has a copy of the key lists in src/features/homeCards/schema.ts; keep them in step.
 * An app build that doesn't know a key skips that card, so adding keys here is safe.
 */

export const ART_KEYS = [
  'bank',
  'sms',
  'cash',
  'regent',
  'overspend',
  'kept',
  'budget',
  'goal',
  'bills',
  'refer',
] as const;
export const THEME_KEYS = [
  'lime',
  'lilac',
  'amber',
  'coral',
  'sky',
  'forest',
  'custom',
] as const;
export const RULE_KEYS = [
  'always',
  'no_bank',
  'sms_off',
  'no_cash',
  'overspent',
  'saved',
  'no_budget',
] as const;
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
export type ThemeKey = (typeof THEME_KEYS)[number];
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
  /** YYYY-MM-DD, inclusive, checked on the phone */
  startsAt?: string;
  endsAt?: string;
}

export const LIMITS = {
  maxCards: 12,
  maxVisible: 6,
  title: 70,
  cta: 22,
  keepReleases: 20,
} as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

const channel = (v: number) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255)
  );
};
export const contrastRatio = (a: string, b: string) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const oneOf = <T extends readonly string[]>(
  list: T,
  v: unknown,
): v is T[number] =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

const cleanText = (v: unknown) =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';

/** Hosts a card's web link may point to. Exact host or any subdomain of it. */
export const allowedLinkHosts = (): string[] =>
  (process.env.HOME_CARDS_URL_HOSTS || 'regentmoney.com')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

const linkAllowed = (raw: string, hosts: string[]) => {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return hosts.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

/**
 * Checks a full card list from the admin and returns a clean copy.
 * Returns every problem at once so the admin can fix them in one go.
 */
export function validateCards(
  input: unknown,
  hosts = allowedLinkHosts(),
): { cards: HomeCard[]; errors: string[] } {
  const errors: string[] = [];
  if (!Array.isArray(input))
    return { cards: [], errors: ['cards must be a list'] };
  if (input.length > LIMITS.maxCards)
    errors.push(`At most ${LIMITS.maxCards} cards.`);

  const seen = new Set<string>();
  const cards: HomeCard[] = [];

  input.slice(0, LIMITS.maxCards).forEach((raw: any, i) => {
    const at = `Card ${i + 1}`;
    if (!raw || typeof raw !== 'object') {
      errors.push(`${at}: not a card.`);
      return;
    }
    const id = String(raw.id ?? '');
    if (!ID.test(id))
      errors.push(`${at}: id must be lowercase letters, digits or dashes.`);
    else if (seen.has(id)) errors.push(`${at}: id "${id}" is used twice.`);
    seen.add(id);

    const title = cleanText(raw.title);
    const cta = cleanText(raw.cta);
    if (!title) errors.push(`${at}: add a title.`);
    if (title.length > LIMITS.title)
      errors.push(`${at}: title is longer than ${LIMITS.title} characters.`);
    if (!cta) errors.push(`${at}: add button text.`);
    if (cta.length > LIMITS.cta)
      errors.push(
        `${at}: button text is longer than ${LIMITS.cta} characters.`,
      );

    if (!oneOf(ART_KEYS, raw.template)) errors.push(`${at}: unknown template.`);
    if (!oneOf(ART_KEYS, raw.art)) errors.push(`${at}: unknown illustration.`);
    if (!oneOf(THEME_KEYS, raw.theme)) errors.push(`${at}: unknown colour.`);
    if (!oneOf(ACTION_KEYS, raw.action))
      errors.push(`${at}: unknown tap action.`);
    if (!oneOf(RULE_KEYS, raw.rule)) errors.push(`${at}: unknown audience.`);
    if (!oneOf(PLATFORM_KEYS, raw.platform))
      errors.push(`${at}: unknown platform.`);

    let colors: CustomColors | undefined;
    if (raw.theme === 'custom') {
      const c = raw.colors || {};
      if (
        ![c.bg, c.fg, c.ctaBg, c.ctaFg].every(
          (v) => typeof v === 'string' && HEX.test(v),
        )
      ) {
        errors.push(`${at}: custom colours must be #RRGGBB.`);
      } else {
        colors = {
          bg: c.bg.toUpperCase(),
          fg: c.fg.toUpperCase(),
          ctaBg: c.ctaBg.toUpperCase(),
          ctaFg: c.ctaFg.toUpperCase(),
        };
        if (contrastRatio(colors.bg, colors.fg) < 4.5)
          errors.push(`${at}: title text is hard to read on this background.`);
        if (contrastRatio(colors.ctaBg, colors.ctaFg) < 4.5)
          errors.push(`${at}: button text is hard to read on the button.`);
      }
    }

    let url: string | undefined;
    if (raw.action === 'url') {
      url = cleanText(raw.url);
      if (!linkAllowed(url, hosts))
        errors.push(`${at}: link must be https:// on ${hosts.join(', ')}.`);
    }

    const startsAt = raw.startsAt ? String(raw.startsAt) : undefined;
    const endsAt = raw.endsAt ? String(raw.endsAt) : undefined;
    if (startsAt && !DAY.test(startsAt))
      errors.push(`${at}: start date must be YYYY-MM-DD.`);
    if (endsAt && !DAY.test(endsAt))
      errors.push(`${at}: end date must be YYYY-MM-DD.`);
    if (startsAt && endsAt && endsAt < startsAt)
      errors.push(`${at}: end date is before the start date.`);

    cards.push({
      id,
      template: raw.template,
      title,
      cta,
      art: raw.art,
      theme: raw.theme,
      ...(colors ? { colors } : {}),
      action: raw.action,
      ...(url ? { url } : {}),
      rule: raw.rule,
      platform: raw.platform,
      enabled: raw.enabled !== false,
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
    });
  });

  return { cards, errors };
}

/** What phones download: switched-on cards that haven't ended yet. */
export function cardsForPhones(
  cards: HomeCard[],
  today = new Date().toISOString().slice(0, 10),
): HomeCard[] {
  return cards.filter((c) => c.enabled && !(c.endsAt && c.endsAt < today));
}

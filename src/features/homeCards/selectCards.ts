import { LIMITS, type HomeCard, type PresetKey } from './schema';
import { assignThemes } from './themes';

/** What the phone knows about the user. Never leaves the device. */
export interface CardContext {
  platform: 'android' | 'ios' | 'web';
  hasBanks: boolean;
  smsTrackingOn: boolean;
  hasCash: boolean;
  hasBudget: boolean;
  income: number;
  spent: number;
  firstName?: string;
  /** YYYY-MM-DD in local time */
  today: string;
  monthName: string;
}

export interface VisibleCard {
  card: HomeCard;
  /** Title with {{tokens}} filled in. */
  title: string;
  /** Preset to draw with after neighbour matching (null = use the card's own colours). */
  shownAs: PresetKey | null;
}

export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function ruleMatches(card: HomeCard, ctx: CardContext): boolean {
  if (card.platform !== 'all' && card.platform !== ctx.platform) return false;
  const overspent = ctx.income > 0 && ctx.spent > ctx.income;
  switch (card.rule) {
    case 'no_bank':
      return !ctx.hasBanks;
    case 'sms_off':
      return !ctx.smsTrackingOn;
    case 'no_cash':
      return !ctx.hasCash;
    case 'overspent':
      return overspent;
    case 'saved':
      return ctx.income > 0 && !overspent;
    case 'no_budget':
      return !ctx.hasBudget;
    case 'always':
      return true;
    default:
      return false;
  }
}

export function fillTitle(title: string, ctx: CardContext): string {
  const values: Record<string, string> = {
    '{{first_name}}': (ctx.firstName || '').trim().split(' ')[0] || 'there',
    '{{spent_per_rupee}}': ctx.income > 0 ? (ctx.spent / ctx.income).toFixed(2) : '0',
    '{{kept_pct}}': ctx.income > 0 ? String(Math.max(0, Math.round(((ctx.income - ctx.spent) / ctx.income) * 100))) : '0',
    '{{month}}': ctx.monthName,
  };
  return title.replace(/\{\{\w+\}\}/g, (m) => values[m] ?? '');
}

/** Cards this user should see right now, in order, at most 6. */
export function selectCards(cards: HomeCard[], ctx: CardContext): VisibleCard[] {
  const list = cards
    .filter((c) => c.enabled)
    .filter((c) => !(c.startsAt && c.startsAt > ctx.today) && !(c.endsAt && c.endsAt < ctx.today))
    .filter((c) => ruleMatches(c, ctx))
    .slice(0, LIMITS.maxVisible);
  const shown = assignThemes(list);
  return list.map((card, i) => ({ card, title: fillTitle(card.title, ctx), shownAs: shown[i] }));
}

// src/constants/categories.ts
//
// The ONE place that defines every transaction category in Regent Money:
// its label, icon, colour family and the old names it should also match.
// Use getCategory(anyKey) everywhere instead of hard-coding icons or colours.

import { MaterialCommunityIcons } from '@expo/vector-icons';

export type CategoryIconName = keyof typeof MaterialCommunityIcons.glyphMap;

export type CategoryFamily =
  | 'dining'
  | 'lifestyle'
  | 'essentials'
  | 'mobility'
  | 'bills'
  | 'care'
  | 'money'
  | 'other';

export type CategoryGroup = 'spending' | 'billsCare' | 'money' | 'other';

export interface FamilyStyle {
  /** Solid tile background */
  color: string;
  /** Glyph colour on the solid tile */
  glyph: string;
  /** Soft variant (list rows): tinted background + coloured glyph */
  softBgLight: string;
  softFgLight: string;
  softBgDark: string;
  softFgDark: string;
  /** Colour for charts, legends and progress bars */
  chart: string;
}

export const CATEGORY_FAMILIES: Record<CategoryFamily, FamilyStyle> = {
  dining: {
    color: '#E8590C', glyph: '#FFFFFF',
    softBgLight: '#FFE8D9', softFgLight: '#B23F00',
    softBgDark: 'rgba(232, 89, 12, 0.2)', softFgDark: '#FFA46B',
    chart: '#F76707',
  },
  lifestyle: {
    color: '#C2255C', glyph: '#FFFFFF',
    softBgLight: '#FCE4EE', softFgLight: '#A61E4D',
    softBgDark: 'rgba(194, 37, 92, 0.22)', softFgDark: '#F783AC',
    chart: '#D6336C',
  },
  essentials: {
    color: '#2B8A3E', glyph: '#FFFFFF',
    softBgLight: '#E1F5E6', softFgLight: '#1F6F31',
    softBgDark: 'rgba(43, 138, 62, 0.24)', softFgDark: '#8CE99A',
    chart: '#37B24D',
  },
  mobility: {
    color: '#1971C2', glyph: '#FFFFFF',
    softBgLight: '#E0EEFC', softFgLight: '#1864AB',
    softBgDark: 'rgba(25, 113, 194, 0.24)', softFgDark: '#74C0FC',
    chart: '#1C7ED6',
  },
  bills: {
    color: '#6741D9', glyph: '#FFFFFF',
    softBgLight: '#ECE6FF', softFgLight: '#5F3DC4',
    softBgDark: 'rgba(103, 65, 217, 0.26)', softFgDark: '#B197FC',
    chart: '#7048E8',
  },
  care: {
    color: '#E03131', glyph: '#FFFFFF',
    softBgLight: '#FFE3E3', softFgLight: '#C92A2A',
    softBgDark: 'rgba(224, 49, 49, 0.22)', softFgDark: '#FFA8A8',
    chart: '#F03E3E',
  },
  money: {
    color: '#0B3D2C', glyph: '#B8F36B',
    softBgLight: '#E3F2E8', softFgLight: '#0B3D2C',
    softBgDark: 'rgba(184, 243, 107, 0.14)', softFgDark: '#B8F36B',
    chart: '#16A34A',
  },
  other: {
    color: '#495057', glyph: '#FFFFFF',
    softBgLight: '#EEF0F2', softFgLight: '#343A40',
    softBgDark: 'rgba(255, 255, 255, 0.08)', softFgDark: '#CED4DA',
    chart: '#868E96',
  },
};

export interface CategoryDef {
  id: string;
  label: string;
  family: CategoryFamily;
  group: CategoryGroup;
  icon: CategoryIconName;
  /** Other names this category is stored under (old tags, bank SMS words, etc.) */
  aliases?: string[];
}

export const CATEGORIES: CategoryDef[] = [
  // Spending
  { id: 'food', label: 'Food', family: 'dining', group: 'spending', icon: 'silverware-fork-knife', aliases: ['dining', 'restaurant', 'restaurants', 'food_and_dining'] },
  { id: 'shopping', label: 'Shopping', family: 'lifestyle', group: 'spending', icon: 'shopping-outline', aliases: ['clothing', 'apparel'] },
  { id: 'entertainment', label: 'Entertainment', family: 'lifestyle', group: 'spending', icon: 'ticket-outline', aliases: ['movies', 'subscriptions', 'ott'] },
  { id: 'personal', label: 'Personal', family: 'lifestyle', group: 'spending', icon: 'account-outline', aliases: ['personal_care', 'grooming'] },
  { id: 'groceries', label: 'Groceries', family: 'essentials', group: 'spending', icon: 'cart-outline', aliases: ['grocery', 'supermarket'] },
  { id: 'rent', label: 'Rent', family: 'essentials', group: 'spending', icon: 'home-outline', aliases: ['housing', 'home'] },
  { id: 'utilities', label: 'Utilities', family: 'essentials', group: 'spending', icon: 'lightning-bolt-outline', aliases: ['electricity', 'water', 'gas'] },
  { id: 'travel', label: 'Travel', family: 'mobility', group: 'spending', icon: 'airplane', aliases: ['flight', 'flights', 'hotel'] },
  { id: 'fuel', label: 'Fuel', family: 'mobility', group: 'spending', icon: 'gas-station-outline', aliases: ['petrol', 'diesel'] },
  { id: 'transport', label: 'Transport', family: 'mobility', group: 'spending', icon: 'car-outline', aliases: ['cab', 'taxi', 'metro', 'commute'] },

  // Bills and care
  { id: 'bills', label: 'Bills', family: 'bills', group: 'billsCare', icon: 'receipt-text-outline', aliases: ['bill_payments', 'bill_payment', 'bill'] },
  { id: 'recharge', label: 'Recharge', family: 'bills', group: 'billsCare', icon: 'cellphone', aliases: ['mobile', 'dth'] },
  { id: 'services', label: 'Services', family: 'bills', group: 'billsCare', icon: 'wrench-outline', aliases: ['service', 'repairs'] },
  { id: 'medical', label: 'Medical', family: 'care', group: 'billsCare', icon: 'medical-bag', aliases: ['health', 'pharmacy', 'hospital'] },
  { id: 'education', label: 'Education', family: 'care', group: 'billsCare', icon: 'school-outline', aliases: ['fees', 'courses'] },
  { id: 'donation', label: 'Donation', family: 'care', group: 'billsCare', icon: 'hand-heart-outline', aliases: ['charity', 'gift', 'gifts'] },

  // Money
  { id: 'salary', label: 'Salary', family: 'money', group: 'money', icon: 'briefcase-outline', aliases: ['income', 'payroll'] },
  { id: 'money_received', label: 'Money in', family: 'money', group: 'money', icon: 'arrow-collapse-down', aliases: ['money', 'received', 'credit'] },
  { id: 'money_transfer', label: 'Sent', family: 'money', group: 'money', icon: 'arrow-right', aliases: ['transfer', 'sent', 'p2p'] },
  { id: 'self_transfer', label: 'Self transfer', family: 'money', group: 'money', icon: 'swap-horizontal', aliases: ['own_account'] },
  { id: 'investment', label: 'Investment', family: 'money', group: 'money', icon: 'chart-line', aliases: ['investments', 'mutual_funds', 'stocks', 'sip'] },
  { id: 'interest', label: 'Interest', family: 'money', group: 'money', icon: 'percent-outline' },
  { id: 'cashback', label: 'Cashback', family: 'money', group: 'money', icon: 'cash-refund', aliases: ['refund', 'rewards'] },
  { id: 'insurance', label: 'Insurance', family: 'money', group: 'money', icon: 'shield-check-outline' },
  { id: 'financial_services', label: 'Finance', family: 'money', group: 'money', icon: 'bank-outline', aliases: ['financial', 'loan', 'emi'] },

  // Other
  { id: 'miscellaneous', label: 'Misc', family: 'other', group: 'other', icon: 'dots-horizontal', aliases: ['misc', 'other', 'others', 'uncategorized'] },
];

export const CATEGORY_GROUPS: { id: CategoryGroup; label: string }[] = [
  { id: 'spending', label: 'Spending' },
  { id: 'billsCare', label: 'Bills and care' },
  { id: 'money', label: 'Money' },
];

const normalize = (key?: string) =>
  (key || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[\s-]+/g, '_');

// Lookup table built once: id, aliases and labels all resolve to a category
const LOOKUP = new Map<string, CategoryDef>();
CATEGORIES.forEach((c) => {
  LOOKUP.set(c.id, c);
  LOOKUP.set(normalize(c.label), c);
  c.aliases?.forEach((a) => LOOKUP.set(normalize(a), c));
});

export interface ResolvedCategory extends CategoryDef {
  style: FamilyStyle;
  /** True for user-created tags that aren't in the registry */
  isCustom: boolean;
}

const titleCase = (s: string) =>
  s.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase());

/** Resolve any stored category/tag string into a full category definition. */
export const getCategory = (key?: string): ResolvedCategory => {
  const norm = normalize(key);
  const found = LOOKUP.get(norm);
  if (found) {
    return { ...found, style: CATEGORY_FAMILIES[found.family], isCustom: false };
  }
  if (!norm) {
    const misc = LOOKUP.get('miscellaneous')!;
    return { ...misc, style: CATEGORY_FAMILIES.other, isCustom: false };
  }
  return {
    id: norm,
    label: titleCase((key || '').trim()),
    family: 'other',
    group: 'other',
    icon: 'tag-outline',
    style: CATEGORY_FAMILIES.other,
    isCustom: true,
  };
};

/** Colour to use for this category in charts and legends. */
export const getCategoryColor = (key?: string) => getCategory(key).style.chart;

/** Search helper for pickers: matches label, id and aliases. */
export const searchCategories = (query: string): CategoryDef[] => {
  const q = normalize(query);
  if (!q) return CATEGORIES;
  return CATEGORIES.filter(
    (c) =>
      c.id.includes(q) ||
      normalize(c.label).includes(q) ||
      c.aliases?.some((a) => normalize(a).includes(q))
  );
};
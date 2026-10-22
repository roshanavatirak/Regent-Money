// src/constants/bankBrand.ts
//
// Bank colours and code lookup, shared by the Banks tab, account details
// and the link-account sheet.

import bankNamesJson from '../navigation/banknames.json';

/** Deep brand tones that keep white text readable. */
const BRAND_COLORS: [RegExp, string][] = [
  [/kotak/i, '#C8102E'],
  [/hdfc/i, '#004C8F'],
  [/icici/i, '#9E1B32'],
  [/state bank|\bsbi\b/i, '#1F4E9D'],
  [/axis/i, '#861F41'],
  [/baroda|\bbob\b/i, '#B54708'],
  [/idfc/i, '#9C1D26'],
  [/yes bank/i, '#00518F'],
  [/punjab national|\bpnb\b/i, '#A6192E'],
  [/canara/i, '#005B9A'],
  [/union bank/i, '#B4141C'],
  [/indian bank/i, '#1C4E9D'],
  [/bank of india/i, '#B34A0C'],
  [/paytm/i, '#00377B'],
  [/jio/i, '#0A2885'],
];

export const BRAND_FALLBACK = '#0B3D2C';

export const bankBrandColor = (name?: string) =>
  BRAND_COLORS.find(([re]) => re.test(name || ''))?.[1] || BRAND_FALLBACK;

const NAME_TO_CODE = new Map<string, string>(
  Object.entries(bankNamesJson as Record<string, string>).map(([code, name]) => [name.toLowerCase(), code])
);

export const getBankCode = (bankName?: string) => NAME_TO_CODE.get((bankName || '').toLowerCase()) || '';

export const ALL_BANKS_SORTED: { code: string; name: string }[] = Object.entries(
  bankNamesJson as Record<string, string>
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const POPULAR_BANKS = [
  { code: 'SBIN', name: 'State Bank of India', short: 'SBI' },
  { code: 'HDFC', name: 'HDFC Bank', short: 'HDFC' },
  { code: 'ICIC', name: 'ICICI Bank', short: 'ICICI' },
  { code: 'UTIB', name: 'Axis Bank', short: 'Axis' },
  { code: 'KKBK', name: 'Kotak Mahindra Bank', short: 'Kotak' },
  { code: 'BARB', name: 'Bank of Baroda', short: 'Bank of Baroda' },
  { code: 'PUNB', name: 'Punjab National Bank', short: 'PNB' },
  { code: 'UBIN', name: 'Union Bank of India', short: 'Union Bank' },
  { code: 'IDFB', name: 'IDFC FIRST Bank', short: 'IDFC First' },
  { code: 'CNRB', name: 'Canara Bank', short: 'Canara' },
  { code: 'IDIB', name: 'Indian Bank', short: 'Indian Bank' },
  { code: 'BKID', name: 'Bank of India', short: 'Bank of India' },
];

/** "UTTARAYAN PURE VEG R" → "Uttarayan Pure Veg R"; leaves mixed-case names alone. */
export const niceName = (s?: string) => {
  const t = (s || '').trim();
  if (!t) return '';
  if (t !== t.toUpperCase()) return t;
  return t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};
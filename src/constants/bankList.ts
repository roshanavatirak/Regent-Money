// src/constants/bankList.ts
//
// One row per bank for the Add bank list. banknames.json is keyed by IFSC bank code, and many
// banks have two or three codes with the same name (often a second code ending in X), e.g.
// IPOS and IPPB are both India Post Payments Bank. Every code and every name spelling still
// resolves through codeForBankName, so accounts saved under any of them keep their logo.

import bankNamesJson from '../navigation/banknames.json';

/**
 * formerly: an older name, still matched by search and by saved accounts.
 * restricted: why new accounts can't be added; the bank still shows, greyed out, and accounts
 * people already added keep working.
 */
export type BankEntry = { code: string; name: string; formerly?: string; restricted?: string };

/** Banks the RBI has stopped from taking new customers or deposits: code → short reason. */
const RESTRICTED: Record<string, string> = {
  // RBI barred Paytm Payments Bank from new deposits and credits from 15 March 2024.
  PYTM: 'Restricted by RBI · can’t be added',
};

/** Banks renamed since banknames.json was made: code → current name. The old name stays searchable. */
const RENAMED: Record<string, string> = {
  // North East Small Finance Bank merged with slice and became slice Small Finance Bank.
  NESF: 'slice Small Finance Bank',
};

/** Codes with a bundled logo; kept here (not bankBrand.ts) so this file has no app imports. */
const LOGO_CODES = new Set([
  'AIRP', 'BARB', 'BKID', 'CNRB', 'HDFC', 'ICIC', 'IDFB', 'IDIB', 'IPOS', 'JIOP', 'KKBK', 'MAHB', 'NESF', 'PUNB', 'PYTM', 'SBIN', 'UBIN', 'UTIB', 'YESB',
]);

/** Same bank, spelled differently: case, "The", "Ltd", "Co-op" vs "Cooperative", apostrophes. */
export const bankNameKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/\b(the|ltd|limited|pvt)\b/g, '')
    .replace(/co[- ]?op(erative)?/g, 'cooperative')
    .replace(/[^a-z0-9]/g, '');

/** Which code represents a group: one with a logo, else one not ending in X, else A–Z. */
const codeRank = (code: string) => (LOGO_CODES.has(code) ? 0 : code.endsWith('X') ? 2 : 1);

/** Which spelling to show: not all capitals, then shortest (drops "THE … LTD"). */
const nameRank = (name: string) => (name === name.toUpperCase() ? 1 : 0);

export function dedupeBanks(raw: Record<string, string>): {
  banks: BankEntry[];
  /** bankNameKey(name) → chosen code, so any spelling of a bank finds it. */
  codeByKey: Map<string, string>;
} {
  const groups = new Map<string, BankEntry[]>();
  for (const [code, rawName] of Object.entries(raw)) {
    const listed = rawName.trim().replace(/\s+/g, ' ');
    if (!listed) continue;
    const renamed = RENAMED[code];
    const entry: BankEntry = renamed ? { code, name: renamed, formerly: listed } : { code, name: listed };
    const key = bankNameKey(entry.name);
    const list = groups.get(key);
    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  const banks: BankEntry[] = [];
  const codeByKey = new Map<string, string>();
  for (const list of groups.values()) {
    const code = [...list].sort((a, b) => codeRank(a.code) - codeRank(b.code) || a.code.localeCompare(b.code))[0].code;
    const name = [...list].sort((a, b) => nameRank(a.name) - nameRank(b.name) || a.name.length - b.name.length)[0].name;
    const formerly = list.find((e) => e.formerly)?.formerly;
    const restricted = list.map((e) => RESTRICTED[e.code]).find(Boolean);
    banks.push({ code, name, ...(formerly ? { formerly } : {}), ...(restricted ? { restricted } : {}) });
    codeByKey.set(bankNameKey(name), code);
    if (formerly) codeByKey.set(bankNameKey(formerly), code);
  }
  banks.sort((a, b) => a.name.localeCompare(b.name));
  return { banks, codeByKey };
}

const deduped = dedupeBanks(bankNamesJson as Record<string, string>);

/** One row per bank, A–Z. */
export const UNIQUE_BANKS: BankEntry[] = deduped.banks;

/** Bank code for a saved bank name, matching any spelling the bank has been listed under. */
export const codeForBankName = (bankName?: string): string => {
  const key = bankNameKey(bankName || '');
  return key ? deduped.codeByKey.get(key) || '' : '';
};

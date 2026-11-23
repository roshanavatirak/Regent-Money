// Recognises who a transaction was with, when the bank shows the same person differently each
// time: a new UPI ID, another bank account, "ROHIT C" one day and "Rohit Chunarkar" the next.
//
// Every person or merchant (a Contact) keeps the keys it has been seen with. A transaction is
// matched strongest key first:
//   1. the user linked it (counterpartyId)
//   2. UPI ID, account, phone: unique to one person, so they link on their own
//   3. name: only a name the user confirmed or that matched twice, and never one two people share
// Anything else stays unlinked: a wrong link is worse than none.
//
// Pure functions (no stores), so they're cheap to test. counterpartyService wires them to the app.

import type { Contact, CounterpartyKey, CounterpartyKeyType } from '../types/peer';

const STRONG_TYPES: ReadonlySet<CounterpartyKeyType> = new Set(['vpa', 'acct', 'phone']);

/** Placeholder names the parser and app use when the bank gave none. Never a key. */
const GENERIC_NAME =
  /^(?:spends|credits|merchant|direct credit|income|money received|friend|unknown|bank|upi|neft|imps|transfer(?: xx\d+)?)$/;

/** Lowercase words only: "Mr. ROHIT  C." → "rohit c". Empty for placeholders. */
export function normalizeName(raw?: string | null): string {
  if (!raw) return '';
  const s = raw
    .normalize('NFKC')
    .toLowerCase()
    .replace(/@[a-z0-9.-]+/g, ' ') // stray UPI domain
    .replace(/\b(?:mr|mrs|ms|dr|shri|smt)\b\.?/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length < 2 || GENERIC_NAME.test(s) ? '' : s;
}

/** A key's value in its stored form, or '' when it isn't usable. */
export function normalizeKeyValue(type: CounterpartyKeyType, value?: string | null): string {
  const v = (value || '').trim();
  switch (type) {
    case 'vpa':
      return /^[a-z0-9][a-z0-9._-]*@[a-z0-9.-]{2,}$/i.test(v) ? v.toLowerCase() : '';
    case 'acct': {
      const digits = v.replace(/\D/g, '');
      return digits.length >= 3 ? digits.slice(-4) : '';
    }
    case 'phone': {
      const digits = v.replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : '';
    }
    case 'name':
      return normalizeName(v);
  }
}

const keyId = (type: CounterpartyKeyType, value: string) => `${type}:${value}`;

/** "vpa:rohit.c@okaxis" / "acct:4821" (as the SMS parsers write it) → a key. */
export function parseRowKey(raw?: string | null): CounterpartyKey | null {
  const m = /^(vpa|acct):(.+)$/.exec((raw || '').trim());
  if (!m) return null;
  const type = m[1] as CounterpartyKeyType;
  const value = normalizeKeyValue(type, m[2]);
  return value ? { type, value, source: 'auto' } : null;
}

/** Keeps one of each type:value, preferring the user's, with the most hits and latest sighting. */
function dedupeKeys(keys: CounterpartyKey[]): CounterpartyKey[] {
  const byId = new Map<string, CounterpartyKey>();
  for (const k of keys) {
    const value = normalizeKeyValue(k.type, k.value);
    if (!value) continue;
    const id = keyId(k.type, value);
    const prev = byId.get(id);
    if (!prev) {
      byId.set(id, { ...k, value });
      continue;
    }
    byId.set(id, {
      type: k.type,
      value,
      source: prev.source === 'user' || k.source === 'user' ? 'user' : 'auto',
      hits: Math.max(prev.hits ?? 0, k.hits ?? 0) || undefined,
      lastSeen: Math.max(prev.lastSeen ?? 0, k.lastSeen ?? 0) || undefined,
    });
  }
  return [...byId.values()];
}

/**
 * All keys of a contact: its `keys`, plus the fields older app versions write (UPI IDs,
 * phone, the name the user gave it, and raw payee names it was created from).
 */
export function contactKeys(c: Contact): CounterpartyKey[] {
  const all: CounterpartyKey[] = [...(c.keys || [])];
  for (const v of c.upiIds || []) all.push({ type: 'vpa', value: v, source: 'auto' });
  if (c.phoneE164) all.push({ type: 'phone', value: c.phoneE164, source: 'user' });
  if (c.displayName) all.push({ type: 'name', value: c.displayName, source: 'user' });
  for (const a of c.aliases || []) {
    all.push(a.includes('@') ? { type: 'vpa', value: a, source: 'auto' } : { type: 'name', value: a, source: 'auto' });
  }
  return dedupeKeys(all);
}

/** A ledger row as the resolver needs it (transactions and income records both fit). */
export interface CounterpartyRow {
  id: string;
  counterpartyId?: string | null;
  counterpartyKey?: string | null;
  merchant?: string | null;
  source?: string | null;
}

/** Keys a row carries: its SMS key, and the name the bank printed. */
export function rowKeys(row: CounterpartyRow): CounterpartyKey[] {
  const keys: CounterpartyKey[] = [];
  const strong = parseRowKey(row.counterpartyKey);
  if (strong) keys.push(strong);
  const name = normalizeName(row.merchant ?? row.source);
  if (name) keys.push({ type: 'name', value: name, source: 'auto' });
  return keys;
}

/** Lookup tables built once per contacts list. `null` = two contacts claim it (ambiguous). */
export interface CounterpartyIndex {
  ids: ReadonlySet<string>;
  strong: ReadonlyMap<string, string | null>;
  names: ReadonlyMap<string, string | null>;
  /** The user's own account and card suffixes: never a counterparty (self-transfers). */
  own: ReadonlySet<string>;
}

const claim = (map: Map<string, string | null>, id: string, contactId: string) => {
  const prev = map.get(id);
  if (prev === undefined) map.set(id, contactId);
  else if (prev !== contactId) map.set(id, null);
};

/** A name links on its own only once trusted: confirmed by the user, or seen twice. */
const trustedName = (k: CounterpartyKey) => k.source === 'user' || (k.hits ?? 0) >= 2;

export function buildCounterpartyIndex(contacts: Contact[], ownSuffixes: string[] = []): CounterpartyIndex {
  const own = new Set(ownSuffixes.map((s) => normalizeKeyValue('acct', s)).filter(Boolean));
  const ids = new Set<string>();
  const strong = new Map<string, string | null>();
  const names = new Map<string, string | null>();
  for (const c of contacts) {
    ids.add(c.id);
    for (const k of contactKeys(c)) {
      if (k.type === 'acct' && own.has(k.value)) continue;
      if (STRONG_TYPES.has(k.type)) claim(strong, keyId(k.type, k.value), c.id);
      else if (trustedName(k)) claim(names, k.value, c.id);
    }
  }
  return { ids, strong, names, own };
}

export type ResolvedVia = 'linked' | 'vpa' | 'acct' | 'phone' | 'name';

/** Who the row was with, or null when not sure. O(1): two map lookups. */
export function resolveCounterparty(
  row: CounterpartyRow,
  index: CounterpartyIndex,
): { contactId: string; via: ResolvedVia } | null {
  if (row.counterpartyId && index.ids.has(row.counterpartyId)) {
    return { contactId: row.counterpartyId, via: 'linked' };
  }
  const strong = parseRowKey(row.counterpartyKey);
  if (strong && !(strong.type === 'acct' && index.own.has(strong.value))) {
    const id = index.strong.get(keyId(strong.type, strong.value));
    if (id) return { contactId: id, via: strong.type as ResolvedVia };
  }
  const name = normalizeName(row.merchant ?? row.source);
  if (name) {
    const id = index.names.get(name);
    if (id) return { contactId: id, via: 'name' };
  }
  return null;
}

/**
 * The contact's keys after the user links `row` to it: the row's UPI ID or account and the
 * printed name are added as the user's (a re-link bumps hits). The user's own accounts are skipped.
 */
export function learnKeysFromRow(
  contact: Contact,
  row: CounterpartyRow,
  ownSuffixes: string[] = [],
  now: number = Date.now(),
): CounterpartyKey[] {
  const own = new Set(ownSuffixes.map((s) => normalizeKeyValue('acct', s)).filter(Boolean));
  const keys = dedupeKeys(contact.keys || []);
  for (const k of rowKeys(row)) {
    if (k.type === 'acct' && own.has(k.value)) continue;
    const existing = keys.find((e) => e.type === k.type && e.value === k.value);
    if (existing) {
      existing.source = 'user';
      existing.hits = (existing.hits ?? 0) + 1;
      existing.lastSeen = now;
    } else {
      keys.push({ type: k.type, value: k.value, source: 'user', hits: 1, lastSeen: now });
    }
  }
  return keys;
}

/** Keys of two contacts being merged into one. */
export function mergeContactKeys(target: Contact, source: Contact): CounterpartyKey[] {
  return dedupeKeys([...(target.keys || []), ...contactKeys(source)]);
}

/* ------------------------------------------------------------------ */
/* Search and "looks like the same person" (phase 2 screens)          */
/* ------------------------------------------------------------------ */

/** Words too common to tie two names together. */
const STOP_WORDS = new Set([
  'and', 'the', 'for', 'pay', 'payment', 'payments', 'upi', 'bank', 'india', 'ltd', 'pvt', 'private',
  'limited', 'store', 'stores', 'shop', 'transfer', 'trf', 'neft', 'imps', 'rtgs', 'from', 'credit',
  'debit', 'money', 'received', 'online', 'services', 'service', 'kumar', 'kumari', 'devi', 'bhai', 'ben',
]);

const compact = (name: string) => name.replace(/ /g, '');

/**
 * One word of a name standing for another: the same word, an initial ("c" for "chunarkar"),
 * or cut short by the bank ("avatira" for "avatirak", at least 4 letters).
 */
const sameNamePart = (x: string, y: string): 'same' | 'typo' | false => {
  if (x === y) return 'same';
  if (x.length === 1 || y.length === 1) return x[0] === y[0] ? 'same' : false;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  if (short.length >= 4 && long.startsWith(short)) return 'same';
  // One wrong, missing or extra letter ("avatrirak" / "avatirak"), also when the bank cut it
  // short. Only for longer words: "patil" / "patel" are different families.
  if (short.length >= 6) {
    const ends = [short.length, short.length + 1].filter((n) => n <= long.length);
    if (ends.some((n) => editDistanceAtMost1(short, long.slice(0, n)))) return 'typo';
  }
  return false;
};

/** True when a and b differ by at most one inserted, removed or changed letter. */
function editDistanceAtMost1(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * How alike two normalised names are, 0–3. The FIRST name decides: in Indian names the middle
 * name (often the father's) and the surname are shared by brothers and sisters, so
 * "Roshan Gopal Avatira" and "Kartik Gopal Avatirak" are different people (0).
 *   3 same letters ignoring spaces ("rohit c" / "rohitc")
 *   2 same first name, and the rest agrees ("rohit c" / "rohit chunarkar",
 *     "kartik gopal avatira" / "kartik gopal avatirak")
 *   1 same first name, nothing more to compare ("rohit" / "rohit sharma"), or one runs into
 *     the other ("rohitchunarkar" / "rohit")
 *   0 different first names, or the same first name with a different surname
 */
export function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ca = compact(a);
  const cb = compact(b);
  if (ca === cb) return 3;

  const wa = a.split(' ').filter(Boolean);
  const wb = b.split(' ').filter(Boolean);
  if (wa[0] !== wb[0]) {
    // "rohitchunarkar" (no spaces at the bank) against "rohit chunarkar" / "rohit"
    const runsInto = (whole: string, first: string) => first.length >= 4 && whole.startsWith(first);
    return (wa.length === 1 && runsInto(ca, wb[0])) || (wb.length === 1 && runsInto(cb, wa[0])) ? 1 : 0;
  }

  // Same first name: compare the rest, ignoring words like "kumar", "bhai", "pvt"
  const rest = (w: string[]) => w.slice(1).filter((t) => !STOP_WORDS.has(t) && !/^\d+$/.test(t));
  const ra = rest(wa);
  const rb = rest(wb);
  if (ra.length === 0 || rb.length === 0) return 1;
  const [shorter, longer] = ra.length <= rb.length ? [ra, rb] : [rb, ra];
  // Every remaining word of the shorter name must stand for a word of the longer one;
  // a misspelt one makes it a loose match (suggested, not pre-ticked)
  let typo = false;
  for (const x of shorter) {
    const parts = longer.map((y) => sameNamePart(x, y));
    if (parts.includes('same')) continue;
    if (parts.includes('typo')) typo = true;
    else return 0;
  }
  return typo ? 1 : 2;
}

/** The names a contact is known by (normalised, no duplicates). */
export function contactNames(c: Contact): string[] {
  return [...new Set(contactKeys(c).filter((k) => k.type === 'name').map((k) => k.value))];
}

/**
 * Contacts matching what the user typed, best first: name starts with it, a word starts with
 * it, then any name or UPI ID containing it. Empty query: best matches for `printedName`,
 * then the rest by most recently used.
 */
export function searchContacts(contacts: Contact[], query: string, printedName = ''): Contact[] {
  const q = normalizeName(query) || query.trim().toLowerCase();
  const scored: { c: Contact; score: number }[] = [];
  if (q) {
    for (const c of contacts) {
      const display = normalizeName(c.displayName);
      const names = contactNames(c);
      const vpas = contactKeys(c).filter((k) => k.type === 'vpa').map((k) => k.value);
      let score = 0;
      if (display.startsWith(q)) score = 4;
      else if (display.split(' ').some((w) => w.startsWith(q))) score = 3;
      else if (names.some((n) => n.startsWith(q) || n.split(' ').some((w) => w.startsWith(q)))) score = 2;
      else if (names.some((n) => n.includes(q)) || vpas.some((v) => v.includes(q))) score = 1;
      if (score > 0) scored.push({ c, score });
    }
  } else {
    const printed = normalizeName(printedName);
    for (const c of contacts) {
      const best = printed ? Math.max(0, ...contactNames(c).map((n) => nameSimilarity(printed, n))) : 0;
      scored.push({ c, score: best });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || (b.c.updatedAt ?? 0) - (a.c.updatedAt ?? 0))
    .map((s) => s.c);
}

export interface SimilarRow extends CounterpartyRow {
  amount?: number | string;
  timestamp?: number | string;
}

/**
 * Rows no one is linked to yet whose printed name looks like one of the contact's names, for
 * "These look like Rohit too. Link them?". Never decides on its own: the user picks.
 * Newest first, at most `limit`.
 */
export function findSimilarRows<T extends SimilarRow>(
  contact: Contact,
  rows: T[],
  index: CounterpartyIndex,
  limit = 30,
): T[] {
  const names = contactNames(contact);
  if (names.length === 0) return [];
  const out: { row: T; score: number }[] = [];
  for (const row of rows) {
    if (resolveCounterparty(row, index)) continue; // already someone's (maybe this contact's)
    const printed = normalizeName(row.merchant ?? row.source);
    if (!printed) continue;
    const score = Math.max(...names.map((n) => nameSimilarity(printed, n)));
    if (score > 0) out.push({ row, score });
  }
  return out
    .sort((a, b) => b.score - a.score || Number(b.row.timestamp ?? 0) - Number(a.row.timestamp ?? 0))
    .slice(0, limit)
    .map((o) => o.row);
}

/** Rows the contact is recognised on by its keys alone (not linked by the user). */
export function countRecognisedRows(contactId: string, rows: CounterpartyRow[], index: CounterpartyIndex): number {
  let n = 0;
  for (const row of rows) {
    const hit = resolveCounterparty(row, index);
    if (hit && hit.contactId === contactId && hit.via !== 'linked') n++;
  }
  return n;
}

/**
 * "This payment isn't theirs": the contact's fields without the row's UPI ID / account and
 * printed name, so payments carrying them stop matching this contact. The name the user gave
 * the contact (displayName) is kept.
 */
export function forgetRowKeys(contact: Contact, row: CounterpartyRow): Pick<Contact, 'keys' | 'upiIds' | 'aliases'> {
  const drop = rowKeys(row);
  const dropped = (type: CounterpartyKey['type'], value: string) => {
    const v = normalizeKeyValue(type, value);
    return drop.some((k) => k.type === type && k.value === v);
  };
  return {
    keys: (contact.keys || []).filter((k) => !dropped(k.type, k.value)),
    upiIds: (contact.upiIds || []).filter((v) => !dropped('vpa', v)),
    aliases: (contact.aliases || []).filter((a) => !(a.includes('@') ? dropped('vpa', a) : dropped('name', a))),
  };
}

/**
 * Suggestions when nothing is typed: people whose name is close to the payment's name
 * (nameSimilarity > 0, so a different first name never shows) AND who have at least one
 * transaction (`activeIds`). Closest first, then most recently used.
 */
export function suggestContacts(contacts: Contact[], printedName: string, activeIds: ReadonlySet<string>): Contact[] {
  const printed = normalizeName(printedName);
  if (!printed) return [];
  const scored: { c: Contact; score: number }[] = [];
  for (const c of contacts) {
    if (!activeIds.has(c.id)) continue;
    const score = Math.max(0, ...contactNames(c).map((n) => nameSimilarity(printed, n)));
    if (score > 0) scored.push({ c, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || (b.c.updatedAt ?? 0) - (a.c.updatedAt ?? 0))
    .map((s) => s.c);
}

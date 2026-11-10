// src/services/bankMatching.ts
//
// Decides whether an account found in an SMS scan is one the user has already linked.
// No imports, so the setup screen and the Node tests share the exact same code.

/** Normalises the backend's comma-separated card list. */
export const parseDebitCardSuffixes = (raw: unknown): string[] =>
  (Array.isArray(raw) ? raw : String(raw ?? '').split(','))
    .map((s) => String(s).trim())
    .filter((s) => /^\d{4}$/.test(s));

type ScannedAccount = { bankName?: string; accountNumberSuffix?: string; smsSenderId?: string };

const bankNameOf = (p: any): string => String(p?.bankName ?? p?.bank_name ?? '').trim().toLowerCase();
const suffixOf = (p: any): string => String(p?.accountNumberSuffix ?? p?.account_number_suffix ?? '').trim();
const senderCore = (s: string): string => s.toUpperCase().replace(/^[A-Z]{2}-/, '').replace(/[^A-Z0-9]/g, '');

/** The scan's sender ("KOTAKB") is one of the profile's SMS sender tags ("KOTAKB,KOTAKM"). */
function senderMatches(scanned: ScannedAccount, profile: any): boolean {
  const sender = senderCore(String(scanned.smsSenderId ?? ''));
  if (sender.length < 4) return false;
  const tags = String(profile?.smsSenderId ?? profile?.sms_sender_id ?? '')
    .split(/[,\s]+/)
    .map(senderCore)
    .filter((t) => t.length >= 4);
  return tags.some((t) => t === sender || sender.includes(t) || t.includes(sender));
}

/**
 * Same bank, by name ("Kotak" matches "Kotak Mahindra Bank") or, for an account the user
 * renamed ("Kotak Salary"), by its SMS sender tags. An empty name never matches by name.
 */
export function isSameBank(scanned: ScannedAccount, profile: any): boolean {
  const a = bankNameOf(scanned);
  const b = bankNameOf(profile);
  if (a && b && (a === b || a.includes(b) || b.includes(a))) return true;
  return senderMatches(scanned, profile);
}

/**
 * True when the scanned account is this linked profile: same bank, and the number is either
 * the profile's account number or one of its linked debit cards. A different number at the same
 * bank is a different account, even when the user has only one account there.
 */
export function isLinkedAccount(scanned: ScannedAccount, profile: any): boolean {
  if (!isSameBank(scanned, profile)) return false;
  const suffix = String(scanned.accountNumberSuffix ?? '').trim();
  if (!suffix) return false;
  if (suffix === suffixOf(profile)) return true;
  return parseDebitCardSuffixes(profile?.debitCardSuffixes ?? profile?.debit_card_suffixes).includes(suffix);
}

/** The linked profile a scanned account belongs to, if any. */
export function findLinkedProfile<T>(scanned: ScannedAccount, profiles: T[]): T | undefined {
  return profiles.find((p) => isLinkedAccount(scanned, p));
}

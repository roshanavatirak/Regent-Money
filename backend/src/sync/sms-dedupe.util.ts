/**
 * Decides what to do with a bank SMS against the ledger rows already stored for a user.
 *
 * One SMS is one money movement. Seeing the same SMS again (inbox re-scan, reinstall,
 * WorkManager retry) must be a silent no-op. A duplicate review is only for a *different*
 * SMS that looks like the same payment: same amount, same merchant, minutes apart.
 */

/** A legacy row and the SMS that created it are matched within this window (no stored identity). */
export const SAME_SMS_WINDOW_MS = 5 * 60_000;
/** Two distinct SMS this close together with the same amount and merchant may be a double payment. */
export const DUPLICATE_WINDOW_MS = 2 * 60_000;

export interface SmsCandidate {
  amount: number;
  timestamp: number;
  merchant?: string | null;
  referenceId?: string | null;
  /** `ref_<referenceId>` when the SMS has a reference, otherwise the text hash. */
  smsId?: string | null;
  /** `sms_<hash>` of the message text alone. */
  contentId?: string | null;
  bankProfileId?: string | null;
}

export interface LedgerRow {
  id: string;
  amount: number | null;
  timestamp: number;
  smsId?: string | null;
  contentId?: string | null;
  /** Merchant for debits, source for credits. */
  party?: string | null;
  bankProfileId?: string | null;
  isDeleted: boolean;
}

export type SmsMatch =
  | { kind: 'same'; row: LedgerRow }
  | { kind: 'legacy'; row: LedgerRow }
  | { kind: 'duplicate'; row: LedgerRow }
  | { kind: 'new' };

const normalize = (s?: string | null): string => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const sameAmount = (rowAmount: number | null, amount: number): boolean =>
  rowAmount == null || isNaN(Number(rowAmount)) || Math.abs(Number(rowAmount) - amount) < 0.01;

const strictlySameAmount = (rowAmount: number | null, amount: number): boolean =>
  rowAmount != null && !isNaN(Number(rowAmount)) && Math.abs(Number(rowAmount) - amount) < 0.01;

const partyCompatible = (a?: string | null, b?: string | null): boolean => {
  const na = normalize(a);
  const nb = normalize(b);
  return !na || !nb || na === nb;
};

const bankCompatible = (a?: string | null, b?: string | null): boolean => !a || !b || a === b;

const cleanRef = (ref?: string | null): string | undefined => {
  const r = (ref || '').trim();
  return r ? r : undefined;
};

/** Every key a review notification for this SMS may be stored under. */
export function smsReviewKeys(item: SmsCandidate): string[] {
  const ref = cleanRef(item.referenceId);
  return Array.from(
    new Set([item.smsId, item.contentId, ref ? `ref_${ref}` : undefined].filter((k): k is string => !!k)),
  );
}

/**
 * Re-reading one SMS gives exactly the same bank sent time (live and inbox both use it, and it has
 * one-second precision). Two SMS with identical text sent a second or more apart are two payments.
 */
export const SAME_SMS_TIME_TOLERANCE_MS = 1000;

/** True when the stored identity says this row was created from exactly this SMS. */
export function isSameSms(row: LedgerRow, item: SmsCandidate): boolean {
  const ref = cleanRef(item.referenceId);
  if (ref && (row.smsId === `ref_${ref}` || row.smsId === ref)) return true;
  if (!sameAmount(row.amount, item.amount)) return false;
  const textMatches =
    (!!item.contentId && (row.contentId === item.contentId || row.smsId === item.contentId)) ||
    (!!item.smsId && row.smsId === item.smsId);
  if (!textMatches) return false;
  // Rows saved with a content_id store the exact sent time, so identical text at another second is
  // a different SMS. Older rows may hold a slightly different time: for them text alone decides.
  if (row.contentId) return Math.abs(Number(row.timestamp) - item.timestamp) < SAME_SMS_TIME_TOLERANCE_MS;
  return true;
}

/**
 * True when the row carries an identity that proves it came from a different SMS.
 * Only meaningful after `isSameSms` returned false.
 */
export function hasConflictingIdentity(row: LedgerRow, item: SmsCandidate): boolean {
  if (row.contentId) return true; // text hash known and it differs
  if (row.smsId && row.smsId.startsWith('sms_')) return true; // stored id is itself a text hash
  if (row.smsId && row.smsId.startsWith('ref_') && cleanRef(item.referenceId)) return true; // two different refs
  return false;
}

/**
 * Classifies one SMS. `claimed` holds rows already matched to another SMS in this batch,
 * so two SMS can never both resolve to the same legacy row.
 */
export function classifySms(rows: LedgerRow[], item: SmsCandidate, claimed: Set<string> = new Set()): SmsMatch {
  // 1. Exactly this SMS is already stored (live, earlier scan, confirmed or dismissed review).
  const same = rows.find((row) => isSameSms(row, item));
  if (same) return { kind: 'same', row: same };

  // 2. A row stored before SMS identities were saved (income, old confirms, parser drift).
  //    It is the same money movement when amount, merchant, bank and time all line up.
  const legacy = rows
    .filter(
      (row) =>
        !claimed.has(row.id) &&
        !hasConflictingIdentity(row, item) &&
        strictlySameAmount(row.amount, item.amount) &&
        partyCompatible(row.party, item.merchant) &&
        bankCompatible(row.bankProfileId, item.bankProfileId) &&
        Math.abs(Number(row.timestamp) - item.timestamp) <= SAME_SMS_WINDOW_MS,
    )
    .sort((a, b) => Math.abs(Number(a.timestamp) - item.timestamp) - Math.abs(Number(b.timestamp) - item.timestamp))[0];
  if (legacy) return { kind: 'legacy', row: legacy };

  // 3. A different SMS for the same amount and merchant within minutes: a possible double payment.
  const duplicate = rows.find(
    (row) =>
      !row.isDeleted &&
      strictlySameAmount(row.amount, item.amount) &&
      partyCompatible(row.party, item.merchant) &&
      bankCompatible(row.bankProfileId, item.bankProfileId) &&
      Math.abs(Number(row.timestamp) - item.timestamp) <= DUPLICATE_WINDOW_MS,
  );
  if (duplicate) return { kind: 'duplicate', row: duplicate };

  return { kind: 'new' };
}

/** 32-bit text hash, identical to the phone's (src/services/smsCatchupService.ts, SmsParser.kt). */
export function smsContentId(body: string): string {
  const clean = (body || '').replace(/\s+/g, ' ').trim();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash << 5) - hash + clean.charCodeAt(i);
    hash |= 0;
  }
  return `sms_${Math.abs(hash)}`;
}

/** True for ids that identify an SMS (as opposed to statement rows or old confirm markers). */
export const isSmsIdentity = (id?: string | null): id is string =>
  !!id && (id.startsWith('ref_') || id.startsWith('sms_'));

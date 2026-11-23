// "Is this Rohit paying you back?" Payments recognised as being with someone you have an open
// loan with, offered as repayments. Pure (no stores) so it can be tested; repaymentService
// wires it to the app and records the answer.
//
// A payment is offered when:
//   - it's money in from someone who owes you, or money out to someone you owe
//   - it isn't in Borrow & Lend already, isn't tagged as a loan, and wasn't dismissed
//   - it's on or after their oldest open loan, and within the last 90 days
//   - together with the earlier ones offered, it doesn't come to more than is owed

import type { Contact, PeerEntry, StoredAllocation, Paise, DateString } from '../types/peer';
import { toPaise } from '../types/peer';
import { computeContactSummary } from './peerLedgerSelectors';
import { resolveCounterparty, type CounterpartyIndex, type CounterpartyRow } from './counterpartyResolver';

export const SUGGESTION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export interface RepaymentRow extends CounterpartyRow {
  ledger: 'transaction' | 'income';
  amount?: number | string;
  timestamp?: number | string;
  category?: string;
}

export interface RepaymentSuggestion<T extends RepaymentRow = RepaymentRow> {
  row: T;
  contactId: string;
  /** Money in from someone who owes you, or money out to someone you owe. */
  kind: 'REPAY_RECEIVED' | 'REPAY_PAID';
  tag: 'peer_lent_repaid' | 'peer_borrow_repaid';
  amount: Paise;
  /** What they owed you (or you owed them) before this payment. */
  outstanding: Paise;
  date: DateString;
}

/** Local YYYY-MM-DD (toISOString is UTC and shifts the date before 5:30 am in India). */
export const localDate = (ts: number): DateString => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function findRepaymentSuggestions<T extends RepaymentRow>(input: {
  rows: T[];
  contacts: Contact[];
  entries: PeerEntry[];
  storedAllocations?: StoredAllocation[];
  index: CounterpartyIndex;
  today: DateString;
  now?: number;
  dismissed?: ReadonlySet<string>;
  /** Only this person's (the person page). */
  contactId?: string;
  limit?: number;
}): RepaymentSuggestion<T>[] {
  const { rows, contacts, entries, index, today } = input;
  const now = input.now ?? Date.now();
  const dismissed = input.dismissed ?? new Set<string>();
  const inLedger = new Set(
    entries.filter((e) => !e.deletedAt && e.source.type === 'txn').map((e) => (e.source as { txnId: string }).txnId),
  );

  // Who has an open loan, and how much is left, per direction
  const open = new Map<string, { lent: Paise; borrowed: Paise; since?: DateString }>();
  for (const c of contacts) {
    if (input.contactId && c.id !== input.contactId) continue;
    const s = computeContactSummary(c, entries, input.storedAllocations ?? [], today);
    if (s.totalLentPending > 0 || s.totalBorrowedPending > 0) {
      open.set(c.id, { lent: s.totalLentPending, borrowed: s.totalBorrowedPending, since: s.oldestOpenLoanDate });
    }
  }
  if (open.size === 0) return [];

  // Candidates, oldest first, so earlier payments use up what's owed before later ones
  const candidates: { row: T; contactId: string; ts: number; amount: Paise }[] = [];
  for (const row of rows) {
    if (inLedger.has(row.id) || dismissed.has(row.id)) continue;
    if (String(row.category || '').startsWith('peer_')) continue;
    const ts = Number(row.timestamp) || 0;
    if (!ts || now - ts > SUGGESTION_WINDOW_MS) continue;
    const amount = toPaise(Math.abs(Number(row.amount) || 0));
    if (amount <= 0) continue;
    const hit = resolveCounterparty(row, index);
    if (!hit || !open.has(hit.contactId)) continue;
    candidates.push({ row, contactId: hit.contactId, ts, amount });
  }
  candidates.sort((a, b) => a.ts - b.ts);

  const out: RepaymentSuggestion<T>[] = [];
  for (const c of candidates) {
    const left = open.get(c.contactId)!;
    const date = localDate(c.ts);
    if (left.since && date < left.since) continue;
    if (c.row.ledger === 'income' && left.lent > 0 && c.amount <= left.lent) {
      out.push({ row: c.row, contactId: c.contactId, kind: 'REPAY_RECEIVED', tag: 'peer_lent_repaid', amount: c.amount, outstanding: left.lent, date });
      left.lent -= c.amount;
    } else if (c.row.ledger === 'transaction' && left.borrowed > 0 && c.amount <= left.borrowed) {
      out.push({ row: c.row, contactId: c.contactId, kind: 'REPAY_PAID', tag: 'peer_borrow_repaid', amount: c.amount, outstanding: left.borrowed, date });
      left.borrowed -= c.amount;
    }
  }
  // Newest first on screen
  return out.reverse().slice(0, input.limit ?? 10);
}

/* ------------------------------------------------------------------ */
/* Money with one person, across every name the bank used              */
/* ------------------------------------------------------------------ */

export interface CounterpartyTotals<T extends RepaymentRow = RepaymentRow> {
  received: number;
  paid: number;
  count: number;
  /** Newest first. */
  recent: T[];
}

export function counterpartyTotals<T extends RepaymentRow>(
  contactId: string,
  rows: T[],
  index: CounterpartyIndex,
  recentLimit = 5,
): CounterpartyTotals<T> {
  let received = 0;
  let paid = 0;
  const mine: T[] = [];
  for (const row of rows) {
    const hit = resolveCounterparty(row, index);
    if (!hit || hit.contactId !== contactId) continue;
    const amount = Math.abs(Number(row.amount) || 0);
    if (row.ledger === 'income') received += amount;
    else paid += amount;
    mine.push(row);
  }
  mine.sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0));
  return {
    received: Math.round(received * 100) / 100,
    paid: Math.round(paid * 100) / 100,
    count: mine.length,
    recent: mine.slice(0, recentLimit),
  };
}

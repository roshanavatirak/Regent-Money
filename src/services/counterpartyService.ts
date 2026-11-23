// Connects counterpartyResolver to the app: the contacts, the user's own accounts, the
// transaction/income stores, and the outbox that carries a link to the server.
//
//   useCounterpartyIndex()          lookup tables, rebuilt only when contacts or accounts change
//   resolveRowCounterparty(row)     who a transaction or income row was with (or null)
//   linkRowToCounterparty(...)      the user says "this was Rohit": learn the keys, save the link
//   unlinkRowCounterparty(...)      undo

import { useMemo } from 'react';
import { outbox } from '../db/outbox';
import { useAuthStore, useBankStore, useIncomeStore, useTransactionStore } from '../store';
import { usePeerStore } from '../store/peerStore';
import { parseDebitCardSuffixes } from './bankMatching';
import {
  buildCounterpartyIndex,
  learnKeysFromRow,
  forgetRowKeys,
  resolveCounterparty,
  contactNames,
  nameSimilarity,
  normalizeName,
  type CounterpartyIndex,
  type CounterpartyRow,
  type SimilarRow,
} from './counterpartyResolver';
import type { Contact } from '../types/peer';

export type Ledger = 'transaction' | 'income';

/** The user's own account and debit card suffixes: money between them is not a counterparty. */
export function getOwnAccountSuffixes(): string[] {
  const profiles: any[] = useBankStore.getState().bankProfiles || [];
  const out: string[] = [];
  for (const p of profiles) {
    const suffix = String(p.accountNumberSuffix ?? p.account_number_suffix ?? '').trim();
    if (suffix) out.push(suffix);
    out.push(...parseDebitCardSuffixes(p.debitCardSuffixes ?? p.debit_card_suffixes));
  }
  return out;
}

// One index, rebuilt only when the contacts list or the user's accounts change
let cached: { contacts: Contact[]; own: string; index: CounterpartyIndex } | null = null;

export function getCounterpartyIndex(): CounterpartyIndex {
  const contacts = usePeerStore.getState().contacts;
  const ownList = getOwnAccountSuffixes();
  const own = ownList.join(',');
  if (!cached || cached.contacts !== contacts || cached.own !== own) {
    cached = { contacts, own, index: buildCounterpartyIndex(contacts, ownList) };
  }
  return cached.index;
}

/** For screens: re-renders when contacts or accounts change. */
export function useCounterpartyIndex(): CounterpartyIndex {
  const contacts = usePeerStore((s) => s.contacts);
  const bankProfiles = useBankStore((s: any) => s.bankProfiles);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getCounterpartyIndex(), [contacts, bankProfiles]);
}

/** The contact a transaction or income row was with, or null when not sure. */
export function resolveRowCounterparty(row: CounterpartyRow, index: CounterpartyIndex = getCounterpartyIndex()): Contact | null {
  const hit = resolveCounterparty(row, index);
  if (!hit) return null;
  return usePeerStore.getState().contacts.find((c) => c.id === hit.contactId) ?? null;
}

const randomPart = () => Math.random().toString(36).substring(2, 9);

/** Saves the row's counterpartyId on the phone now and on the server through the outbox. */
function saveRowLink(row: CounterpartyRow, ledger: Ledger, counterpartyId: string | null) {
  const updatedAt = Date.now();
  const fields = { counterpartyId: counterpartyId ?? undefined, updatedAt };
  if (ledger === 'transaction') useTransactionStore.getState().updateTransactionState(row.id, fields);
  else useIncomeStore.getState().updateIncomeRecordState(row.id, fields);

  const user = useAuthStore.getState().user;
  if (!user) return; // saved on the phone; signed out, so nothing to send
  outbox.enqueue({
    idemKey: `op_${updatedAt}_${randomPart()}`,
    userId: user.id,
    entity: ledger,
    op: 'upsert',
    entityId: row.id,
    payload: { counterpartyId, updatedAt },
  });
}

/**
 * The user says this row was with `contactId`. Their UPI ID / account and the printed name
 * become the contact's keys, so their next payment is recognised under any of them.
 */
export function linkRowToCounterparty(row: CounterpartyRow, ledger: Ledger, contactId: string): void {
  linkRowsToCounterparty([{ row, ledger }], contactId);
}

/** Several rows at once ("Link these 3"): one contact update, one outbox op per row. */
export function linkRowsToCounterparty(items: { row: CounterpartyRow; ledger: Ledger }[], contactId: string): void {
  if (items.length === 0) return;
  const peer = usePeerStore.getState();
  const contact = peer.contacts.find((c) => c.id === contactId);
  if (!contact) throw new Error('That person is no longer in your list.');
  const own = getOwnAccountSuffixes();
  let learning: Contact = contact;
  for (const { row } of items) learning = { ...learning, keys: learnKeysFromRow(learning, row, own) };
  peer.updateContact(contactId, { keys: learning.keys });
  for (const { row, ledger } of items) saveRowLink(row, ledger, contactId);
  moveLoanEntries(items.map((i) => i.row.id), contactId);
}

/**
 * The payments' Borrow & Lend entries follow them to the person they're now linked to.
 * A contact this leaves with no loans, whose name is a spelling of the new person's
 * ("Kartik Gopal Avatrirak" / "Kartik Gopal Avatirak"), was a duplicate: it's merged in, so
 * its names and UPI IDs keep pointing at the right person and it leaves Borrow & Lend.
 */
function moveLoanEntries(rowIds: string[], contactId: string): void {
  const ids = new Set(rowIds);
  const peer = usePeerStore.getState();
  const moved = peer.entries.filter(
    (e) => !e.deletedAt && e.source.type === 'txn' && ids.has(e.source.txnId) && e.contactId !== contactId,
  );
  if (moved.length === 0) return;
  for (const e of moved) peer.updatePeerEntry(e.id, { contactId });

  const target = usePeerStore.getState().contacts.find((c) => c.id === contactId);
  if (!target) return;
  const targetNames = contactNames(target);
  for (const oldId of new Set(moved.map((e) => e.contactId))) {
    const state = usePeerStore.getState();
    if (state.entries.some((e) => !e.deletedAt && e.contactId === oldId)) continue; // still has loans
    const old = state.contacts.find((c) => c.id === oldId);
    if (!old) continue;
    const sameName = targetNames.some((n) => nameSimilarity(normalizeName(old.displayName), n) > 0);
    if (sameName) state.mergeContacts(contactId, oldId);
  }
}

/**
 * A new person or shop, made from the edit screen. `kind` keeps it out of Borrow & Lend
 * until there's a loan with them (see BorrowLendScreen).
 */
export function createCounterparty(displayName: string, kind: 'person' | 'merchant'): Contact {
  const name = displayName.trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!name) throw new Error('Type a name first.');
  return usePeerStore.getState().addContact({ displayName: name, aliases: [], upiIds: [], kind, keys: [] });
}

/** Every transaction and income row on the phone, for "these look like Rohit too". */
export function allLedgerRows(): (SimilarRow & { ledger: Ledger; [field: string]: any })[] {
  const txs = (useTransactionStore.getState().transactions || []).map((t: any) => ({ ...t, ledger: 'transaction' as const }));
  const inc = (useIncomeStore.getState().incomeRecords || []).map((r: any) => ({ ...r, ledger: 'income' as const }));
  return [...txs, ...inc];
}

/**
 * "Not Kartik": removes the user's link, and makes the contact forget this payment's UPI ID,
 * account and printed name, so it (and payments like it) stop being matched to them.
 */
export function unlinkRowCounterparty(row: CounterpartyRow, ledger: Ledger, contactId?: string): void {
  if (contactId) {
    const peer = usePeerStore.getState();
    const contact = peer.contacts.find((c) => c.id === contactId);
    if (contact) peer.updateContact(contactId, forgetRowKeys(contact, row));
  }
  if (row.counterpartyId) saveRowLink(row, ledger, null);
}

// id → contact, rebuilt only when the contacts list changes
let byIdCache: { contacts: Contact[]; map: Map<string, Contact> } | null = null;
const contactById = (): Map<string, Contact> => {
  const contacts = usePeerStore.getState().contacts;
  if (!byIdCache || byIdCache.contacts !== contacts) {
    byIdCache = { contacts, map: new Map(contacts.map((c) => [c.id, c])) };
  }
  return byIdCache.map;
};

/**
 * The name to show for a payment in lists: the person or shop it belongs to, or undefined
 * (show the bank's name). Two map lookups, fine per row.
 */
export function counterpartyName(row: CounterpartyRow | null | undefined): string | undefined {
  if (!row || !row.id) return undefined;
  const hit = resolveCounterparty(row, getCounterpartyIndex());
  return hit ? contactById().get(hit.contactId)?.displayName : undefined;
}

/** People and shops with at least one transaction: a bank/cash payment matched to them, or a Borrow & Lend entry. */
export function activeContactIds(): Set<string> {
  const ids = new Set<string>();
  const index = getCounterpartyIndex();
  for (const row of allLedgerRows()) {
    const hit = resolveCounterparty(row, index);
    if (hit) ids.add(hit.contactId);
  }
  for (const e of usePeerStore.getState().entries) if (!e.deletedAt) ids.add(e.contactId);
  return ids;
}

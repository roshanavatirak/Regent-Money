// src/store/peerStore.ts
//
// Zustand store for Regent Money Borrow & Lend tracking.
// Persists contacts, entries, manual allocations, and pending settlements in MMKV.

import { create } from 'zustand';
import { mmkvStorage } from '../db/mmkv';
import { shouldRemoveTxnEntry } from '../utils/peerReconcile';
import { mergeContactKeys, buildCounterpartyIndex, resolveCounterparty } from '../services/counterpartyResolver';
import type { PeerLedgerDoc, Tombstone } from '../utils/peerLedgerMerge';
import {
  Contact,
  PeerEntry,
  StoredAllocation,
  PendingSettlement,
  EntryKind,
  Paise,
  DateString,
  toPaise,
} from '../types/peer';

function loadCached<T>(key: string, fallback: T): T {
  try {
    const data = mmkvStorage.getObject<T>(key);
    return data !== null && data !== undefined ? data : fallback;
  } catch {
    return fallback;
  }
}

export interface PeerState {
  contacts: Contact[];
  entries: PeerEntry[];
  storedAllocations: StoredAllocation[];
  pendingSettlements: PendingSettlement[];

  // Contact actions
  addContact: (contact: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => Contact;
  updateContact: (id: string, updates: Partial<Contact>) => void;
  deleteContact: (id: string) => void;
  findOrCreateContact: (nameOrVpa: string) => Contact;
  mergeContacts: (targetContactId: string, sourceContactId: string) => void;

  // Entry actions
  addPeerEntry: (entry: Omit<PeerEntry, 'id' | 'createdAt' | 'updatedAt'>) => PeerEntry;
  updatePeerEntry: (id: string, updates: Partial<PeerEntry>) => void;
  softDeletePeerEntry: (id: string) => void;
  restorePeerEntry: (id: string) => void;

  // Sync with bank transaction tag
  syncWithTransactionTag: (
    txnId: string,
    tag: string,
    amountRupees: number,
    dateString: DateString,
    merchantOrPayee?: string,
    /**
     * keepContact: background reconcile, don't move the entry to another person.
     * dueDate: when the money is expected back ('YYYY-MM-DD'); null clears it; omitted leaves it.
     * contactId: the person this payment is already known to be with (linked or recognised by
     * UPI ID). Used instead of matching the printed name, so a new spelling at the bank doesn't
     * create a second person.
     */
    opts?: { keepContact?: boolean; dueDate?: DateString | null; contactId?: string }
  ) => PeerEntry | null;

  /** Mark a loan as not expected back (or expected again): stays listed, not counted as owed. */
  setNotExpectedBack: (entryId: string, notExpected: boolean) => void;

  // Stored manual allocation actions
  addStoredAllocation: (allocation: Omit<StoredAllocation, 'id' | 'createdAt'>) => void;
  removeStoredAllocation: (id: string) => void;

  // Pending settlements (UPI intents)
  addPendingSettlement: (settlement: Omit<PendingSettlement, 'id' | 'createdAt'>) => void;
  matchPendingSettlement: (id: string) => void;

  /** Deleted contacts and allocations, so the delete also reaches the server and other phones. */
  tombstones: Tombstone[];
  addTombstone: (kind: Tombstone['kind'], id: string) => void;
  /** The syncable ledger (pending UPI settlements stay on this phone). */
  getLedgerDoc: () => PeerLedgerDoc;
  /** Replace the ledger with a merged copy from the server. */
  applyLedgerDoc: (doc: PeerLedgerDoc) => void;

  // Rehydration & transaction reconciliation
  rehydrate: () => void;
  reconcileWithTransactions: (
    txs: Array<{ id: string; category?: string; amount?: number | string; timestamp?: number | string; merchant?: string; note?: string }>
  ) => void;
}

const cleanPayeeName = (raw: string): string => {
  if (!raw) return 'Unknown';
  let clean = raw.trim();
  // Strip common UPI suffixes
  clean = clean.replace(/@(paytm|okaxis|okhdfcbank|oksbi|okicici|ybl|ibl|upi)/gi, '');
  clean = clean.replace(/\/(paytm|upi|gpay|phonepe)/gi, '');
  clean = clean.replace(/\s+/g, ' ').trim();
  return clean || 'Unknown';
};

const tagToKind = (tag: string): EntryKind | null => {
  const norm = (tag || '').toLowerCase().trim();
  switch (norm) {
    case 'peer_lent':
    case 'peer_lend':
    case 'lent':
    case 'lent to friend':
    case 'udhaar':
    case 'udhaar_diya':
    case 'gave_to_friend':
      return 'LEND';
    case 'peer_borrow_repaid':
    case 'repaid friend':
    case 'repaid_friend':
    case 'borrow_repaid':
    case 'borrow_back':
    case 'repaid_borrowed':
      return 'REPAY_PAID';
    case 'peer_lent_repaid':
    case 'friend repaid':
    case 'lent_repaid':
    case 'lent_back':
    case 'received_back':
    case 'udhaar_wapas':
      return 'REPAY_RECEIVED';
    case 'peer_borrowed':
    case 'peer_borrow':
    case 'borrow':
    case 'borrowed':
    case 'udhaar_liya':
    case 'took_from_friend':
      return 'BORROW';
    default:
      return null;
  }
};

export const usePeerStore = create<PeerState>((set, get) => ({
  contacts: loadCached<Contact[]>('cache_peer_contacts', []),
  entries: loadCached<PeerEntry[]>('cache_peer_entries', []),
  storedAllocations: loadCached<StoredAllocation[]>('cache_peer_allocations', []),
  pendingSettlements: loadCached<PendingSettlement[]>('cache_peer_pending_settlements', []),
  tombstones: loadCached<Tombstone[]>('cache_peer_tombstones', []),

  addContact: (contactData) => {
    const now = Date.now();
    const newContact: Contact = {
      ...contactData,
      id: `contact_${now}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [...get().contacts, newContact];
    mmkvStorage.setObject('cache_peer_contacts', updated);
    set({ contacts: updated });
    return newContact;
  },

  updateContact: (id, updates) => {
    const now = Date.now();
    const updated = get().contacts.map((c) =>
      c.id === id ? { ...c, ...updates, updatedAt: now } : c
    );
    mmkvStorage.setObject('cache_peer_contacts', updated);
    set({ contacts: updated });
  },

  deleteContact: (id) => {
    const now = Date.now();
    const updatedContacts = get().contacts.filter((c) => c.id !== id);
    // Soft delete all entries linked to this contact (updatedAt so the delete wins a sync)
    const updatedEntries = get().entries.map((e) =>
      e.contactId === id ? { ...e, deletedAt: now, updatedAt: now } : e
    );
    mmkvStorage.setObject('cache_peer_contacts', updatedContacts);
    mmkvStorage.setObject('cache_peer_entries', updatedEntries);
    set({ contacts: updatedContacts, entries: updatedEntries });
    get().addTombstone('contact', id);
  },

  findOrCreateContact: (nameOrVpa: string) => {
    const raw = (nameOrVpa || '').trim();
    if (!raw) {
      return get().findOrCreateContact('Friend');
    }
    const isVpa = raw.includes('@');
    const cleaned = cleanPayeeName(raw);
    const lowerRaw = raw.toLowerCase();
    const lowerClean = cleaned.toLowerCase();

    // Check exact VPA or alias or display name match
    const existing = get().contacts.find((c) => {
      if (isVpa && c.upiIds.some((v) => v.toLowerCase() === lowerRaw)) return true;
      if (c.displayName.toLowerCase() === lowerClean) return true;
      return c.aliases.some((a) => a.toLowerCase() === lowerRaw || a.toLowerCase() === lowerClean);
    });

    if (existing) {
      // Add VPA to existing contact if not already recorded
      if (isVpa && !existing.upiIds.some((v) => v.toLowerCase() === lowerRaw)) {
        get().updateContact(existing.id, {
          upiIds: [...existing.upiIds, raw],
        });
      }
      return existing;
    }

    // Create new contact
    return get().addContact({
      displayName: cleaned,
      aliases: [raw],
      upiIds: isVpa ? [raw] : [],
    });
  },

  mergeContacts: (targetContactId, sourceContactId) => {
    const target = get().contacts.find((c) => c.id === targetContactId);
    const source = get().contacts.find((c) => c.id === sourceContactId);
    if (!target || !source) return;

    const mergedAliases = Array.from(new Set([...target.aliases, ...source.aliases, source.displayName]));
    const mergedUpis = Array.from(new Set([...target.upiIds, ...source.upiIds]));
    // Every way the bank showed either of them now points at the one that stays. Transactions
    // linked to the removed contact fall back to these keys, so they follow it without a rewrite.
    const mergedKeys = mergeContactKeys(target, source);

    const now = Date.now();
    const updatedContacts = get().contacts
      .filter((c) => c.id !== sourceContactId)
      .map((c) =>
        c.id === targetContactId
          ? { ...c, aliases: mergedAliases, upiIds: mergedUpis, keys: mergedKeys, updatedAt: now }
          : c
      );

    // Reassign all source entries to target
    const updatedEntries = get().entries.map((e) =>
      e.contactId === sourceContactId ? { ...e, contactId: targetContactId, updatedAt: now } : e
    );

    mmkvStorage.setObject('cache_peer_contacts', updatedContacts);
    mmkvStorage.setObject('cache_peer_entries', updatedEntries);
    set({ contacts: updatedContacts, entries: updatedEntries });
    get().addTombstone('contact', sourceContactId);
  },

  addPeerEntry: (entryData) => {
    const now = Date.now();
    const newEntry: PeerEntry = {
      ...entryData,
      id: `entry_${now}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };
    const updated = [newEntry, ...get().entries];
    mmkvStorage.setObject('cache_peer_entries', updated);
    set({ entries: updated });
    return newEntry;
  },

  updatePeerEntry: (id, updates) => {
    const now = Date.now();
    const updated = get().entries.map((e) =>
      e.id === id ? { ...e, ...updates, updatedAt: now } : e
    );
    mmkvStorage.setObject('cache_peer_entries', updated);
    set({ entries: updated });
  },

  softDeletePeerEntry: (id) => {
    const now = Date.now();
    const updated = get().entries.map((e) =>
      e.id === id ? { ...e, deletedAt: now, updatedAt: now } : e
    );
    mmkvStorage.setObject('cache_peer_entries', updated);
    set({ entries: updated });
  },

  restorePeerEntry: (id) => {
    const updated = get().entries.map((e) =>
      e.id === id ? { ...e, deletedAt: undefined, updatedAt: Date.now() } : e
    );
    mmkvStorage.setObject('cache_peer_entries', updated);
    set({ entries: updated });
  },

  syncWithTransactionTag: (txnId, tag, amountRupees, dateString, merchantOrPayee, opts) => {
    const kind = tagToKind(tag);
    const linked = get().entries.filter((e) => e.source.type === 'txn' && e.source.txnId === txnId);
    const activeEntry = linked.find((e) => !e.deletedAt);
    // An entry an earlier sync removed by mistake: bring it back rather than add a duplicate,
    // so the person, note and "not expected back" mark it had are kept.
    const removedEntry = activeEntry ? undefined : [...linked].sort((a, b) => b.updatedAt - a.updatedAt)[0];

    // If tag is not a peer tag, soft-delete any existing linked entry
    if (!kind) {
      if (activeEntry) {
        get().softDeletePeerEntry(activeEntry.id);
      }
      return null;
    }

    const amountPaise = toPaise(Math.abs(amountRupees || 0));
    const existingEntry = activeEntry ?? removedEntry;
    const knownContactId =
      opts?.contactId && get().contacts.some((c) => c.id === opts.contactId) ? opts.contactId : undefined;

    if (existingEntry) {
      // Background reconciles keep the person the user chose (after a rename or merge);
      // only an edit the user makes to the transaction moves it to another person.
      const contactId = opts?.keepContact
        ? existingEntry.contactId
        : knownContactId ?? get().findOrCreateContact(merchantOrPayee || 'Friend').id;
      const due = opts?.dueDate === undefined ? {} : { dueDate: opts.dueDate || undefined };
      get().updatePeerEntry(existingEntry.id, {
        kind,
        amount: amountPaise,
        date: dateString,
        contactId,
        deletedAt: undefined,
        ...due,
      });
      return { ...existingEntry, kind, amount: amountPaise, date: dateString, contactId, deletedAt: undefined, ...due };
    }

    const contactId = knownContactId ?? get().findOrCreateContact(merchantOrPayee || 'Friend').id;
    return get().addPeerEntry({
      contactId,
      kind,
      amount: amountPaise,
      date: dateString,
      source: { type: 'txn', txnId },
      ...(opts?.dueDate ? { dueDate: opts.dueDate } : {}),
    });
  },

  addStoredAllocation: (allocationData) => {
    const now = Date.now();
    const newAlloc: StoredAllocation = {
      ...allocationData,
      id: `alloc_${now}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
    };
    const updated = [...get().storedAllocations, newAlloc];
    mmkvStorage.setObject('cache_peer_allocations', updated);
    set({ storedAllocations: updated });
  },

  removeStoredAllocation: (id) => {
    const updated = get().storedAllocations.filter((a) => a.id !== id);
    mmkvStorage.setObject('cache_peer_allocations', updated);
    set({ storedAllocations: updated });
    get().addTombstone('allocation', id);
  },

  addTombstone: (kind, id) => {
    const tombstones = [...get().tombstones.filter((t) => !(t.kind === kind && t.id === id)), { kind, id, at: Date.now() }];
    mmkvStorage.setObject('cache_peer_tombstones', tombstones);
    set({ tombstones });
  },

  getLedgerDoc: () => {
    const { contacts, entries, storedAllocations, tombstones } = get();
    return { contacts, entries, storedAllocations, tombstones } as PeerLedgerDoc;
  },

  applyLedgerDoc: (doc) => {
    const contacts = (doc.contacts || []) as Contact[];
    const entries = (doc.entries || []) as PeerEntry[];
    const storedAllocations = (doc.storedAllocations || []) as StoredAllocation[];
    const tombstones = doc.tombstones || [];
    mmkvStorage.setObject('cache_peer_contacts', contacts);
    mmkvStorage.setObject('cache_peer_entries', entries);
    mmkvStorage.setObject('cache_peer_allocations', storedAllocations);
    mmkvStorage.setObject('cache_peer_tombstones', tombstones);
    set({ contacts, entries, storedAllocations, tombstones });
  },

  addPendingSettlement: (settlementData) => {
    const now = Date.now();
    const newSettlement: PendingSettlement = {
      ...settlementData,
      id: `pending_settle_${now}_${Math.random().toString(36).substring(2, 7)}`,
      createdAt: now,
    };
    const updated = [...get().pendingSettlements, newSettlement];
    mmkvStorage.setObject('cache_peer_pending_settlements', updated);
    set({ pendingSettlements: updated });
  },

  matchPendingSettlement: (id) => {
    const updated = get().pendingSettlements.map((p) =>
      p.id === id ? { ...p, status: 'matched' as const } : p
    );
    mmkvStorage.setObject('cache_peer_pending_settlements', updated);
    set({ pendingSettlements: updated });
  },

  rehydrate: () => {
    set({
      contacts: loadCached<Contact[]>('cache_peer_contacts', []),
      entries: loadCached<PeerEntry[]>('cache_peer_entries', []),
      storedAllocations: loadCached<StoredAllocation[]>('cache_peer_allocations', []),
      pendingSettlements: loadCached<PendingSettlement[]>('cache_peer_pending_settlements', []),
      tombstones: loadCached<Tombstone[]>('cache_peer_tombstones', []),
    });
  },

  setNotExpectedBack: (entryId, notExpected) => {
    get().updatePeerEntry(entryId, { notExpectedBack: notExpected ? true : undefined });
  },

  reconcileWithTransactions: (debits) => {
    // Repayments a friend sends you are credits, kept in the income store, not the
    // transaction store: include them, or a "Friend repaid" tag looks deleted and the
    // loan it settled comes back.
    let credits: any[] = [];
    try {
      credits = require('./index').useIncomeStore.getState().incomeRecords || [];
    } catch {
      credits = [];
    }
    const txs = [...(Array.isArray(debits) ? debits : []), ...credits];
    if (txs.length === 0) return;
    const txMap = new Map<string, any>();
    let oldestLoaded = Infinity;
    for (const t of txs) {
      if (t && t.id) txMap.set(t.id, t);
      const ts = Number(t?.timestamp);
      if (ts > 0 && ts < oldestLoaded) oldestLoaded = ts;
    }

    // 1. Remove a txn-linked entry only when we can tell its transaction was really
    //    untagged or deleted: it's in the list without a peer tag, or it's missing although
    //    the list reaches back to its date. Missing from a partial list is not "deleted".
    const currentEntries = get().entries;
    for (const e of currentEntries) {
      if (!e.deletedAt && e.source?.type === 'txn' && e.source?.txnId) {
        const matchingTx = txMap.get(e.source.txnId);
        if (shouldRemoveTxnEntry(e.date, matchingTx, oldestLoaded, (c) => !!tagToKind(String(c || '')))) {
          get().softDeletePeerEntry(e.id);
        }
      }
    }

    // 2. Upsert/reconcile all transactions that are peer-related. A new entry goes to the
    //    person the payment is recognised as (UPI ID, account, a confirmed name), not to
    //    whoever matches the printed name, so a new spelling doesn't create a second person.
    const index = buildCounterpartyIndex(get().contacts);
    for (const t of txs) {
      if (t?.isDeleted) continue;
      if (!t || !t.id) continue;
      const cat = String(t.category || '').toLowerCase().trim();
      const kind = tagToKind(cat);
      if (kind) {
        let ts = Number(t.timestamp);
        if (isNaN(ts) || ts <= 0) {
          ts = t.timestamp ? new Date(t.timestamp).getTime() : Date.now();
          if (isNaN(ts)) ts = Date.now();
        }
        const d = new Date(ts);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const rawMerchant = (t.merchant || '').trim();
        const isPlaceholder = ['peer_lent', 'peer_borrowed', 'peer_lend', 'peer_borrow_repaid', 'peer_lent_repaid', 'lent to friend', 'borrowed', 'misc', 'uncategorized'].includes(rawMerchant.toLowerCase());
        const merchant = !isPlaceholder && rawMerchant ? rawMerchant : (t.note?.trim() || 'Friend');

        const known = resolveCounterparty(t, index);
        get().syncWithTransactionTag(t.id, cat, Number(t.amount || 0), dateStr, merchant, {
          keepContact: true,
          ...(known ? { contactId: known.contactId } : {}),
        });
      }
    }
  },
}));

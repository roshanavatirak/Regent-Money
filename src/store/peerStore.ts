// src/store/peerStore.ts
//
// Zustand store for Regent Money Borrow & Lend tracking.
// Persists contacts, entries, manual allocations, and pending settlements in MMKV.

import { create } from 'zustand';
import { mmkvStorage } from '../db/mmkv';
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
    merchantOrPayee?: string
  ) => PeerEntry | null;

  // Stored manual allocation actions
  addStoredAllocation: (allocation: Omit<StoredAllocation, 'id' | 'createdAt'>) => void;
  removeStoredAllocation: (id: string) => void;

  // Pending settlements (UPI intents)
  addPendingSettlement: (settlement: Omit<PendingSettlement, 'id' | 'createdAt'>) => void;
  matchPendingSettlement: (id: string) => void;

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
    // Soft delete all entries linked to this contact
    const updatedEntries = get().entries.map((e) =>
      e.contactId === id ? { ...e, deletedAt: now } : e
    );
    mmkvStorage.setObject('cache_peer_contacts', updatedContacts);
    mmkvStorage.setObject('cache_peer_entries', updatedEntries);
    set({ contacts: updatedContacts, entries: updatedEntries });
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

    const now = Date.now();
    const updatedContacts = get().contacts
      .filter((c) => c.id !== sourceContactId)
      .map((c) =>
        c.id === targetContactId
          ? { ...c, aliases: mergedAliases, upiIds: mergedUpis, updatedAt: now }
          : c
      );

    // Reassign all source entries to target
    const updatedEntries = get().entries.map((e) =>
      e.contactId === sourceContactId ? { ...e, contactId: targetContactId, updatedAt: now } : e
    );

    mmkvStorage.setObject('cache_peer_contacts', updatedContacts);
    mmkvStorage.setObject('cache_peer_entries', updatedEntries);
    set({ contacts: updatedContacts, entries: updatedEntries });
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
      e.id === id ? { ...e, deletedAt: now } : e
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

  syncWithTransactionTag: (txnId, tag, amountRupees, dateString, merchantOrPayee) => {
    const kind = tagToKind(tag);
    const existingEntry = get().entries.find(
      (e) => !e.deletedAt && e.source.type === 'txn' && e.source.txnId === txnId
    );

    // If tag is not a peer tag, soft-delete any existing linked entry
    if (!kind) {
      if (existingEntry) {
        get().softDeletePeerEntry(existingEntry.id);
      }
      return null;
    }

    const contact = get().findOrCreateContact(merchantOrPayee || 'Friend');
    const amountPaise = toPaise(Math.abs(amountRupees || 0));

    if (existingEntry) {
      get().updatePeerEntry(existingEntry.id, {
        kind,
        amount: amountPaise,
        date: dateString,
        contactId: contact.id,
      });
      return { ...existingEntry, kind, amount: amountPaise, date: dateString, contactId: contact.id };
    }

    return get().addPeerEntry({
      contactId: contact.id,
      kind,
      amount: amountPaise,
      date: dateString,
      source: { type: 'txn', txnId },
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
    });
  },

  reconcileWithTransactions: (txs) => {
    if (!Array.isArray(txs) || txs.length === 0) return;
    const txMap = new Map<string, any>();
    for (const t of txs) {
      if (t && t.id) txMap.set(t.id, t);
    }

    // 1. Soft-delete any existing txn-based peer entries whose transaction no longer exists or was uncategorized
    const currentEntries = get().entries;
    for (const e of currentEntries) {
      if (!e.deletedAt && e.source?.type === 'txn' && e.source?.txnId) {
        const matchingTx = txMap.get(e.source.txnId);
        if (!matchingTx || !tagToKind(matchingTx.category)) {
          get().softDeletePeerEntry(e.id);
        }
      }
    }

    // 2. Upsert/reconcile all transactions that are peer-related
    for (const t of txs) {
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

        get().syncWithTransactionTag(t.id, cat, Number(t.amount || 0), dateStr, merchant);
      }
    }
  },
}));

// Merging two copies of the Borrow & Lend ledger (this phone's and the server's).
//
// Each contact, entry and allocation carries an id and a time it last changed; for every id
// the newer copy wins. Deleted contacts and allocations leave a tombstone (id + when), so a
// delete on one phone isn't undone by the other phone's older copy. Entries are never
// removed outright: they're soft-deleted (deletedAt), which merges like any other change.

export interface Tombstone {
  id: string;
  kind: 'contact' | 'allocation';
  at: number;
}

export interface PeerLedgerDoc {
  contacts: Array<{ id: string; updatedAt?: number; createdAt?: number; [k: string]: any }>;
  entries: Array<{ id: string; updatedAt?: number; createdAt?: number; [k: string]: any }>;
  storedAllocations: Array<{ id: string; createdAt?: number; [k: string]: any }>;
  tombstones: Tombstone[];
}

export const emptyLedger = (): PeerLedgerDoc => ({ contacts: [], entries: [], storedAllocations: [], tombstones: [] });

const stamp = (x: { updatedAt?: number; createdAt?: number }) => Number(x.updatedAt ?? x.createdAt ?? 0) || 0;

function newest<T extends { id: string; updatedAt?: number; createdAt?: number }>(a: T[], b: T[]): T[] {
  const byId = new Map<string, T>();
  for (const item of [...(a || []), ...(b || [])]) {
    if (!item || typeof item.id !== 'string') continue;
    const prev = byId.get(item.id);
    if (!prev || stamp(item) > stamp(prev)) byId.set(item.id, item);
  }
  return [...byId.values()];
}

/**
 * One entry per tagged bank/cash transaction. A phone that signs in fresh re-creates entries
 * from tagged transactions before (or while) the server copy arrives, under new ids; keep the
 * original (earliest created, not deleted when possible), which carries the person, return
 * date and "not expected back" mark the user set.
 */
function onePerTransaction<T extends { id: string; createdAt?: number; [k: string]: any }>(entries: T[]): T[] {
  const byTxn = new Map<string, T>();
  const out: T[] = [];
  for (const e of entries) {
    const txnId = e?.source?.type === 'txn' ? e.source.txnId : null;
    if (!txnId) {
      out.push(e);
      continue;
    }
    const prev = byTxn.get(txnId);
    if (!prev) {
      byTxn.set(txnId, e);
      continue;
    }
    const prevLive = !prev.deletedAt;
    const eLive = !e.deletedAt;
    const keepE = eLive !== prevLive ? eLive : Number(e.createdAt || 0) < Number(prev.createdAt || 0);
    if (keepE) byTxn.set(txnId, e);
  }
  return [...out, ...byTxn.values()];
}

/** Keep tombstones this long; after that a phone that slept through it is very unlikely. */
const TOMBSTONE_KEEP_MS = 180 * 24 * 60 * 60 * 1000;

export function mergeLedgers(a: PeerLedgerDoc | null | undefined, b: PeerLedgerDoc | null | undefined, now = Date.now()): PeerLedgerDoc {
  const A = a || emptyLedger();
  const B = b || emptyLedger();

  const tombs = new Map<string, Tombstone>();
  for (const t of [...(A.tombstones || []), ...(B.tombstones || [])]) {
    if (!t || typeof t.id !== 'string' || now - Number(t.at) > TOMBSTONE_KEEP_MS) continue;
    const key = `${t.kind}:${t.id}`;
    const prev = tombs.get(key);
    if (!prev || t.at > prev.at) tombs.set(key, t);
  }
  const buried = (kind: Tombstone['kind'], id: string, changedAt: number) => {
    const t = tombs.get(`${kind}:${id}`);
    // Re-created after it was deleted (newer change than the tombstone): keep it.
    return !!t && t.at >= changedAt;
  };

  const contacts = newest(A.contacts, B.contacts).filter((c) => !buried('contact', c.id, stamp(c)));
  const entries = onePerTransaction(newest(A.entries, B.entries));
  const storedAllocations = newest(A.storedAllocations, B.storedAllocations).filter(
    (x) => !buried('allocation', x.id, stamp(x))
  );

  const sortById = <T extends { id: string }>(xs: T[]) => xs.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return {
    contacts: sortById(contacts),
    entries: sortById(entries),
    storedAllocations: sortById(storedAllocations),
    tombstones: sortById([...tombs.values()]),
  };
}

/** Same content, ignoring order: decides whether anything needs saving or sending. */
export function sameLedger(a: PeerLedgerDoc, b: PeerLedgerDoc, now = Date.now()): boolean {
  const norm = (d: PeerLedgerDoc) => JSON.stringify(mergeLedgers(d, emptyLedger(), now));
  return norm(a) === norm(b);
}

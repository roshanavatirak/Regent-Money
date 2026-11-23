// Shape and size checks for a Borrow & Lend ledger sent by the app. The server stores the
// ledger as one encrypted document per user; it never reads names or amounts out of it, but
// it refuses anything that isn't the expected shape or is unreasonably large.

export const MAX_LEDGER_BYTES = 1_500_000;
const LIMITS = { contacts: 2000, entries: 20000, storedAllocations: 20000, tombstones: 20000 } as const;

export interface PeerLedgerDoc {
  contacts: unknown[];
  entries: unknown[];
  storedAllocations: unknown[];
  tombstones: unknown[];
}

const hasId = (x: unknown): boolean =>
  !!x && typeof x === 'object' && typeof (x as any).id === 'string' && (x as any).id.length > 0 && (x as any).id.length <= 80;

/** The ledger as JSON text when it is valid, else a reason it was refused. */
export function validateLedger(input: unknown): { ok: true; json: string; doc: PeerLedgerDoc } | { ok: false; reason: string } {
  if (!input || typeof input !== 'object') return { ok: false, reason: 'Ledger must be an object.' };
  const raw = input as Record<string, unknown>;
  const doc: PeerLedgerDoc = { contacts: [], entries: [], storedAllocations: [], tombstones: [] };
  for (const key of Object.keys(LIMITS) as Array<keyof typeof LIMITS>) {
    const list = raw[key] ?? [];
    if (!Array.isArray(list)) return { ok: false, reason: `${key} must be a list.` };
    if (list.length > LIMITS[key]) return { ok: false, reason: `Too many ${key}.` };
    if (!list.every(hasId)) return { ok: false, reason: `Every item in ${key} needs an id.` };
    doc[key] = list;
  }
  const json = JSON.stringify(doc);
  if (Buffer.byteLength(json, 'utf8') > MAX_LEDGER_BYTES) return { ok: false, reason: 'Ledger is too large.' };
  return { ok: true, json, doc };
}

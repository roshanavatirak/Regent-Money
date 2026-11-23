// Keeps Borrow & Lend on the server so it survives log out, reinstall and a new phone.
//
// - syncPeerLedger(): one pull-merge-push round (see peerSyncCore). Runs after each main
//   sync (app start, sign-in, pull-to-refresh) and when Borrow & Lend opens.
// - Any local change (a repayment, "won't come back", a return date, a delete) schedules a
//   round a few seconds later, so quick edits go up together.
// Offline or signed out: nothing happens; the next round catches up.

import { apiFetch } from './apiClient';
import { tokenStore } from './tokenStore';
import { usePeerStore } from '../store/peerStore';
import { syncLedgerOnce, type RemoteLedger } from './peerSyncCore';
import type { PeerLedgerDoc } from '../utils/peerLedgerMerge';

const PUSH_DELAY_MS = 3000;

let running: Promise<unknown> | null = null;
let again = false;
let applyingRemote = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function fetchRemote(): Promise<RemoteLedger> {
  const res = await apiFetch('/peer-ledger');
  if (!res.ok) throw new Error(`Borrow & Lend fetch failed (${res.status})`);
  const body = await res.json();
  return { data: body?.data ?? null, version: Number(body?.version) || 0 };
}

async function pushRemote(doc: PeerLedgerDoc, baseVersion: number) {
  const res = await apiFetch('/peer-ledger', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: doc, baseVersion }),
  });
  if (res.status === 409) {
    const body = await res.json().catch(() => ({}));
    const current = body?.current ?? body?.message?.current;
    if (current) return { conflict: { data: current.data ?? null, version: Number(current.version) || 0 } };
    return { conflict: await fetchRemote() };
  }
  if (!res.ok) throw new Error(`Borrow & Lend save failed (${res.status})`);
  const body = await res.json();
  return { version: Number(body?.version) || baseVersion + 1 };
}

/** One sync round; overlapping calls share one round and queue one more. */
export async function syncPeerLedger(): Promise<void> {
  if (!tokenStore.getAccessToken()) return;
  if (running) {
    again = true;
    return;
  }
  running = syncLedgerOnce({
    getLocal: () => usePeerStore.getState().getLedgerDoc(),
    applyLocal: (doc) => {
      applyingRemote = true;
      try {
        usePeerStore.getState().applyLedgerDoc(doc);
      } finally {
        applyingRemote = false;
      }
    },
    fetchRemote,
    pushRemote,
  })
    .catch((err) => console.warn('[PeerSync]', err?.message || err))
    .finally(() => {
      running = null;
      if (again) {
        again = false;
        void syncPeerLedger();
      }
    });
  await running;
}

/** Send local changes a few seconds after they happen. Call once at start-up. */
let watching = false;
export function startPeerLedgerAutoSync(): void {
  if (watching) return;
  watching = true;
  usePeerStore.subscribe((state, prev) => {
    if (applyingRemote) return;
    if (
      state.contacts === prev.contacts &&
      state.entries === prev.entries &&
      state.storedAllocations === prev.storedAllocations &&
      state.tombstones === prev.tombstones
    ) {
      return;
    }
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void syncPeerLedger();
    }, PUSH_DELAY_MS);
  });
}

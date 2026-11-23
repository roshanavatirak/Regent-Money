// One round of syncing the Borrow & Lend ledger, with the network and storage passed in so
// it can be tested on its own (peerSyncService wires the real ones).
//
//   1. Fetch the server's copy and its version.
//   2. Merge it with this phone's copy (newest change per item wins; deletes stick).
//   3. If the merge changed anything here, save it on the phone.
//   4. If the server is missing anything, send the merged copy, based on the version from
//      step 1. Another phone saved in between? The server returns its copy: merge again
//      and retry (a few times at most).

import { mergeLedgers, sameLedger, type PeerLedgerDoc } from '../utils/peerLedgerMerge';

export interface RemoteLedger {
  data: PeerLedgerDoc | null;
  version: number;
}

export interface LedgerSyncDeps {
  getLocal: () => PeerLedgerDoc;
  applyLocal: (doc: PeerLedgerDoc) => void;
  fetchRemote: () => Promise<RemoteLedger>;
  /** Resolves with the saved version, or { conflict } carrying the server's newer copy. */
  pushRemote: (doc: PeerLedgerDoc, baseVersion: number) => Promise<{ version: number } | { conflict: RemoteLedger }>;
  now?: () => number;
}

export type LedgerSyncResult = 'unchanged' | 'pulled' | 'pushed' | 'pulled_and_pushed';

const MAX_ATTEMPTS = 3;

export async function syncLedgerOnce(deps: LedgerSyncDeps): Promise<LedgerSyncResult> {
  const now = deps.now ?? Date.now;
  let remote = await deps.fetchRemote();
  let pulled = false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const local = deps.getLocal();
    const merged = mergeLedgers(local, remote.data, now());

    if (!sameLedger(merged, local, now())) {
      deps.applyLocal(merged);
      pulled = true;
    }
    if (remote.data && sameLedger(merged, remote.data, now())) {
      return pulled ? 'pulled' : 'unchanged';
    }
    // Nothing on either side yet: nothing to send.
    if (!remote.data && merged.contacts.length === 0 && merged.entries.length === 0 && merged.tombstones.length === 0) {
      return pulled ? 'pulled' : 'unchanged';
    }

    const result = await deps.pushRemote(merged, remote.version);
    if ('version' in result) return pulled ? 'pulled_and_pushed' : 'pushed';
    remote = result.conflict;
  }
  throw new Error('Borrow & Lend kept changing on another device; will try again later.');
}

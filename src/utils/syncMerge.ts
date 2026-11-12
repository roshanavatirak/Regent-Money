// src/utils/syncMerge.ts
//
// Changed-only sync: the server sends just the rows that changed since this phone's last pull
// (plus the ids of deleted rows). These helpers fold that into what the phone already holds.
// Pure functions, no storage or network, so they can be tested on their own.

type Row = { id?: string | null };

/**
 * What the phone should hold after a changed-only pull: everything it had, minus the deleted
 * rows, with each changed row replacing its old copy (or added if new).
 */
export function mergeChangedRows<T extends Row>(
  existing: readonly T[] | null | undefined,
  changed: readonly T[] | null | undefined,
  deletedIds: readonly string[] | null | undefined,
): T[] {
  const gone = new Set((deletedIds || []).filter(Boolean));
  const byId = new Map<string, T>();
  for (const row of existing || []) {
    if (row && row.id && !gone.has(row.id)) byId.set(row.id, row);
  }
  for (const row of changed || []) {
    if (row && row.id && !gone.has(row.id)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

/**
 * The self-check after a changed-only pull. The server says how many rows it holds; if the
 * phone would end up with a different number, something was missed (or the phone's copy was
 * incomplete) and the caller must download everything instead.
 *
 * `localOnlyIds` are rows saved on this phone that the server may not have yet (unsent
 * edits). They are left out of the phone's count unless the server just sent them.
 */
export function deltaLooksComplete(args: {
  existingIds: readonly (string | null | undefined)[];
  changedIds: readonly (string | null | undefined)[];
  deletedIds: readonly string[] | null | undefined;
  localOnlyIds?: ReadonlySet<string>;
  serverTotal: number | null | undefined;
}): boolean {
  const { serverTotal } = args;
  if (typeof serverTotal !== 'number' || !Number.isFinite(serverTotal) || serverTotal < 0) return false;

  const gone = new Set((args.deletedIds || []).filter(Boolean));
  const changed = new Set<string>();
  for (const id of args.changedIds) if (id && !gone.has(id)) changed.add(id);

  const ids = new Set<string>(changed);
  for (const id of args.existingIds) {
    if (!id || gone.has(id)) continue;
    if (args.localOnlyIds?.has(id) && !changed.has(id)) continue;
    ids.add(id);
  }
  return ids.size === serverTotal;
}

/** How long a phone keeps pulling only changes before it downloads everything once more. */
export const FULL_SYNC_EVERY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether this pull may ask for changes only. It needs a cursor from an earlier pull, data
 * already on the phone to apply the changes to, and a full download within the last day.
 * A forced refresh (pull-to-refresh) always downloads everything.
 */
export function shouldAskForChangesOnly(args: {
  force: boolean;
  cursor: number | null | undefined;
  lastFullSyncAt: number | null | undefined;
  hasLocalData: boolean;
  now: number;
}): boolean {
  if (args.force || !args.hasLocalData) return false;
  if (typeof args.cursor !== 'number' || !Number.isFinite(args.cursor) || args.cursor <= 0) return false;
  const lastFull = Number(args.lastFullSyncAt) || 0;
  if (lastFull <= 0 || lastFull > args.now) return false;
  return args.now - lastFull < FULL_SYNC_EVERY_MS;
}

import assert from 'node:assert';
import { test } from 'node:test';
import { mergeChangedRows, deltaLooksComplete, shouldAskForChangesOnly, FULL_SYNC_EVERY_MS } from './syncMerge.ts';

const row = (id: string, amount: number) => ({ id, amount });

test('a changed row replaces its old copy, a new row is added, a deleted row is removed', () => {
  const existing = [row('a', 100), row('b', 200), row('c', 300)];
  const merged = mergeChangedRows(existing, [row('b', 250), row('d', 400)], ['c']);
  assert.deepStrictEqual(
    merged.sort((x, y) => x.id.localeCompare(y.id)),
    [row('a', 100), row('b', 250), row('d', 400)],
  );
});

test('receiving the same change twice gives the same result (pulls overlap on purpose)', () => {
  const once = mergeChangedRows([row('a', 1)], [row('b', 2)], ['x']);
  const twice = mergeChangedRows(once, [row('b', 2)], ['x']);
  assert.deepStrictEqual(twice, once);
});

test('a row that is both changed and deleted in one pull ends up deleted', () => {
  assert.deepStrictEqual(mergeChangedRows([row('a', 1)], [row('a', 5)], ['a']), []);
});

test('nothing changed keeps everything; empty inputs are safe', () => {
  const existing = [row('a', 1), row('b', 2)];
  assert.deepStrictEqual(mergeChangedRows(existing, [], []), existing);
  assert.deepStrictEqual(mergeChangedRows(null, undefined, null), []);
});

test('self-check passes when the phone ends up with as many rows as the server holds', () => {
  assert.strictEqual(
    deltaLooksComplete({ existingIds: ['a', 'b', 'c'], changedIds: ['b', 'd'], deletedIds: ['c'], serverTotal: 3 }),
    true,
  );
});

test('self-check fails when a row was missed, the phone copy was incomplete, or no total came', () => {
  // The server has 4 rows but the phone would hold 3: one change never arrived
  assert.strictEqual(
    deltaLooksComplete({ existingIds: ['a', 'b'], changedIds: ['c'], deletedIds: [], serverTotal: 4 }),
    false,
  );
  // The phone's list was empty (not loaded yet) while the server holds 50
  assert.strictEqual(deltaLooksComplete({ existingIds: [], changedIds: ['z'], deletedIds: [], serverTotal: 50 }), false);
  // The phone still has a row the server no longer has
  assert.strictEqual(deltaLooksComplete({ existingIds: ['a', 'ghost'], changedIds: [], deletedIds: [], serverTotal: 1 }), false);
  assert.strictEqual(
    deltaLooksComplete({ existingIds: ['a'], changedIds: [], deletedIds: [], serverTotal: undefined }),
    false,
  );
});

test('rows saved only on this phone are not counted, unless the server just sent them', () => {
  const localOnlyIds = new Set(['draft']);
  assert.strictEqual(
    deltaLooksComplete({ existingIds: ['a', 'draft'], changedIds: [], deletedIds: [], localOnlyIds, serverTotal: 1 }),
    true,
  );
  assert.strictEqual(
    deltaLooksComplete({ existingIds: ['a', 'draft'], changedIds: ['draft'], deletedIds: [], localOnlyIds, serverTotal: 2 }),
    true,
  );
});

test('changes-only is used only with a cursor, local data and a full download in the last day', () => {
  const now = 1_800_000_000_000;
  const ok = { force: false, cursor: now - 5000, lastFullSyncAt: now - 60_000, hasLocalData: true, now };
  assert.strictEqual(shouldAskForChangesOnly(ok), true);
  assert.strictEqual(shouldAskForChangesOnly({ ...ok, force: true }), false); // pull-to-refresh
  assert.strictEqual(shouldAskForChangesOnly({ ...ok, cursor: null }), false); // first pull
  assert.strictEqual(shouldAskForChangesOnly({ ...ok, hasLocalData: false }), false); // fresh install
  assert.strictEqual(shouldAskForChangesOnly({ ...ok, lastFullSyncAt: now - FULL_SYNC_EVERY_MS }), false); // daily full
  assert.strictEqual(shouldAskForChangesOnly({ ...ok, lastFullSyncAt: 0 }), false);
  assert.strictEqual(shouldAskForChangesOnly({ ...ok, lastFullSyncAt: now + 5000 }), false); // phone clock moved back
});

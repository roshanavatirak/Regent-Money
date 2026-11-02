import assert from 'node:assert';
import { test, beforeEach } from 'node:test';
import { mmkvStorage } from './mmkv.ts';
import { monthOf, txShards, incShards, migrateBlobToShards } from './shards.ts';

beforeEach(() => {
  mmkvStorage.clearAll();
});

test('monthOf returns UTC YYYY-MM string', () => {
  // 2026-11-02 21:00:00 UTC
  const ts1 = Date.UTC(2026, 10, 2, 21, 0, 0);
  assert.strictEqual(monthOf(ts1), '2026-11');

  // 2026-01-15 10:00:00 UTC
  const ts2 = Date.UTC(2026, 0, 15, 10, 0, 0);
  assert.strictEqual(monthOf(ts2), '2026-01');
});

test('txShards partitions transactions into monthly keys and loads sorted', () => {
  const tNov = Date.UTC(2026, 10, 5);
  const tOct = Date.UTC(2026, 9, 20);
  const tSep = Date.UTC(2026, 8, 10);

  const sampleTxs = [
    { id: 'tx_1', amount: 100, timestamp: tNov },
    { id: 'tx_2', amount: 200, timestamp: tOct },
    { id: 'tx_3', amount: 300, timestamp: tNov },
    { id: 'tx_4', amount: 400, timestamp: tSep },
  ];

  txShards.saveAll(sampleTxs);

  const keys = mmkvStorage.getAllKeys().filter((k) => k.startsWith('tx:')).sort();
  assert.deepStrictEqual(keys, ['tx:2026-09', 'tx:2026-10', 'tx:2026-11']);

  const loaded = txShards.loadAll();
  assert.strictEqual(loaded.length, 4);
  assert.strictEqual(loaded[0].id, 'tx_1'); // newest first
  assert.strictEqual(loaded[3].id, 'tx_4'); // oldest last
});

test('txShards.upsert updates only the target month shard', () => {
  const tNov = Date.UTC(2026, 10, 5);
  const tOct = Date.UTC(2026, 9, 20);

  txShards.saveAll([
    { id: 'tx_nov', amount: 50, timestamp: tNov },
    { id: 'tx_oct', amount: 80, timestamp: tOct },
  ]);

  // Upsert into Nov shard
  txShards.upsert({ id: 'tx_nov', amount: 75, timestamp: tNov });

  // Oct shard must remain completely untouched
  const oct = mmkvStorage.getObject<any[]>('tx:2026-10');
  assert.strictEqual(oct?.length, 1);
  assert.strictEqual(oct?.[0].amount, 80);

  // Nov shard must reflect update
  const nov = mmkvStorage.getObject<any[]>('tx:2026-11');
  assert.strictEqual(nov?.[0].amount, 75);
});

test('txShards.remove removes target transaction from shard', () => {
  const tNov = Date.UTC(2026, 10, 5);
  txShards.saveAll([
    { id: 'tx_1', amount: 50, timestamp: tNov },
    { id: 'tx_2', amount: 60, timestamp: tNov },
  ]);

  txShards.remove('tx_1', tNov);
  const nov = mmkvStorage.getObject<any[]>('tx:2026-11');
  assert.strictEqual(nov?.length, 1);
  assert.strictEqual(nov?.[0].id, 'tx_2');
});

test('migrateBlobToShards migrates legacy blob into monthly shards and deletes blob', () => {
  const tNov = Date.UTC(2026, 10, 1);
  const tOct = Date.UTC(2026, 9, 15);

  mmkvStorage.setObject('cache_transactions', [
    { id: 'tx_1', amount: 100, timestamp: tNov },
    { id: 'tx_2', amount: 200, timestamp: tOct },
  ]);
  mmkvStorage.setObject('cache_income_records', [
    { id: 'inc_1', amount: 50000, timestamp: tNov },
  ]);

  migrateBlobToShards();

  // Legacy blobs must be deleted
  assert.strictEqual(mmkvStorage.getObject('cache_transactions'), null);
  assert.strictEqual(mmkvStorage.getObject('cache_income_records'), null);

  // Migration flag set
  assert.strictEqual(mmkvStorage.getBoolean('migration_shards_v1'), true);

  // Shards must be loaded seamlessly
  const txs = txShards.loadAll();
  assert.strictEqual(txs.length, 2);

  const incs = incShards.loadAll();
  assert.strictEqual(incs.length, 1);
});


import assert from 'node:assert';
import { test, beforeEach } from 'node:test';
import { mmkvStorage } from './mmkv.ts';
import { outbox, isOutboxEnabled } from './outbox.ts';

beforeEach(() => {
  mmkvStorage.clearAll();
});

test('outbox.enqueue assigns zero-padded monotonic sequence keys', () => {
  const k1 = outbox.enqueue({
    idemKey: 'op_test_1',
    userId: 'user_1',
    entity: 'transaction',
    op: 'upsert',
    entityId: 'tx_manual_1',
    payload: { amount: 100 },
  });

  const k2 = outbox.enqueue({
    idemKey: 'op_test_2',
    userId: 'user_1',
    entity: 'transaction',
    op: 'upsert',
    entityId: 'tx_manual_2',
    payload: { amount: 200 },
  });

  assert.strictEqual(k1, 'outbox:0000000001:op_test_1');
  assert.strictEqual(k2, 'outbox:0000000002:op_test_2');

  // Verify alphabetical sort matches numeric chronological order
  assert.deepStrictEqual([k2, k1].sort(), [k1, k2]);
});

test('outbox.listPending drops operations belonging to a previous user session', () => {
  outbox.enqueue({
    idemKey: 'op_user_a',
    userId: 'user_A',
    entity: 'transaction',
    op: 'upsert',
    entityId: 'tx_manual_a',
  });

  outbox.enqueue({
    idemKey: 'op_user_b',
    userId: 'user_B',
    entity: 'transaction',
    op: 'upsert',
    entityId: 'tx_manual_b',
  });

  const pendingB = outbox.listPending('user_B');
  assert.strictEqual(pendingB.length, 1);
  assert.strictEqual(pendingB[0].op.userId, 'user_B');
  assert.strictEqual(pendingB[0].op.entityId, 'tx_manual_b');

  // The discarded user_A op must be purged from storage to prevent leak
  const allKeys = mmkvStorage.getAllKeys();
  assert.strictEqual(allKeys.some((k) => k.includes('op_user_a')), false);
});

test('outbox.markFailed increments attemptCount and backs off', () => {
  const key = outbox.enqueue({
    idemKey: 'op_retry_test',
    userId: 'user_1',
    entity: 'transaction',
    op: 'upsert',
    entityId: 'tx_manual_retry',
  });

  const [item] = outbox.listPending('user_1');
  const now = Date.now();
  outbox.markFailed(key, item.op);

  const updated = mmkvStorage.getObject<any>(key);
  assert.strictEqual(updated.attemptCount, 1);
  assert.ok(updated.nextAttemptAt >= now + 2000); // 1000 * 2^1 = 2000ms

  // While nextAttemptAt is in future, listPending skips it
  assert.strictEqual(outbox.listPending('user_1').length, 0);
});

test('outbox.markFailed moves to dead-letter queue after max retries', () => {
  const key = outbox.enqueue({
    idemKey: 'op_poison_pill',
    userId: 'user_1',
    entity: 'transaction',
    op: 'upsert',
    entityId: 'tx_manual_poison',
  });

  let item = outbox.listPending('user_1')[0].op;
  for (let i = 0; i < 5; i++) {
    item.attemptCount = i;
    outbox.markFailed(key, item);
  }

  // Key should be removed from active outbox
  assert.strictEqual(mmkvStorage.getObject(key), null);

  // Dead letter store should hold the failed operation with reason
  const dead = mmkvStorage.getObject<any>('outbox_dead:op_poison_pill');
  assert.ok(dead);
  assert.strictEqual(dead.entityId, 'tx_manual_poison');
  assert.strictEqual(dead.reason, 'max_retries_exceeded');
});

test('outbox.pendingEntityIds returns both pending and dead-letter IDs for user', () => {
  outbox.enqueue({
    idemKey: 'op_active',
    userId: 'user_X',
    entity: 'transaction',
    op: 'upsert',
    entityId: 'tx_manual_active',
  });

  const deadKey = outbox.enqueue({
    idemKey: 'op_dead',
    userId: 'user_X',
    entity: 'transaction',
    op: 'upsert',
    entityId: 'tx_manual_dead',
  });
  const deadOp = outbox.listPending('user_X').find((x) => x.op.idemKey === 'op_dead')!.op;
  outbox.moveToDead(deadKey, deadOp, 'bad_amount');

  const ids = outbox.pendingEntityIds('user_X');
  assert.strictEqual(ids.has('tx_manual_active'), true);
  assert.strictEqual(ids.has('tx_manual_dead'), true);
  assert.strictEqual(ids.size, 2);
});


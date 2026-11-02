import { mmkvStorage } from './mmkv';

export interface OutboxOp {
  idemKey: string;
  userId: string;
  entity: 'transaction' | 'income';
  op: 'upsert' | 'delete';
  entityId: string;
  payload?: Record<string, any>;
  queuedAt: number;
  attemptCount: number;
  nextAttemptAt: number;
}

export interface DeadLetterOp extends OutboxOp {
  reason: string;
  failedAt: number;
}

/**
 * Feature flag for offline outbox.
 * Defaults to true; can be toggled via MMKV setting.
 */
export const isOutboxEnabled = (): boolean => {
  return mmkvStorage.getBoolean('feature_outbox_sync') ?? true;
};

export const outbox = {
  /**
   * Enqueues an operation with zero-padded sequence key to guarantee lexical ordering.
   * Format: outbox:<10-digit-seq>:<idemKey>
   */
  enqueue(
    rawOp: Omit<OutboxOp, 'queuedAt' | 'attemptCount' | 'nextAttemptAt'>,
  ): string {
    const now = Date.now();
    const currentSeq = mmkvStorage.getNumber('outbox_seq') ?? 0;
    const nextSeq = currentSeq + 1;
    mmkvStorage.setNumber('outbox_seq', nextSeq);

    const padSeq = String(nextSeq).padStart(10, '0');
    const key = `outbox:${padSeq}:${rawOp.idemKey}`;

    const op: OutboxOp = {
      ...rawOp,
      queuedAt: now,
      attemptCount: 0,
      nextAttemptAt: now,
    };

    mmkvStorage.setObject(key, op);
    return key;
  },

  /**
   * Lists pending operations for the current user in strict chronological sequence.
   * Drops cross-user operations to prevent flushing User A's ops into User B's account.
   */
  listPending(currentUserId: string, maxBatchSize = 100): { key: string; op: OutboxOp }[] {
    const allKeys = mmkvStorage.getAllKeys();
    const outboxKeys = allKeys.filter((k) => k.startsWith('outbox:')).sort();
    const now = Date.now();
    const list: { key: string; op: OutboxOp }[] = [];

    for (const key of outboxKeys) {
      if (list.length >= maxBatchSize) break;
      const op = mmkvStorage.getObject<OutboxOp>(key);
      if (!op) {
        mmkvStorage.delete(key);
        continue;
      }

      // Drop operations belonging to any previous session user
      if (op.userId !== currentUserId) {
        mmkvStorage.delete(key);
        continue;
      }

      // Skip ops currently in exponential backoff
      if (op.nextAttemptAt > now) {
        continue;
      }

      list.push({ key, op });
    }

    return list;
  },

  /**
   * Removes successfully applied operation from the outbox.
   */
  removeOp(key: string): void {
    mmkvStorage.delete(key);
  },

  /**
   * Marks an operation as failed with exponential backoff.
   * Moves to dead-letter store if max retries exceeded.
   */
  markFailed(key: string, op: OutboxOp, maxRetries = 5): void {
    const attempt = (op.attemptCount || 0) + 1;
    if (attempt >= maxRetries) {
      this.moveToDead(key, op, 'max_retries_exceeded');
      return;
    }

    const delay = Math.min(60_000, 1000 * Math.pow(2, attempt));
    const updated: OutboxOp = {
      ...op,
      attemptCount: attempt,
      nextAttemptAt: Date.now() + delay,
    };
    mmkvStorage.setObject(key, updated);
  },

  /**
   * Moves permanently rejected/failed operation to the dead-letter vault.
   */
  moveToDead(key: string, op: OutboxOp, reason: string): void {
    const dead: DeadLetterOp = {
      ...op,
      reason,
      failedAt: Date.now(),
    };
    mmkvStorage.setObject(`outbox_dead:${op.idemKey}`, dead);
    mmkvStorage.delete(key);
  },

  /**
   * Returns all entity IDs currently pending or dead-lettered for this user.
   * Used during sync pull-merge to prevent incoming server pulls from wiping local offline changes.
   */
  pendingEntityIds(currentUserId: string): Set<string> {
    const ids = new Set<string>();
    const allKeys = mmkvStorage.getAllKeys();

    for (const key of allKeys) {
      if (key.startsWith('outbox:') || key.startsWith('outbox_dead:')) {
        const item = mmkvStorage.getObject<OutboxOp>(key);
        if (item && item.userId === currentUserId && item.entityId) {
          ids.add(item.entityId);
        }
      }
    }

    return ids;
  },
};


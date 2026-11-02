import { mmkvStorage } from './mmkv';

export const monthOf = (timestamp: number | string): string => {
  const ts = Number(timestamp) || Date.now();
  const d = new Date(ts);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const txShards = {
  loadAll(): any[] {
    const allKeys = mmkvStorage.getAllKeys();
    const shardKeys = allKeys.filter((k) => k.startsWith('tx:'));
    if (shardKeys.length === 0) {
      const legacy = mmkvStorage.getObject<any[]>('cache_transactions');
      if (Array.isArray(legacy) && legacy.length > 0) {
        return legacy;
      }
      return [];
    }

    const allTxs: any[] = [];
    for (const k of shardKeys) {
      const items = mmkvStorage.getObject<any[]>(k);
      if (Array.isArray(items)) {
        allTxs.push(...items);
      }
    }
    return allTxs.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  },

  saveAll(transactions: any[]): void {
    const grouped = new Map<string, any[]>();
    for (const tx of transactions) {
      if (!tx) continue;
      const m = monthOf(tx.timestamp);
      const list = grouped.get(m) ?? [];
      list.push(tx);
      grouped.set(m, list);
    }

    const activeShardKeys = new Set<string>();
    for (const [m, list] of grouped.entries()) {
      const key = `tx:${m}`;
      activeShardKeys.add(key);
      mmkvStorage.setObject(key, list);
    }

    const allKeys = mmkvStorage.getAllKeys();
    for (const k of allKeys) {
      if (k.startsWith('tx:') && !activeShardKeys.has(k)) {
        mmkvStorage.delete(k);
      }
    }
  },

  upsert(tx: any): void {
    if (!tx || !tx.id) return;
    const m = monthOf(tx.timestamp);
    const key = `tx:${m}`;
    const shard = mmkvStorage.getObject<any[]>(key) || [];
    const idx = shard.findIndex((t) => t.id === tx.id);
    if (idx >= 0) {
      shard[idx] = { ...shard[idx], ...tx };
    } else {
      shard.unshift(tx);
    }
    mmkvStorage.setObject(key, shard);
  },

  remove(id: string, timestamp?: number): void {
    if (!id) return;
    if (timestamp) {
      const m = monthOf(timestamp);
      const key = `tx:${m}`;
      const shard = mmkvStorage.getObject<any[]>(key);
      if (Array.isArray(shard)) {
        const filtered = shard.filter((t) => t.id !== id);
        if (filtered.length > 0) {
          mmkvStorage.setObject(key, filtered);
        } else {
          mmkvStorage.delete(key);
        }
        return;
      }
    }

    const allKeys = mmkvStorage.getAllKeys();
    for (const k of allKeys) {
      if (k.startsWith('tx:')) {
        const shard = mmkvStorage.getObject<any[]>(k);
        if (Array.isArray(shard)) {
          const filtered = shard.filter((t) => t.id !== id);
          if (filtered.length !== shard.length) {
            if (filtered.length > 0) {
              mmkvStorage.setObject(k, filtered);
            } else {
              mmkvStorage.delete(k);
            }
          }
        }
      }
    }
  },
};

export const incShards = {
  loadAll(): any[] {
    const allKeys = mmkvStorage.getAllKeys();
    const shardKeys = allKeys.filter((k) => k.startsWith('inc:'));
    if (shardKeys.length === 0) {
      const legacy = mmkvStorage.getObject<any[]>('cache_income_records');
      if (Array.isArray(legacy) && legacy.length > 0) {
        return legacy;
      }
      return [];
    }

    const allIncomes: any[] = [];
    for (const k of shardKeys) {
      const items = mmkvStorage.getObject<any[]>(k);
      if (Array.isArray(items)) {
        allIncomes.push(...items);
      }
    }
    return allIncomes.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
  },

  saveAll(incomeRecords: any[]): void {
    const grouped = new Map<string, any[]>();
    for (const inc of incomeRecords) {
      if (!inc) continue;
      const m = monthOf(inc.timestamp);
      const list = grouped.get(m) ?? [];
      list.push(inc);
      grouped.set(m, list);
    }

    const activeShardKeys = new Set<string>();
    for (const [m, list] of grouped.entries()) {
      const key = `inc:${m}`;
      activeShardKeys.add(key);
      mmkvStorage.setObject(key, list);
    }

    const allKeys = mmkvStorage.getAllKeys();
    for (const k of allKeys) {
      if (k.startsWith('inc:') && !activeShardKeys.has(k)) {
        mmkvStorage.delete(k);
      }
    }
  },

  upsert(inc: any): void {
    if (!inc || !inc.id) return;
    const m = monthOf(inc.timestamp);
    const key = `inc:${m}`;
    const shard = mmkvStorage.getObject<any[]>(key) || [];
    const idx = shard.findIndex((i) => i.id === inc.id);
    if (idx >= 0) {
      shard[idx] = { ...shard[idx], ...inc };
    } else {
      shard.unshift(inc);
    }
    mmkvStorage.setObject(key, shard);
  },

  remove(id: string, timestamp?: number): void {
    if (!id) return;
    if (timestamp) {
      const m = monthOf(timestamp);
      const key = `inc:${m}`;
      const shard = mmkvStorage.getObject<any[]>(key);
      if (Array.isArray(shard)) {
        const filtered = shard.filter((i) => i.id !== id);
        if (filtered.length > 0) {
          mmkvStorage.setObject(key, filtered);
        } else {
          mmkvStorage.delete(key);
        }
        return;
      }
    }

    const allKeys = mmkvStorage.getAllKeys();
    for (const k of allKeys) {
      if (k.startsWith('inc:')) {
        const shard = mmkvStorage.getObject<any[]>(k);
        if (Array.isArray(shard)) {
          const filtered = shard.filter((i) => i.id !== id);
          if (filtered.length !== shard.length) {
            if (filtered.length > 0) {
              mmkvStorage.setObject(k, filtered);
            } else {
              mmkvStorage.delete(k);
            }
          }
        }
      }
    }
  },
};

/**
 * One-time safe migration from single giant blobs to monthly partitioned shards.
 */
export const migrateBlobToShards = (): void => {
  const isMigrated = mmkvStorage.getBoolean('migration_shards_v1');
  if (isMigrated) return;

  try {
    const legacyTxs = mmkvStorage.getObject<any[]>('cache_transactions');
    if (Array.isArray(legacyTxs) && legacyTxs.length > 0) {
      txShards.saveAll(legacyTxs);
      mmkvStorage.delete('cache_transactions');
    }

    const legacyIncomes = mmkvStorage.getObject<any[]>('cache_income_records');
    if (Array.isArray(legacyIncomes) && legacyIncomes.length > 0) {
      incShards.saveAll(legacyIncomes);
      mmkvStorage.delete('cache_income_records');
    }

    mmkvStorage.setBoolean('migration_shards_v1', true);
  } catch (err: any) {
    console.warn('[Shards] Migration error:', err?.message || err);
  }
};


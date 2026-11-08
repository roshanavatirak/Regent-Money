// @nestjs/schedule ships ESM that this Jest setup can't load; the decorator isn't under test
jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));

import { TombstonePurgeService, PURGE_TARGETS, PURGE_BATCH_SIZE, buildPurgeSql } from './tombstone-purge.service';
import { ERASED_ROWS_TABLE, isErasedRow, setErasedRowsReady } from './erased-rows.util';

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

type Call = { sql: string; params: any[] };

const isSetup = (sql: string) => /CREATE (TABLE|INDEX)/.test(sql);
const isOrphanCleanup = (sql: string) => sql.includes(`DELETE FROM ${ERASED_ROWS_TABLE}`);
const purgeCalls = (calls: Call[]) => calls.filter((c) => !isSetup(c.sql) && !isOrphanCleanup(c.sql));

function makeService(responder: (sql: string, params: any[]) => any) {
  const calls: Call[] = [];
  const dataSource: any = {
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      if (isSetup(sql)) return [];
      return responder(sql, params);
    }),
  };
  const service = new TombstonePurgeService(dataSource);
  (service as any).logger = { error: jest.fn(), log: jest.fn() };
  return { service, calls, dataSource };
}

afterEach(() => setErasedRowsReady(false));

describe('buildPurgeSql', () => {
  it('only ever touches rows already marked deleted', () => {
    for (const t of PURGE_TARGETS) {
      const sql = buildPurgeSql(t);
      expect(sql).toContain('t.is_deleted = true');
      expect(sql).toMatch(/< \$1/);
      expect(sql).toContain('LIMIT $2');
      expect(sql).toContain('SELECT count(*)::int AS n FROM gone');
    }
  });

  it('uses $3 exactly where the SMS cutoff is declared', () => {
    for (const t of PURGE_TARGETS) {
      expect(buildPurgeSql(t).includes('$3')).toBe(!!t.usesSmsCutoff);
    }
  });

  it('keeps recent SMS tombstones so the scanner cannot re-add them', () => {
    const tx = PURGE_TARGETS.find((t) => t.table === 'finance.transactions')!;
    expect(buildPurgeSql(tx)).toContain('sms_id IS NULL AND content_id IS NULL');
  });

  it('records erased IDs in the same statement for tables apps write to by ID', () => {
    for (const table of [
      'finance.transactions',
      'finance.income_records',
      'wealth.savings_goals',
      'finance.budget_declarations',
      'core.bank_profiles',
    ]) {
      const t = PURGE_TARGETS.find((x) => x.table === table)!;
      expect(t.rememberIds).toBe(true);
      const sql = buildPurgeSql(t);
      expect(sql).toContain(`INSERT INTO ${ERASED_ROWS_TABLE}`);
      expect(sql).toContain(`SELECT '${table}', id::text, user_id::text`);
    }
  });

  it('erases children before the parents they point at', () => {
    const order = PURGE_TARGETS.map((t) => t.table);
    expect(order.indexOf('finance.transactions')).toBeLessThan(order.indexOf('core.bank_profiles'));
    expect(order.indexOf('finance.income_records')).toBeLessThan(order.indexOf('core.bank_profiles'));
    expect(order.indexOf('wealth.goal_history')).toBeLessThan(order.indexOf('wealth.savings_goals'));
  });
});

describe('TombstonePurgeService.purge', () => {
  it('passes a 30-day cutoff, plus a 60-day SMS cutoff only for SMS tables', async () => {
    const { service, calls } = makeService(() => [{ n: 0 }]);
    await service.purge(NOW);

    const purges = purgeCalls(calls);
    expect(purges).toHaveLength(PURGE_TARGETS.length);
    purges.forEach((c, i) => {
      if (PURGE_TARGETS[i].usesSmsCutoff) {
        expect(c.params).toEqual([String(NOW - 30 * DAY), PURGE_BATCH_SIZE, String(NOW - 60 * DAY)]);
      } else {
        expect(c.params).toEqual([String(NOW - 30 * DAY), PURGE_BATCH_SIZE]);
      }
    });
  });

  it('keeps deleting in batches until a batch comes back short', async () => {
    let txBatches = 0;
    const { service } = makeService((sql) => {
      if (sql.includes('finance.transactions t')) {
        txBatches++;
        return [{ n: txBatches < 3 ? PURGE_BATCH_SIZE : 5 }];
      }
      return [{ n: 0 }];
    });
    const counts = await service.purge(NOW);
    expect(txBatches).toBe(3);
    expect(counts['finance.transactions']).toBe(PURGE_BATCH_SIZE * 2 + 5);
  });

  it('carries on with other tables when one fails', async () => {
    const { service, calls } = makeService((sql) => {
      if (sql.includes('wealth.goal_history t')) throw new Error('boom');
      return [{ n: 1 }];
    });
    const counts = await service.purge(NOW);
    expect(purgeCalls(calls)).toHaveLength(PURGE_TARGETS.length);
    expect(counts['wealth.goal_history']).toBe(0);
    expect(counts['core.bank_profiles']).toBe(1);
  });

  it('never erases rows it cannot remember when the erased-IDs table is unavailable', async () => {
    const calls: Call[] = [];
    const dataSource: any = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        calls.push({ sql, params });
        if (isSetup(sql)) throw new Error('permission denied');
        return [{ n: 0 }];
      }),
    };
    const service = new TombstonePurgeService(dataSource);
    (service as any).logger = { error: jest.fn(), log: jest.fn() };
    await service.purge(NOW);

    const touched = purgeCalls(calls).map((c) => c.sql);
    for (const t of PURGE_TARGETS) {
      const ran = touched.some((s) => s.includes(`FROM ${t.table} t`));
      expect(ran).toBe(!t.rememberIds);
    }
    expect(calls.some((c) => isOrphanCleanup(c.sql))).toBe(false);
  });

  it('clears erased IDs of accounts that no longer exist', async () => {
    const { service, calls } = makeService((sql) => (isOrphanCleanup(sql) ? [{ n: 7 }] : [{ n: 0 }]));
    const counts = await service.purge(NOW);
    const cleanup = calls.find((c) => isOrphanCleanup(c.sql))!;
    expect(cleanup.sql).toContain('NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = e.user_id)');
    expect(counts[ERASED_ROWS_TABLE]).toBe(7);
  });

  it('does not start a second run while one is in progress', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const { service, calls } = makeService(async () => {
      await gate;
      return [{ n: 0 }];
    });
    const first = service.purge(NOW);
    expect(await service.purge(NOW)).toEqual({});
    release();
    await first;
    expect(purgeCalls(calls)).toHaveLength(PURGE_TARGETS.length);
  });
});

describe('isErasedRow', () => {
  it('finds an erased ID by table and ID', async () => {
    setErasedRowsReady(true);
    const db = { query: jest.fn(async () => [{ '?column?': 1 }]) };
    expect(await isErasedRow(db, 'finance.transactions', 'tx_manual_abc')).toBe(true);
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining(ERASED_ROWS_TABLE), [
      'finance.transactions',
      'tx_manual_abc',
    ]);
  });

  it('is false for an ID that was never erased', async () => {
    setErasedRowsReady(true);
    const db = { query: jest.fn(async () => []) };
    expect(await isErasedRow(db, 'finance.transactions', 'tx_manual_new')).toBe(false);
  });

  it('skips the lookup when there is no ID or the table is not ready', async () => {
    const db = { query: jest.fn(async () => [{}]) };
    setErasedRowsReady(true);
    expect(await isErasedRow(db, 'wealth.savings_goals', undefined)).toBe(false);
    setErasedRowsReady(false);
    expect(await isErasedRow(db, 'wealth.savings_goals', 'goal_1')).toBe(false);
    expect(db.query).not.toHaveBeenCalled();
  });
});

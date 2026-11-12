jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined, CronExpression: {} }));
jest.mock('pdf.js-extract', () => ({
  PDFExtract: class {
    extract = jest.fn();
  },
}));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

import { SyncService, DELTA_MAX_AGE_MS, DELTA_MAX_ROWS, DELTA_OVERLAP_MS } from './sync.service';

const NOW = 1_800_000_000_000;

/** A query builder that records its filters and returns the given rows. */
const qb = (rows: any[], seen: Record<string, any>) => {
  const b: any = {
    where: jest.fn((_sql: string, params: any) => {
      Object.assign(seen, params);
      return b;
    }),
    andWhere: jest.fn((sql: string, params: any) => {
      seen.sql = sql;
      Object.assign(seen, params);
      return b;
    }),
    take: jest.fn(() => b),
    getMany: jest.fn(async () => rows),
  };
  return b;
};

const makeService = (opts: { ready?: boolean; tx?: any[]; inc?: any[]; counts?: any; dbNow?: number | Error } = {}) => {
  const service = Object.create(SyncService.prototype) as SyncService;
  const seenTx: Record<string, any> = {};
  const seenInc: Record<string, any> = {};
  const any = service as any;
  any.deltaSyncReady = opts.ready !== false;
  any.logger = { warn: jest.fn(), debug: jest.fn(), log: jest.fn(), error: jest.fn() };
  any.dataSource = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('clock_timestamp')) {
        if (opts.dbNow instanceof Error) throw opts.dbNow;
        return [{ now: String(opts.dbNow ?? NOW) }];
      }
      return [opts.counts ?? { transactions: '10', income: '4' }];
    }),
  };
  any.transactionRepository = { createQueryBuilder: jest.fn(() => qb(opts.tx ?? [], seenTx)) };
  any.incomeRecordRepository = { createQueryBuilder: jest.fn(() => qb(opts.inc ?? [], seenInc)) };
  any.budgetDeclarationRepository = { find: jest.fn(async () => [{ id: 'b1' }]) };
  any.savingsGoalRepository = { find: jest.fn(async () => [{ id: 'g1' }]) };
  any.bankProfileRepository = { find: jest.fn(async () => [{ id: 'bank1', accountType: 'Savings', currentBalance: 500 }]) };
  any.budgetExclusionRepository = { find: jest.fn(async () => [{ transactionId: 't_excluded' }]) };
  any.fieldCipherService = {
    readTransactionDualRun: jest.fn(async (_u: string, tx: any) => ({ amount: 42, merchant: `dec:${tx.id}` })),
    readIncomeDualRun: jest.fn(async () => ({ amount: 900, source: 'Salary' })),
  };
  const fullSpy = jest.spyOn(service, 'sync').mockResolvedValue({ transactions: [{ id: 'everything' }] } as any);
  return { service, fullSpy, seenTx, seenInc };
};

describe('GET /sync: full data or only what changed', () => {
  it('an old app (no cursor) gets everything, with a cursor to use next time', async () => {
    const { service, fullSpy } = makeService();
    const out: any = await service.syncForClient('u1', undefined);
    expect(fullSpy).toHaveBeenCalledTimes(1);
    expect(out.delta).toBe(false);
    expect(out.cursor).toBe(NOW);
    expect(out.transactions).toEqual([{ id: 'everything' }]);
  });

  it('a recent cursor gets only the changed rows, re-reading the 2 minutes before it', async () => {
    const { service, fullSpy, seenTx, seenInc } = makeService({
      tx: [
        { id: 't_new', isDeleted: false, encAmount: Buffer.from('x') },
        { id: 't_excluded', isDeleted: false, encAmount: null, amount: 15 },
        { id: 't_gone', isDeleted: true, encAmount: Buffer.from('x') },
      ],
      inc: [
        { id: 'inc_new', isDeleted: false, encAmount: Buffer.from('x') },
        { id: 'inc_gone', isDeleted: true },
      ],
    });
    const since = NOW - 60_000;
    const out: any = await service.syncForClient('u1', String(since));

    expect(fullSpy).not.toHaveBeenCalled();
    expect(out.delta).toBe(true);
    expect(out.cursor).toBe(NOW);
    expect(seenTx.from).toBe(since - DELTA_OVERLAP_MS);
    expect(seenInc.from).toBe(since - DELTA_OVERLAP_MS);
    expect(seenTx.sql).toContain('server_changed_at'); // the server's stamp, never the phone's updated_at
    expect(seenTx.userId).toBe('u1');

    expect(out.transactions.map((t: any) => t.id)).toEqual(['t_new', 't_excluded']);
    expect(out.transactions[0]).toMatchObject({ amount: 42, merchant: 'dec:t_new', excludedFromBudget: false });
    expect(out.transactions[1]).toMatchObject({ amount: 15, excludedFromBudget: true });
    expect(out.deletedTransactionIds).toEqual(['t_gone']);
    expect(out.incomeRecords.map((i: any) => i.id)).toEqual(['inc_new']);
    expect(out.incomeRecords[0]).toMatchObject({ amount: 900, source: 'Salary' });
    expect(out.deletedIncomeIds).toEqual(['inc_gone']);

    // The small lists always come in full, and the totals let the phone verify itself
    expect(out.budgets).toEqual([{ id: 'b1' }]);
    expect(out.goals).toEqual([{ id: 'g1' }]);
    expect(out.bankProfiles).toHaveLength(1);
    expect(out.excludedTransactionIds).toEqual(['t_excluded']);
    expect(out.totals).toEqual({ transactions: 10, incomeRecords: 4 });
  });

  it('a cursor older than 25 days gets everything (deleted rows are erased after 30)', async () => {
    const { service, fullSpy } = makeService();
    const out: any = await service.syncForClient('u1', String(NOW - DELTA_MAX_AGE_MS - 1));
    expect(fullSpy).toHaveBeenCalledTimes(1);
    expect(out.delta).toBe(false);
  });

  it('a nonsense or future cursor gets everything', async () => {
    for (const since of ['abc', '12.5', '-5', String(NOW + 10 * 60_000)]) {
      const { service, fullSpy } = makeService();
      const out: any = await service.syncForClient('u1', since);
      expect(fullSpy).toHaveBeenCalledTimes(1);
      expect(out.delta).toBe(false);
    }
  });

  it('too many changed rows gets everything', async () => {
    const many = Array.from({ length: DELTA_MAX_ROWS + 1 }, (_, i) => ({ id: `t${i}`, isDeleted: false, encAmount: null }));
    const { service, fullSpy } = makeService({ tx: many });
    const out: any = await service.syncForClient('u1', String(NOW - 1000));
    expect(fullSpy).toHaveBeenCalledTimes(1);
    expect(out.delta).toBe(false);
  });

  it('falls back to the plain full sync when change tracking is not installed or the clock query fails', async () => {
    const off = makeService({ ready: false });
    expect(await off.service.syncForClient('u1', String(NOW - 1000))).toEqual({ transactions: [{ id: 'everything' }] });

    const broken = makeService({ dbNow: new Error('db down') });
    expect(await broken.service.syncForClient('u1', String(NOW - 1000))).toEqual({ transactions: [{ id: 'everything' }] });
  });

  it('if building the changed-only reply fails, the full data is sent instead', async () => {
    const { service, fullSpy } = makeService();
    (service as any).budgetDeclarationRepository.find = jest.fn(async () => {
      throw new Error('boom');
    });
    const out: any = await service.syncForClient('u1', String(NOW - 1000));
    expect(fullSpy).toHaveBeenCalledTimes(1);
    expect(out.delta).toBe(false);
  });
});

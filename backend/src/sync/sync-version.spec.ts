// @nestjs/schedule ships ESM that this Jest setup can't load; the decorator isn't under test
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_MIDNIGHT: '0 0 * * *' },
}));
jest.mock('pdf.js-extract', () => ({
  PDFExtract: class {
    extract = jest.fn();
  },
}));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {
    sendNotification = jest.fn();
    resolveNotification = jest.fn();
  },
}));

import { of, lastValueFrom } from 'rxjs';
import { SyncController, SYNC_ETAG_WINDOW_MS } from './sync.controller';
import { SyncVersionInterceptor } from './sync-version.interceptor';
import { SyncService } from './sync.service';

/** A tiny in-memory stand-in for Upstash's GET / SET / INCR. */
const fakeRedis = () => {
  const store = new Map<string, string>();
  return {
    store,
    executeCommand: jest.fn(async ([cmd, key, value, flag]: any[]) => {
      if (cmd === 'GET') return store.has(key) ? store.get(key) : null;
      if (cmd === 'SET') {
        if (flag === 'NX' && store.has(key)) return null;
        store.set(key, String(value));
        return 'OK';
      }
      if (cmd === 'INCR') {
        const n = Number(store.get(key) || 0) + 1;
        store.set(key, String(n));
        return n;
      }
      return null;
    }),
  };
};

/** Builds a SyncService with only the pieces the version logic touches. */
const makeService = (redis = fakeRedis()) => {
  const service = Object.create(SyncService.prototype) as SyncService;
  (service as any).redisService = redis;
  (service as any).logger = { warn: jest.fn(), debug: jest.fn(), log: jest.fn(), error: jest.fn() };
  return { service, redis };
};

/** Minimal Express response: records headers and the status code. */
const res = () => {
  const r: any = { headers: {} as Record<string, string>, code: 200 };
  r.setHeader = (k: string, v: string) => {
    r.headers[k] = v;
  };
  r.status = (s: number) => {
    r.code = s;
    return r;
  };
  return r;
};
const withStatus = (r: any) => r;

beforeEach(() => SyncService.resetSyncVersionsForTest());

describe('sync version', () => {
  it('starts from the current time, so a restarted server never repeats an old version', async () => {
    const { service } = makeService();
    const v = await service.getSyncVersion('u1');
    expect(Number(v)).toBeGreaterThan(1e12);
    expect(await service.getSyncVersion('u1')).toBe(v); // stable until something changes
  });

  it('changes on every bump, and only for that user', async () => {
    const { service } = makeService();
    const a = await service.getSyncVersion('u1');
    const other = await service.getSyncVersion('u2');
    await service.bumpSyncVersion('u1');
    const b = await service.getSyncVersion('u1');
    await service.invalidateUserSyncCache('u1');
    const c = await service.getSyncVersion('u1');
    expect(new Set([a, b, c]).size).toBe(3);
    expect(Number(c)).toBeGreaterThan(Number(b));
    expect(await service.getSyncVersion('u2')).toBe(other);
  });

  it('uses no Redis commands at all', async () => {
    const { service, redis } = makeService();
    await service.getSyncVersion('u1');
    await service.bumpSyncVersion('u1');
    await service.getSyncVersion('u1');
    expect(redis.executeCommand).not.toHaveBeenCalled();
  });

  it('after a restart (empty memory) every phone gets a version it has not seen', async () => {
    const { service } = makeService();
    await service.bumpSyncVersion('u1');
    const before = await service.getSyncVersion('u1');
    SyncService.resetSyncVersionsForTest();
    await new Promise((r) => setTimeout(r, 2));
    expect(Number(await service.getSyncVersion('u1'))).toBeGreaterThan(Number(before));
  });
});

describe('GET /sync with "nothing changed" replies', () => {
  const setup = () => {
    const { service } = makeService();
    const syncSpy = jest.spyOn(service, 'sync').mockResolvedValue({ transactions: [{ id: 't1' }] } as any);
    const controller = new SyncController(service);
    return { service, controller, syncSpy };
  };

  it('sends the data with an ETag the first time', async () => {
    const { controller, syncSpy } = setup();
    const r = withStatus(res());
    const body = await controller.getSyncData({ user: { id: 'u1' }, headers: {} }, r);
    expect(body).toEqual({ transactions: [{ id: 't1' }] });
    expect(r.headers.ETag).toMatch(/^"\d+-\d+"$/);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  it('replies 304 without touching the database when the phone has the latest version', async () => {
    const { controller, syncSpy } = setup();
    const first = withStatus(res());
    await controller.getSyncData({ user: { id: 'u1' }, headers: {} }, first);

    const second = withStatus(res());
    const body = await controller.getSyncData({ user: { id: 'u1' }, headers: { 'if-none-match': first.headers.ETag } }, second);
    expect(second.code).toBe(304);
    expect(body).toBeUndefined();
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });

  it('sends everything again after a change', async () => {
    const { controller, service, syncSpy } = setup();
    const first = withStatus(res());
    await controller.getSyncData({ user: { id: 'u1' }, headers: {} }, first);
    await service.bumpSyncVersion('u1');

    const second = withStatus(res());
    await controller.getSyncData({ user: { id: 'u1' }, headers: { 'if-none-match': first.headers.ETag } }, second);
    expect(second.code).toBe(200);
    expect(syncSpy).toHaveBeenCalledTimes(2);
    expect(second.headers.ETag).not.toBe(first.headers.ETag);
  });

  it('sends everything again once the 15-minute window passes, even with no change', async () => {
    const { controller, syncSpy } = setup();
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_800_000_000_000);
    const first = withStatus(res());
    await controller.getSyncData({ user: { id: 'u1' }, headers: {} }, first);

    now.mockReturnValue(1_800_000_000_000 + SYNC_ETAG_WINDOW_MS);
    const second = withStatus(res());
    await controller.getSyncData({ user: { id: 'u1' }, headers: { 'if-none-match': first.headers.ETag } }, second);
    expect(second.code).toBe(200);
    expect(syncSpy).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});

describe('SyncVersionInterceptor', () => {
  const ctx = (method: string, userId?: string) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ method, user: userId ? { id: userId } : undefined }) }) }) as any;

  it('bumps the version after a successful write, before the reply is sent', async () => {
    const bump = jest.fn().mockResolvedValue(undefined);
    const interceptor = new SyncVersionInterceptor({ bumpSyncVersion: bump } as any);
    const out = await lastValueFrom(interceptor.intercept(ctx('POST', 'u1'), { handle: () => of({ ok: true }) }));
    expect(out).toEqual({ ok: true });
    expect(bump).toHaveBeenCalledWith('u1');
  });

  it('does nothing on reads', async () => {
    const bump = jest.fn();
    const interceptor = new SyncVersionInterceptor({ bumpSyncVersion: bump } as any);
    await lastValueFrom(interceptor.intercept(ctx('GET', 'u1'), { handle: () => of({}) }));
    expect(bump).not.toHaveBeenCalled();
  });
});

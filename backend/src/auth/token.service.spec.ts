// @nestjs/schedule ships ESM that this Jest setup can't load; the decorator isn't under test
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_3AM: '0 3 * * *' },
}));

import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import {
  TokenService,
  hashToken,
  REFRESH_GRACE_MS,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TTL_REMEMBER_MS,
  REFRESH_TTL_SESSION_MS,
} from './token.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ALLOW_INGEST_TOKEN } from './allow-ingest-token.decorator';

const jwt = new JwtService({ secret: 'test-secret' });

/** In-memory refresh_tokens table + a users table the service queries with SQL. */
const setup = (userOverrides: Record<string, any> = {}) => {
  const rows = new Map<string, any>();
  const users: Record<string, any> = {
    u1: { id: 'u1', email: 'a@b.c', role: 'user', is_banned: false, is_deleted: false, tokens_valid_after: null, ...userOverrides },
  };
  const matches = (row: any, where: any) =>
    Object.entries(where).every(([k, v]: any) => (v && v._type === 'isNull' ? row[k] == null : row[k] === v));
  const repo: any = {
    query: jest.fn(async (sql: string, params: any[]) => {
      if (sql.includes('FROM core.users')) return users[params[0]] ? [users[params[0]]] : [];
      if (sql.includes('FROM core.refresh_tokens rt')) {
        const [familyId, userId, now] = params;
        const u = users[userId];
        const live = [...rows.values()].some(
          (r) => r.familyId === familyId && r.userId === userId && r.revokedAt == null && r.expiresAt > now,
        );
        return live && u && !u.is_banned && !u.is_deleted ? [{ '?column?': 1 }] : [];
      }
      return [];
    }),
    create: (d: any) => ({ ...d }),
    save: jest.fn(async (r: any) => {
      rows.set(r.id, { ...r });
      return r;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      const r = [...rows.values()].find((x) => matches(x, where));
      return r ? { ...r } : null;
    }),
    update: jest.fn(async (where: any, changes: any) => {
      for (const r of rows.values()) if (matches(r, where)) Object.assign(r, changes);
    }),
  };
  const redis: any = { executeCommand: jest.fn(async () => null) };
  const service = new TokenService(repo, jwt, redis);
  return { service, rows, users, repo };
};

const user = { id: 'u1', email: 'a@b.c', role: 'user' };

describe('TokenService', () => {
  it('issues a 15-minute access token, a refresh token and an SMS-only token', async () => {
    const { service, rows } = setup();
    const pair = await service.issuePair(user);
    const access = jwt.decode(pair.accessToken) as any;
    const ingest = jwt.decode(pair.ingestToken) as any;
    expect(access.typ).toBe('access');
    expect(access.exp - access.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(ingest.typ).toBe('ingest');
    expect(ingest.fid).toBe(access.fid);
    expect(pair.expiresIn).toBe(ACCESS_TOKEN_TTL_SECONDS);
    // Only the hash is stored
    const stored = [...rows.values()][0];
    expect(stored.tokenHash).toBe(hashToken(pair.refreshToken));
    expect(JSON.stringify(stored)).not.toContain(pair.refreshToken);
  });

  it('"Stay logged in" gives 30 days, otherwise 1 day', async () => {
    const { service, rows } = setup();
    await service.issuePair(user, { remember: true });
    await service.issuePair(user, { remember: false });
    const [a, b] = [...rows.values()];
    expect(Math.round((a.expiresAt - a.createdAt) / 1000)).toBe(REFRESH_TTL_REMEMBER_MS / 1000);
    expect(Math.round((b.expiresAt - b.createdAt) / 1000)).toBe(REFRESH_TTL_SESSION_MS / 1000);
  });

  it('refresh rotates the token and keeps the same device session', async () => {
    const { service } = setup();
    const first = await service.issuePair(user);
    const second = await service.refresh(first.refreshToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect((jwt.decode(second.accessToken) as any).fid).toBe((jwt.decode(first.accessToken) as any).fid);
    // The new one works
    await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
  });

  it('accepts the previous token again within the 30-second grace period', async () => {
    const { service } = setup();
    const first = await service.issuePair(user);
    await service.refresh(first.refreshToken);
    await expect(service.refresh(first.refreshToken)).resolves.toBeDefined();
  });

  it('reusing an old token after the grace period logs that device out', async () => {
    const { service, rows } = setup();
    const first = await service.issuePair(user);
    const second = await service.refresh(first.refreshToken);
    const old = [...rows.values()].find((r) => r.tokenHash === hashToken(first.refreshToken));
    old.replacedAt = Date.now() - REFRESH_GRACE_MS - 1000;

    await expect(service.refresh(first.refreshToken)).rejects.toMatchObject({ response: { code: 'SESSION_REVOKED' } });
    // The whole device session is cancelled, including the newest token
    await expect(service.refresh(second.refreshToken)).rejects.toMatchObject({ response: { code: 'SESSION_REVOKED' } });
  });

  it('refuses unknown and expired tokens', async () => {
    const { service, rows } = setup();
    await expect(service.refresh('nope')).rejects.toMatchObject({ response: { code: 'SESSION_INVALID' } });
    const pair = await service.issuePair(user);
    [...rows.values()][0].expiresAt = Date.now() - 1;
    await expect(service.refresh(pair.refreshToken)).rejects.toMatchObject({ response: { code: 'SESSION_EXPIRED' } });
  });

  it('a banned or deleted account cannot refresh', async () => {
    for (const flag of ['is_banned', 'is_deleted']) {
      const { service, users } = setup();
      const pair = await service.issuePair(user);
      users.u1[flag] = true;
      await expect(service.refresh(pair.refreshToken)).rejects.toMatchObject({ response: { code: 'SESSION_REVOKED' } });
    }
  });

  it('logging out one device leaves the other device working', async () => {
    const { service } = setup();
    const phoneA = await service.issuePair(user);
    const phoneB = await service.issuePair(user);
    await service.logoutDevice({ refreshToken: phoneA.refreshToken });
    await expect(service.refresh(phoneA.refreshToken)).rejects.toBeDefined();
    await expect(service.refresh(phoneB.refreshToken)).resolves.toBeDefined();
  });

  it('logging out blacklists that device\'s current access token straight away', async () => {
    const { service } = setup();
    const pair = await service.issuePair(user);
    const access = jwt.decode(pair.accessToken) as any;
    expect(service.isAccessDenied(access)).toBe(false);
    await service.logoutDevice({ familyId: access.fid, jti: access.jti, accessExp: access.exp });
    expect(service.isAccessDenied(access)).toBe(true);
  });

  it('ban / log out everywhere: every session stops at once, new logins still work', async () => {
    const { service } = setup();
    const a = await service.issuePair(user);
    const oldAccess = jwt.decode(a.accessToken) as any;
    oldAccess.iat -= 5; // issued a few seconds ago
    await service.revokeAllForUser('u1');
    expect(service.isAccessDenied(oldAccess)).toBe(true);
    await expect(service.refresh(a.refreshToken)).rejects.toBeDefined();
    expect(service.isAccessDenied({ sub: 'u1', iat: Math.floor(Date.now() / 1000) + 2 })).toBe(false);
  });

  it('the SMS-only token works only while its device session is alive', async () => {
    const { service } = setup();
    const pair = await service.issuePair(user);
    const fid = (jwt.decode(pair.ingestToken) as any).fid;
    expect(await service.isIngestSessionAlive('u1', fid)).toBe(true);
    await service.logoutDevice({ familyId: fid });
    expect(await service.isIngestSessionAlive('u1', fid)).toBe(false);
  });
});

describe('JwtAuthGuard with the new tokens', () => {
  const makeGuard = (service: TokenService, allowIngest = false) => {
    const reflector = { getAllAndOverride: (key: string) => (key === ALLOW_INGEST_TOKEN ? allowIngest : undefined) } as unknown as Reflector;
    const redis: any = { get: jest.fn(), set: jest.fn() };
    const dataSource: any = { query: jest.fn() };
    return { guard: new JwtAuthGuard(jwt, redis, dataSource, service, reflector), redis, dataSource };
  };
  const ctx = (token: string) => {
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    return { req, context: { switchToHttp: () => ({ getRequest: () => req }), getHandler: () => null, getClass: () => null } as any };
  };

  it('accepts an access token without touching Redis or the database', async () => {
    const { service } = setup();
    const pair = await service.issuePair(user);
    const { guard, redis, dataSource } = makeGuard(service);
    const { req, context } = ctx(pair.accessToken);
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user.id).toBe('u1');
    expect(redis.get).not.toHaveBeenCalled();
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('says TOKEN_EXPIRED for an expired access token, so the app refreshes', async () => {
    const { service } = setup();
    const expired = jwt.sign({ sub: 'u1', typ: 'access', jti: 'x' }, { expiresIn: -10 });
    const { guard } = makeGuard(service);
    await expect(guard.canActivate(ctx(expired).context)).rejects.toMatchObject({ response: { code: 'TOKEN_EXPIRED' } });
  });

  it('refuses the SMS-only token everywhere except the SMS route', async () => {
    const { service } = setup();
    const pair = await service.issuePair(user);
    await expect(makeGuard(service, false).guard.canActivate(ctx(pair.ingestToken).context)).rejects.toBeDefined();
    await expect(makeGuard(service, true).guard.canActivate(ctx(pair.ingestToken).context)).resolves.toBe(true);
  });
});

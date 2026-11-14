// email-broadcast.service (imported for extractQueryRows) pulls in @nestjs/schedule, which ships ESM this Jest setup can't load
jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined, CronExpression: {} }));
import { buildWelcomeEmail, WelcomeEmailService, PLAY_STORE_URL, Q, msUntilQuotaReset } from './welcome-email.service';

/** In-memory stand-in for the Redis commands the queue uses. */
class FakeRedis {
  strings = new Map<string, string>();
  lists = new Map<string, string[]>();
  zsets = new Map<string, Map<string, number>>();
  private list(k: string) {
    if (!this.lists.has(k)) this.lists.set(k, []);
    return this.lists.get(k)!;
  }
  private zset(k: string) {
    if (!this.zsets.has(k)) this.zsets.set(k, new Map());
    return this.zsets.get(k)!;
  }
  async cmd(name: string, ...a: any[]): Promise<any> {
    a = a.map(String);
    switch (name) {
      case 'SET':
        if (this.strings.has(a[0])) return null;
        this.strings.set(a[0], a[1]);
        return 'OK';
      case 'LPUSH':
        this.list(a[0]).unshift(a[1]);
        return this.list(a[0]).length;
      case 'RPUSH':
        this.list(a[0]).push(a[1]);
        return this.list(a[0]).length;
      case 'LMOVE': {
        const src = this.list(a[0]);
        if (!src.length) return null;
        const v = a[2] === 'RIGHT' ? src.pop()! : src.shift()!;
        if (a[3] === 'LEFT') this.list(a[1]).unshift(v);
        else this.list(a[1]).push(v);
        return v;
      }
      case 'LREM': {
        const l = this.list(a[0]);
        const i = l.indexOf(a[2]);
        if (i >= 0) l.splice(i, 1);
        return i >= 0 ? 1 : 0;
      }
      case 'LLEN':
        return this.list(a[0]).length;
      case 'ZADD':
        this.zset(a[0]).set(a[2], Number(a[1]));
        return 1;
      case 'ZREM':
        return this.zset(a[0]).delete(a[1]) ? 1 : 0;
      case 'ZCARD':
        return this.zset(a[0]).size;
      case 'ZRANGEBYSCORE':
        return [...this.zset(a[0])].filter(([, s]) => s <= Number(a[2])).map(([m]) => m);
      case 'ZRANGE': {
        const first = [...this.zset(a[0])].sort((x, y) => x[1] - y[1])[0];
        return first ? [first[0], String(first[1])] : [];
      }
    }
    throw new Error(`unexpected ${name}`);
  }
}

function setup(opts: { send?: any; userOk?: boolean; left?: number } = {}) {
  const redis = new FakeRedis();
  const sends: string[] = [];
  const accounts: any = {
    getChain: jest.fn(async () => [{ account: 'welcome', left: opts.left ?? 300 }]),
    getLegalLinks: jest.fn(async () => ({ termsUrl: null, privacyUrl: null })),
    sendWithFallback: jest.fn(async (_p: string, o: any) => {
      sends.push(o.toEmail);
      return opts.send ?? { success: true, messageId: 'm1', account: 'welcome' };
    }),
  };
  const ds: any = {
    query: jest.fn(async () => [{ email: 'a@example.com', name: 'Asha Rao', ok: opts.userOk ?? true }]),
  };
  const mail: any = { logEmailSent: jest.fn(async () => undefined) };
  const svc = new WelcomeEmailService({ get: () => undefined } as any, ds, accounts, mail);
  (svc as any).redis = redis;
  const settle = async () => {
    for (let i = 0; i < 50 && ((svc as any).draining || i < 3); i++) await new Promise((r) => setImmediate(r));
  };
  return { svc, redis, sends, accounts, settle };
}

describe('welcome email', () => {
  afterEach(() => jest.clearAllTimers());

  it('uses the shared layout, the first name, and escapes it', () => {
    const m = buildWelcomeEmail({ name: '<b>Asha</b> Rao', logoUrl: 'https://x/logo.png', privacyUrl: 'https://x/privacy' });
    expect(m.subject).toBe('Thanks for joining Regent Money, <b>Asha</b>');
    expect(m.html).toContain('Thanks for joining, &lt;b&gt;Asha&lt;/b&gt;');
    expect(m.html).not.toContain('<b>Asha</b>');
    expect(m.html).toContain(PLAY_STORE_URL);
    expect(m.html).toContain('RAO DEV STUDIOS');
    expect(m.text).toContain('Hi <b>Asha</b>,');
  });

  it('falls back to "there" without a name', () => {
    expect(buildWelcomeEmail({ name: '', logoUrl: 'l' }).subject).toBe('Thanks for joining Regent Money, there');
  });

  it('sends right away, once per user, and leaves nothing in the queue', async () => {
    const { svc, redis, sends, settle } = setup();
    await svc.schedule({ id: 'u1', email: ' A@Example.com ', name: 'A' }, 'google');
    await settle();
    await svc.schedule({ id: 'u1', email: 'a@example.com' }, 'google');
    await settle();
    expect(sends).toEqual(['a@example.com']);
    expect(redis.lists.get(Q.queue)).toEqual([]);
    expect(redis.lists.get(Q.processing)).toEqual([]);
  });

  it('keeps the job at the front of the queue when every account is full', async () => {
    const { svc, redis, settle } = setup({ send: { success: false, isQuotaError: true, account: 'welcome' } });
    await svc.schedule({ id: 'u1', email: 'a@example.com' }, 'email_verified');
    await settle();
    expect(redis.lists.get(Q.queue)).toHaveLength(1);
    expect(redis.lists.get(Q.processing)).toEqual([]);
    expect((svc as any).wakeTimer).not.toBeNull();
  });

  it('does not touch the queue at all when our count says every account is full', async () => {
    const { svc, redis, sends, settle } = setup({ left: 0 });
    await svc.schedule({ id: 'u1', email: 'a@example.com' }, 'google');
    await settle();
    expect(sends).toEqual([]);
    expect(redis.lists.get(Q.queue)).toHaveLength(1);
  });

  it('moves a failed send to the retry set with one more attempt', async () => {
    const { svc, redis, settle } = setup({ send: { success: false, errorMessage: 'Brevo error 500', account: 'welcome' } });
    await svc.schedule({ id: 'u1', email: 'a@example.com' }, 'google');
    await settle();
    const retry = [...redis.zsets.get(Q.retry)!.keys()];
    expect(retry).toHaveLength(1);
    expect(JSON.parse(retry[0]).attempts).toBe(1);
    expect(redis.lists.get(Q.queue)).toEqual([]);
  });

  it('skips users who are no longer eligible', async () => {
    const { svc, redis, sends, settle } = setup({ userOk: false });
    await svc.schedule({ id: 'u1', email: 'a@example.com' }, 'google');
    await settle();
    expect(sends).toEqual([]);
    expect(redis.lists.get(Q.processing)).toEqual([]);
  });

  it('on startup, sends jobs a restart left mid-send', async () => {
    const { svc, redis, sends, settle } = setup();
    const job = { userId: 'u9', email: 'a@example.com', name: null, source: 'google', attempts: 0, queuedAt: Date.now() };
    await redis.cmd('LPUSH', Q.processing, JSON.stringify(job));
    await svc.onModuleInit();
    await settle();
    expect(sends).toEqual(['a@example.com']);
    expect(redis.lists.get(Q.processing)).toEqual([]);
  });

  it('never throws from schedule, even when Redis is down', async () => {
    const { svc } = setup();
    (svc as any).redis = { cmd: async () => { throw new Error('down'); } };
    await expect(svc.schedule({ id: 'u2', email: 'b@x.com' }, 'email_verified')).resolves.toBeUndefined();
    await expect(svc.schedule({ id: 'u3', email: null }, 'google')).resolves.toBeUndefined();
  });

  it('waits until just after the UTC day resets', () => {
    const now = Date.UTC(2026, 10, 14, 23, 0, 0);
    expect(msUntilQuotaReset(now)).toBe(62 * 60_000);
  });
});

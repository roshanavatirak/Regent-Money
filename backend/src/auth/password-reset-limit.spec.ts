import {
  claimResetSlot,
  RESET_REQUEST_REPLY,
  RESET_FIRST_COOLDOWN_SECONDS,
  RESET_DAY_COOLDOWN_SECONDS,
  RedisCommander,
} from './password-reset-limit';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Minimal Upstash-like store: SET NX returns null when the key exists, TTL returns -2 when missing. */
function fakeRedis() {
  const store = new Map<string, { value: string; expiresAt: number }>();
  let now = 0;
  const live = (k: string) => {
    const e = store.get(k);
    if (e && e.expiresAt <= now) store.delete(k);
    return store.get(k);
  };
  const redis: RedisCommander = {
    async executeCommand(cmd) {
      const [op, key, ...rest] = cmd as any[];
      switch (op) {
        case 'SET': {
          if (rest.includes('NX') && live(key)) return null;
          const ex = Number(rest[rest.indexOf('EX') + 1]);
          store.set(key, { value: String(rest[0]), expiresAt: now + ex * 1000 });
          return 'OK';
        }
        case 'GET':
          return live(key)?.value ?? null;
        case 'DEL':
          return store.delete(key) ? 1 : 0;
        case 'TTL': {
          const e = live(key);
          if (!e) return -2;
          return e.expiresAt === Infinity ? -1 : Math.ceil((e.expiresAt - now) / 1000);
        }
        case 'INCR': {
          const e = live(key);
          const n = (e ? Number(e.value) : 0) + 1;
          store.set(key, { value: String(n), expiresAt: e?.expiresAt ?? Infinity });
          return n;
        }
        case 'DECR': {
          const e = live(key);
          const n = (e ? Number(e.value) : 0) - 1;
          store.set(key, { value: String(n), expiresAt: e?.expiresAt ?? Infinity });
          return n;
        }
        case 'EXPIRE': {
          const e = live(key);
          if (e) e.expiresAt = now + Number(rest[0]) * 1000;
          return e ? 1 : 0;
        }
      }
      throw new Error(`unexpected ${op}`);
    },
  };
  return { redis, advance: (ms: number) => (now += ms) };
}

describe('password reset limits', () => {
  it('3 emails, a 2-hour cooldown, emails 4 to 6, then a 1-day cooldown, then it resets', async () => {
    const { redis, advance } = fakeRedis();
    const ask = () => claimResetSlot(redis, 'u1');

    for (let i = 1; i <= 3; i++) expect(await ask()).toEqual({ allowed: true });

    // Right after the 3rd: 2-hour cooldown
    expect(await ask()).toEqual({ allowed: false, reason: 'cooldown', retryAfterSeconds: RESET_FIRST_COOLDOWN_SECONDS });
    advance(1 * HOUR);
    expect(await ask()).toMatchObject({ allowed: false, reason: 'cooldown' });

    advance(1 * HOUR);
    for (let i = 4; i <= 6; i++) expect(await ask()).toEqual({ allowed: true });

    // After the 6th: 1-day cooldown
    expect(await ask()).toEqual({ allowed: false, reason: 'day_lock', retryAfterSeconds: RESET_DAY_COOLDOWN_SECONDS });
    advance(23 * HOUR);
    expect(await ask()).toMatchObject({ allowed: false, reason: 'day_lock' });

    // A day later it starts over: 3 more, then the 2-hour cooldown
    advance(1 * HOUR);
    for (let i = 1; i <= 3; i++) expect(await ask()).toEqual({ allowed: true });
    expect(await ask()).toMatchObject({ allowed: false, reason: 'cooldown' });
  });

  it('refused requests do not use up the day', async () => {
    const { redis, advance } = fakeRedis();
    for (let i = 1; i <= 3; i++) await claimResetSlot(redis, 'u1');
    for (let i = 0; i < 10; i++) expect(await claimResetSlot(redis, 'u1')).toMatchObject({ allowed: false });
    advance(2 * HOUR);
    for (let i = 4; i <= 6; i++) expect(await claimResetSlot(redis, 'u1')).toEqual({ allowed: true });
  });

  it('the count resets a day after the first email', async () => {
    const { redis, advance } = fakeRedis();
    expect(await claimResetSlot(redis, 'u1')).toEqual({ allowed: true });
    expect(await claimResetSlot(redis, 'u1')).toEqual({ allowed: true });
    advance(25 * HOUR);
    for (let i = 1; i <= 3; i++) expect(await claimResetSlot(redis, 'u1')).toEqual({ allowed: true });
    expect(await claimResetSlot(redis, 'u1')).toMatchObject({ allowed: false, reason: 'cooldown' });
  });

  it('counts each account separately', async () => {
    const { redis } = fakeRedis();
    for (let i = 1; i <= 3; i++) await claimResetSlot(redis, 'u1');
    expect(await claimResetSlot(redis, 'u2')).toEqual({ allowed: true });
  });

  it('does not lock people out when Redis is unreachable', async () => {
    const down: RedisCommander = { executeCommand: async () => null };
    expect(await claimResetSlot(down, 'u1')).toEqual({ allowed: true });
  });

  it('uses one reply that says nothing about whether the account exists', () => {
    expect(RESET_REQUEST_REPLY).toMatch(/^If an account exists/);
  });
});

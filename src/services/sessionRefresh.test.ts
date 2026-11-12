import assert from 'node:assert';
import { test, beforeEach } from 'node:test';
import { tokenStore } from './tokenStore.ts';
import { installAuthFetch, refreshSession, setSessionEndedHandler } from './sessionRefresh.ts';
import { getBackendUrl } from '../config/api.ts';

const API = getBackendUrl().replace(/\/+$/, '');

type Call = { url: string; auth: string | null; body?: any };
let calls: Call[] = [];
let handler: (url: string, init: any) => Promise<Response> = async () => new Response('{}');

// The wrapper is installed once on top of this fake network
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  const headers = new Headers(init?.headers);
  calls.push({ url, auth: headers.get('Authorization'), body: init?.body ? JSON.parse(init.body) : undefined });
  return handler(url, init);
}) as any;
installAuthFetch();

const json = (status: number, body: any) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let sessionEnded = 0;
setSessionEndedHandler(() => {
  sessionEnded++;
});

beforeEach(() => {
  calls = [];
  sessionEnded = 0;
  tokenStore.clearAccessToken();
});

test('a token about to expire is refreshed before the request, then the new token is sent', async () => {
  tokenStore.setSession({ accessToken: 'old', refreshToken: 'r1', expiresIn: 30 }); // 30 s left
  handler = async (url) =>
    url.endsWith('/auth/refresh')
      ? json(200, { accessToken: 'new', refreshToken: 'r2', expiresIn: 900, ingestToken: 'i2' })
      : json(200, { ok: true });

  const res = await fetch(`${API}/sync`, { headers: { Authorization: 'Bearer old' } });
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(
    calls.map((c) => c.url.replace(API, '')),
    ['/auth/refresh', '/sync'],
  );
  assert.strictEqual(calls[1].auth, 'Bearer new');
  assert.strictEqual(tokenStore.getRefreshToken(), 'r2');
});

test('five requests at once with an expiring token cause exactly one refresh', async () => {
  tokenStore.setSession({ accessToken: 'old', refreshToken: 'r1', expiresIn: 10 });
  let refreshes = 0;
  handler = async (url) => {
    if (url.endsWith('/auth/refresh')) {
      refreshes++;
      await new Promise((r) => setTimeout(r, 20));
      return json(200, { accessToken: 'new', refreshToken: 'r2', expiresIn: 900 });
    }
    return json(200, {});
  };
  await Promise.all([1, 2, 3, 4, 5].map((i) => fetch(`${API}/x/${i}`, { headers: { Authorization: 'Bearer old' } })));
  assert.strictEqual(refreshes, 1);
  assert.ok(calls.filter((c) => !c.url.endsWith('/auth/refresh')).every((c) => c.auth === 'Bearer new'));
});

test('a TOKEN_EXPIRED reply is refreshed and the request sent once more', async () => {
  tokenStore.setSession({ accessToken: 'stale', refreshToken: 'r1', expiresIn: 900 });
  let first = true;
  handler = async (url, init) => {
    if (url.endsWith('/auth/refresh')) return json(200, { accessToken: 'fresh', refreshToken: 'r2', expiresIn: 900 });
    const auth = new Headers(init?.headers).get('Authorization');
    if (first && auth === 'Bearer stale') {
      first = false;
      return json(401, { code: 'TOKEN_EXPIRED' });
    }
    return json(200, { ok: true });
  };
  const res = await fetch(`${API}/goals`, { headers: { Authorization: 'Bearer stale' } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(calls.at(-1)!.auth, 'Bearer fresh');
});

test('a refused refresh ends the session', async () => {
  tokenStore.setSession({ accessToken: 'old', refreshToken: 'gone', expiresIn: 5 });
  handler = async (url) => (url.endsWith('/auth/refresh') ? json(401, { code: 'SESSION_REVOKED' }) : json(200, {}));
  const result = await refreshSession();
  assert.strictEqual(result, 'ended');
  assert.strictEqual(sessionEnded, 1);
});

test('no network during refresh keeps the session', async () => {
  tokenStore.setSession({ accessToken: 'old', refreshToken: 'r1', expiresIn: 5 });
  handler = async (url) => {
    if (url.endsWith('/auth/refresh')) throw new Error('Network request failed');
    return json(200, {});
  };
  assert.strictEqual(await refreshSession(), 'offline');
  assert.strictEqual(sessionEnded, 0);
  assert.strictEqual(tokenStore.getRefreshToken(), 'r1');
});

test('requests without a token, and old 30-day sessions, are left alone', async () => {
  handler = async () => json(200, {});
  await fetch(`${API}/auth/login`, { method: 'POST' });
  tokenStore.setAccessToken('legacy'); // no refresh token
  await fetch(`${API}/sync`, { headers: { Authorization: 'Bearer legacy' } });
  assert.deepStrictEqual(
    calls.map((c) => c.url.replace(API, '')),
    ['/auth/login', '/sync'],
  );
});

test('a request to another site is never touched', async () => {
  tokenStore.setSession({ accessToken: 'old', refreshToken: 'r1', expiresIn: 5 });
  handler = async () => json(200, {});
  await fetch('https://example.com/data', { headers: { Authorization: 'Bearer other' } });
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0].auth, 'Bearer other');
});

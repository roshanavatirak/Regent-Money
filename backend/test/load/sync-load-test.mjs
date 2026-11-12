// backend/test/load/sync-load-test.mjs
//
// Load test for the sync API. It behaves like many phones with the app open: each "phone"
// asks the server "anything new?" every few seconds, sometimes pulls changes, and (only if
// you turn it on) sometimes saves a transaction.
//
// It needs no extra packages. Run it from the backend folder:
//
//   LOAD_URL=http://localhost:3000 LOAD_USER_IDS_FILE=users.txt JWT_SECRET=... npm run test:load
//
// Settings (environment variables):
//   LOAD_URL             required. The server to test, e.g. http://localhost:3000
//   LOAD_USERS           how many phones at once (default 50, max 500)
//   LOAD_DURATION        seconds to run (default 60)
//   LOAD_WRITES          "1" to also save test transactions (default off; see warning below)
//   LOAD_THINK_MIN_MS    shortest pause between one phone's requests (default 1500)
//   LOAD_THINK_MAX_MS    longest pause (default 4000)
//
// Who the phones are (one of these two):
//   LOAD_TOKENS_FILE     a text file with one access token per line (from real logins), or
//   LOAD_USER_IDS_FILE   a text file with one user id per line, plus JWT_SECRET (the server's
//                        secret) so the script can sign 15-minute access tokens for them
//
// Things to know:
//   - Use test accounts. With LOAD_WRITES=1 the script ADDS manual transactions named
//     "Load test" to those accounts (with no bank account attached, so balances don't move).
//   - The server allows 60 requests a minute per user. Keep the pauses above 1 second and use
//     at least as many user ids as phones, or you will mostly be measuring "429 too many requests".
//   - It reports speed and errors. It cannot see the server's memory or your Redis usage:
//     watch the Render and Upstash dashboards while it runs.

import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const env = process.env;
const BASE_URL = (env.LOAD_URL || '').replace(/\/+$/, '');
const USERS = Math.min(500, Math.max(1, Number(env.LOAD_USERS) || 50));
const DURATION_S = Math.max(5, Number(env.LOAD_DURATION) || 60);
const WRITES = env.LOAD_WRITES === '1';
const THINK_MIN = Math.max(0, Number(env.LOAD_THINK_MIN_MS) || 1500);
const THINK_MAX = Math.max(THINK_MIN, Number(env.LOAD_THINK_MAX_MS) || 4000);
const REQUEST_TIMEOUT_MS = 30_000;

// What a phone does on each turn (must add up to 1). Writes are folded into "check" when off.
const MIX = { check: 0.85, changes: 0.12, write: 0.03 };

const fail = (message) => {
  console.error(`\n${message}\n`);
  process.exit(1);
};

if (!BASE_URL) fail('Set LOAD_URL to the server you want to test, e.g. LOAD_URL=http://localhost:3000');

const readLines = (file) =>
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

const b64url = (value) => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

/** A 15-minute access token, signed the same way the server signs them. */
const signAccessToken = (userId, secret) => {
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({
    sub: userId,
    role: 'user',
    typ: 'access',
    jti: randomUUID(),
    fid: randomUUID(),
    iat: now,
    exp: now + 15 * 60,
  })}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
};

/** One entry per phone: a function that returns a valid token for it. */
const buildIdentities = () => {
  if (env.LOAD_TOKENS_FILE) {
    const tokens = readLines(env.LOAD_TOKENS_FILE);
    if (tokens.length === 0) fail(`No tokens found in ${env.LOAD_TOKENS_FILE}`);
    return { count: tokens.length, tokenFor: (i) => () => tokens[i % tokens.length] };
  }
  if (env.LOAD_USER_IDS_FILE) {
    if (!env.JWT_SECRET) fail('LOAD_USER_IDS_FILE needs JWT_SECRET (the server secret) to sign tokens.');
    const ids = readLines(env.LOAD_USER_IDS_FILE);
    if (ids.length === 0) fail(`No user ids found in ${env.LOAD_USER_IDS_FILE}`);
    return {
      count: ids.length,
      tokenFor: (i) => {
        const userId = ids[i % ids.length];
        let token = signAccessToken(userId, env.JWT_SECRET);
        let signedAt = Date.now();
        return () => {
          // Re-sign before the 15 minutes run out, like the app refreshing its session
          if (Date.now() - signedAt > 10 * 60 * 1000) {
            token = signAccessToken(userId, env.JWT_SECRET);
            signedAt = Date.now();
          }
          return token;
        };
      },
    };
  }
  return fail('Set LOAD_TOKENS_FILE (one access token per line) or LOAD_USER_IDS_FILE + JWT_SECRET.');
};

// ---------------------------------------------------------------- measurements

const KINDS = ['check', 'changes', 'full', 'write'];
const stats = Object.fromEntries(KINDS.map((k) => [k, { times: [], statuses: {}, errors: 0, bytes: 0 }]));

const record = (kind, ms, status, bytes) => {
  const s = stats[kind];
  s.times.push(ms);
  s.statuses[status] = (s.statuses[status] || 0) + 1;
  s.bytes += bytes;
};

const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const between = (min, max) => min + Math.random() * (max - min);

/** One request, timed. Returns { status, json, etag } or null on a network error / timeout. */
const call = async (kind, path, token, init = {}) => {
  const started = performance.now();
  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const text = await response.text();
    record(kind, performance.now() - started, response.status, text.length);
    let json = null;
    if (text && response.headers.get('content-type')?.includes('json')) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { status: response.status, json, etag: response.headers.get('etag') };
  } catch {
    stats[kind].errors += 1;
    stats[kind].times.push(performance.now() - started);
    return null;
  }
};

// ---------------------------------------------------------------- one phone

const runPhone = async (index, getToken, stopAt) => {
  let etag = null;
  let cursor = null;

  const remember = (result) => {
    if (!result) return;
    if (result.etag) etag = result.etag;
    if (typeof result.json?.cursor === 'number') cursor = result.json.cursor;
  };

  // Like opening the app: one full download first (staggered so phones don't all start together)
  await sleep(between(0, Math.min(5000, THINK_MAX)));
  remember(await call('full', '/sync', getToken()));

  while (Date.now() < stopAt) {
    await sleep(between(THINK_MIN, THINK_MAX));
    if (Date.now() >= stopAt) break;

    const roll = Math.random();
    const doWrite = WRITES && roll >= MIX.check + MIX.changes;
    const doChanges = !doWrite && roll >= MIX.check && roll < MIX.check + MIX.changes;

    if (doWrite) {
      const stamp = `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
      await call('write', '/sync/outbox', getToken(), {
        method: 'POST',
        body: JSON.stringify({
          ops: [
            {
              idemKey: `op_load_${stamp}`.slice(0, 64),
              entity: 'transaction',
              op: 'upsert',
              entityId: `tx_manual_load_${stamp}`.slice(0, 80),
              payload: {
                amount: Math.round(between(10, 500) * 100) / 100,
                category: 'other_expense',
                merchant: 'Load test',
                timestamp: Date.now(),
                updatedAt: Date.now(),
              },
            },
          ],
        }),
      });
      // The app pulls right after saving
      remember(await call(cursor ? 'changes' : 'full', cursor ? `/sync?since=${cursor}` : '/sync', getToken()));
    } else if (doChanges && cursor) {
      // "What changed since my last pull?" without a saved version, so the server must answer
      remember(await call('changes', `/sync?since=${cursor}`, getToken()));
    } else {
      // "Anything new?" Usually answered with 304 and no body
      const headers = etag ? { 'If-None-Match': etag } : {};
      const path = cursor ? `/sync?since=${cursor}` : '/sync';
      remember(await call('check', path, getToken(), { headers }));
    }
  }
};

// ---------------------------------------------------------------- run + report

const describe = (kind) => {
  const s = stats[kind];
  if (s.times.length === 0) return null;
  const sorted = [...s.times].sort((a, b) => a - b);
  const statuses = Object.entries(s.statuses)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([code, n]) => `${code}×${n}`)
    .join(' ');
  return {
    kind,
    requests: s.times.length,
    'p50 ms': Math.round(percentile(sorted, 50)),
    'p95 ms': Math.round(percentile(sorted, 95)),
    'p99 ms': Math.round(percentile(sorted, 99)),
    'max ms': Math.round(sorted[sorted.length - 1]),
    'avg KB': Math.round((s.bytes / Math.max(1, s.times.length - s.errors) / 1024) * 10) / 10,
    failed: s.errors,
    statuses,
  };
};

const main = async () => {
  const identities = buildIdentities();

  console.log(`\nLoad test → ${BASE_URL}`);
  console.log(`  ${USERS} phones for ${DURATION_S}s, pause ${THINK_MIN}-${THINK_MAX} ms, writes ${WRITES ? 'ON (adds "Load test" transactions)' : 'off'}`);
  console.log(`  ${identities.count} account(s) available`);
  if (identities.count < USERS) {
    console.log(`  Note: fewer accounts than phones. Phones sharing an account share its 60-a-minute limit, so expect 429s.`);
  }
  if (!/localhost|127\.0\.0\.1/.test(BASE_URL)) {
    console.log('  This is not a local server. Starting in 5 seconds (Ctrl+C to cancel)...');
    await sleep(5000);
  }

  const health = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    .then((r) => r.json())
    .catch(() => null);
  if (!health) fail(`Could not reach ${BASE_URL}/health. Is the server running?`);
  const uptimeBefore = Number(health.uptime) || 0;

  const startedAt = Date.now();
  const stopAt = startedAt + DURATION_S * 1000;
  const progress = setInterval(() => {
    const done = KINDS.reduce((n, k) => n + stats[k].times.length, 0);
    process.stdout.write(`\r  ${Math.round((Date.now() - startedAt) / 1000)}s  ${done} requests`);
  }, 1000);

  await Promise.all(Array.from({ length: USERS }, (_, i) => runPhone(i, identities.tokenFor(i), stopAt)));
  clearInterval(progress);
  process.stdout.write('\n');

  const seconds = (Date.now() - startedAt) / 1000;
  const rows = KINDS.map(describe).filter(Boolean);
  const total = rows.reduce((n, r) => n + r.requests, 0);
  const failed = rows.reduce((n, r) => n + r.failed, 0);
  const count = (test) =>
    KINDS.reduce((n, k) => n + Object.entries(stats[k].statuses).reduce((m, [code, c]) => m + (test(Number(code)) ? c : 0), 0), 0);
  const serverErrors = count((c) => c >= 500);
  const rateLimited = count((c) => c === 429);
  const unauthorized = count((c) => c === 401 || c === 403);
  const notModified = stats.check.statuses[304] || 0;

  console.log('\nResults by kind of request');
  console.table(rows);
  console.log(`Total: ${total} requests in ${seconds.toFixed(1)}s = ${(total / seconds).toFixed(1)} requests/second`);
  console.log(`"Nothing new" answers (304): ${notModified} of ${stats.check.times.length} checks`);
  console.log(`Server errors (5xx): ${serverErrors}   Too many requests (429): ${rateLimited}   Not signed in (401/403): ${unauthorized}   No answer/timeouts: ${failed}`);

  const after = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    .then((r) => r.json())
    .catch(() => null);
  if (!after) {
    console.log('The server did not answer /health after the test.');
  } else if ((Number(after.uptime) || 0) < uptimeBefore) {
    console.log('WARNING: the server restarted during the test (its uptime went back to zero). It probably ran out of memory.');
  } else {
    console.log('The server stayed up for the whole test.');
  }

  if (unauthorized > total / 2) {
    console.log('Most requests were refused as not signed in: check the tokens / JWT_SECRET / user ids.');
  }
  // Non-zero exit when the server failed or fell over, so this can gate a release
  const restarted = !after || (Number(after.uptime) || 0) < uptimeBefore;
  process.exit(serverErrors > 0 || failed > total * 0.01 || restarted ? 1 : 0);
};

main().catch((err) => fail(`Load test crashed: ${err?.stack || err}`));

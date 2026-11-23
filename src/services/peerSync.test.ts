import assert from 'node:assert';
import { test } from 'node:test';
import { mergeLedgers, emptyLedger, type PeerLedgerDoc } from '../utils/peerLedgerMerge.ts';
import { syncLedgerOnce } from './peerSyncCore.ts';

const NOW = 1_800_000_000_000;
const contact = (id: string, updatedAt: number, name = id) => ({ id, displayName: name, aliases: [], upiIds: [], createdAt: 1, updatedAt });
const entry = (id: string, updatedAt: number, extra: object = {}) => ({
  id,
  contactId: 'c1',
  kind: 'LEND',
  amount: 220000,
  date: '2026-10-24',
  source: { type: 'manual', method: 'cash' },
  createdAt: 1,
  updatedAt,
  ...extra,
});
const doc = (over: Partial<PeerLedgerDoc>): PeerLedgerDoc => ({ ...emptyLedger(), ...over });

test('newest change per item wins', () => {
  const phone = doc({ contacts: [contact('c1', 10, 'Gauri')], entries: [entry('e1', 50, { notExpectedBack: true })] });
  const server = doc({ contacts: [contact('c1', 20, 'Gauri Kutarma')], entries: [entry('e1', 40)] });
  const m = mergeLedgers(phone, server, NOW);
  assert.strictEqual(m.contacts[0].displayName, 'Gauri Kutarma');
  assert.strictEqual(m.entries[0].notExpectedBack, true);
});

test('a deleted person stays deleted even if the other copy still has them', () => {
  const phone = doc({ tombstones: [{ id: 'c1', kind: 'contact', at: NOW - 100 }] });
  const server = doc({ contacts: [contact('c1', NOW - 200)] });
  assert.strictEqual(mergeLedgers(phone, server, NOW).contacts.length, 0);
  // ...unless they were changed again after the delete.
  const later = doc({ contacts: [contact('c1', NOW - 50)] });
  assert.strictEqual(mergeLedgers(phone, later, NOW).contacts.length, 1);
  // Tombstones older than 180 days are dropped.
  const old = doc({ tombstones: [{ id: 'c1', kind: 'contact', at: NOW - 200 * 86_400_000 }] });
  assert.strictEqual(mergeLedgers(old, emptyLedger(), NOW).tombstones.length, 0);
});

test('a settled loan (repayment entry) survives a fresh sign-in', () => {
  const server = doc({
    contacts: [contact('c1', 10)],
    entries: [entry('lend', 10), entry('repay', 20, { kind: 'REPAY_RECEIVED' })],
  });
  const freshPhone = emptyLedger();
  const m = mergeLedgers(freshPhone, server, NOW);
  assert.deepStrictEqual(m.entries.map((e) => e.id).sort(), ['lend', 'repay']);
});

test('one entry per tagged transaction: the original wins over a re-created copy', () => {
  const original = entry('orig', 30, { source: { type: 'txn', txnId: 't1' }, createdAt: 5, dueDate: '2026-12-01' });
  const recreated = entry('new', 60, { source: { type: 'txn', txnId: 't1' }, createdAt: 99 });
  const m = mergeLedgers(doc({ entries: [recreated] }), doc({ entries: [original] }), NOW);
  assert.deepStrictEqual(m.entries.map((e) => e.id), ['orig']);
  // A live copy beats a deleted one.
  const deletedOriginal = { ...original, deletedAt: 40 };
  const m2 = mergeLedgers(doc({ entries: [recreated] }), doc({ entries: [deletedOriginal] }), NOW);
  assert.deepStrictEqual(m2.entries.map((e) => e.id), ['new']);
});

test('sync round: pulls on a fresh phone without overwriting the server', async () => {
  let local = emptyLedger();
  const server = doc({ contacts: [contact('c1', 10)], entries: [entry('e1', 10)] });
  let pushed = 0;
  const result = await syncLedgerOnce({
    getLocal: () => local,
    applyLocal: (d) => (local = d),
    fetchRemote: async () => ({ data: server, version: 3 }),
    pushRemote: async () => {
      pushed++;
      return { version: 4 };
    },
    now: () => NOW,
  });
  assert.strictEqual(result, 'pulled');
  assert.strictEqual(pushed, 0);
  assert.strictEqual(local.entries.length, 1);
});

test('sync round: another phone saved first, so merge both and retry', async () => {
  let local = doc({ contacts: [contact('c1', 10)], entries: [entry('mine', 50)] });
  let serverDoc = doc({ contacts: [contact('c1', 10)] });
  let serverVersion = 1;
  const result = await syncLedgerOnce({
    getLocal: () => local,
    applyLocal: (d) => (local = d),
    fetchRemote: async () => ({ data: serverDoc, version: serverVersion }),
    pushRemote: async (d, base) => {
      if (base !== serverVersion) return { conflict: { data: serverDoc, version: serverVersion } };
      if (serverVersion === 1) {
        // The other phone sneaks in a change before ours lands.
        serverDoc = doc({ contacts: [contact('c1', 10)], entries: [entry('theirs', 60)] });
        serverVersion = 2;
        return { conflict: { data: serverDoc, version: serverVersion } };
      }
      serverDoc = d;
      serverVersion += 1;
      return { version: serverVersion };
    },
    now: () => NOW,
  });
  assert.strictEqual(result, 'pulled_and_pushed');
  assert.deepStrictEqual(serverDoc.entries.map((e) => e.id).sort(), ['mine', 'theirs']);
  assert.deepStrictEqual(local.entries.map((e) => e.id).sort(), ['mine', 'theirs']);
});

test('sync round: nothing anywhere, nothing sent', async () => {
  let pushed = 0;
  const r = await syncLedgerOnce({
    getLocal: () => emptyLedger(),
    applyLocal: () => {},
    fetchRemote: async () => ({ data: null, version: 0 }),
    pushRemote: async () => {
      pushed++;
      return { version: 1 };
    },
    now: () => NOW,
  });
  assert.strictEqual(r, 'unchanged');
  assert.strictEqual(pushed, 0);
});

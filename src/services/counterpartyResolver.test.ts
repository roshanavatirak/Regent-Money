import assert from 'node:assert';
import { test } from 'node:test';
import {
  buildCounterpartyIndex,
  contactKeys,
  learnKeysFromRow,
  mergeContactKeys,
  normalizeName,
  parseRowKey,
  resolveCounterparty,
  nameSimilarity,
  searchContacts,
  findSimilarRows,
  countRecognisedRows,
  forgetRowKeys,
  suggestContacts,
} from './counterpartyResolver.ts';
import { parseSMS } from './smsParser.ts';

const contact = (id: string, displayName: string, extra: object = {}): any => ({
  id,
  displayName,
  aliases: [],
  upiIds: [],
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

// The three credits from the same person, as the bank printed them
const sms = [
  ['AX-HDFCBK', 'Rs.4000.00 credited to A/c XX1234 on 12-11-26 from VPA rohit.c@okaxis (UPI Ref No 512398765401). -HDFC Bank'],
  ['AX-HDFCBK', 'Rs.3500.00 credited to A/c XX1234 on 13-11-26 from VPA rohitchunarkar@ybl (UPI Ref No 512398765402). -HDFC Bank'],
  ['VM-ICICIB', 'Dear Customer, Acct XX6090 is credited with Rs 2500.00 on 14-Nov-26 by rohit.c@okaxis. UPI:512398765403'],
];
const rows = sms.map(([sender, body], i) => {
  const p = parseSMS(sender, body)!;
  return { id: `inc_${i}`, source: p.merchant, counterpartyKey: p.counterpartyKey };
});

test('the parser keeps the whole UPI ID, not just the name before @', () => {
  assert.deepStrictEqual(
    rows.map((r) => r.counterpartyKey),
    ['vpa:rohit.c@okaxis', 'vpa:rohitchunarkar@ybl', 'vpa:rohit.c@okaxis'],
  );
  // Different names each time, which is why names alone can't tie them together
  assert.deepStrictEqual(rows.map((r) => r.source), ['rohit c', 'rohitchunarkar', 'rohit c']);
});

test('nothing links before the user says who it is', () => {
  const index = buildCounterpartyIndex([contact('c_rohit', 'Rohit')]);
  // "rohit c" is not "rohit": no fuzzy guessing
  assert.strictEqual(resolveCounterparty(rows[0], index), null);
});

test('linking one transfer recognises the others with the same UPI ID', () => {
  let rohit = contact('c_rohit', 'Rohit');
  rohit = { ...rohit, keys: learnKeysFromRow(rohit, rows[0], [], 100) };
  const index = buildCounterpartyIndex([rohit]);

  assert.deepStrictEqual(resolveCounterparty(rows[2], index), { contactId: 'c_rohit', via: 'vpa' });
  // A new UPI ID with a new name: still unknown until linked once
  assert.strictEqual(resolveCounterparty(rows[1], index), null);

  rohit = { ...rohit, keys: learnKeysFromRow(rohit, rows[1], [], 200) };
  const after = buildCounterpartyIndex([rohit]);
  for (const r of rows) assert.strictEqual(resolveCounterparty(r, after)?.contactId, 'c_rohit', r.id);
});

test('a confirmed name links a transfer with no UPI ID', () => {
  let rohit = contact('c_rohit', 'Rohit');
  rohit = { ...rohit, keys: learnKeysFromRow(rohit, { id: 't', merchant: 'ROHIT CHUNARKAR' }) };
  const index = buildCounterpartyIndex([rohit]);
  assert.deepStrictEqual(resolveCounterparty({ id: 'n', merchant: 'Rohit  Chunarkar.' }, index), {
    contactId: 'c_rohit',
    via: 'name',
  });
});

test('a name two people share never links on its own', () => {
  const a = contact('c_a', 'Rahul');
  const b = contact('c_b', 'Rahul');
  const index = buildCounterpartyIndex([a, b]);
  assert.strictEqual(resolveCounterparty({ id: 'x', merchant: 'RAHUL' }, index), null);
});

test('a raw payee name from an old Borrow & Lend contact links only after two sightings', () => {
  const once = contact('c1', 'Gita', { keys: [{ type: 'name', value: 'gitabai s', source: 'auto', hits: 1 }] });
  assert.strictEqual(resolveCounterparty({ id: 'x', merchant: 'GITABAI S' }, buildCounterpartyIndex([once])), null);
  const twice = contact('c1', 'Gita', { keys: [{ type: 'name', value: 'gitabai s', source: 'auto', hits: 2 }] });
  assert.strictEqual(resolveCounterparty({ id: 'x', merchant: 'GITABAI S' }, buildCounterpartyIndex([twice]))?.contactId, 'c1');
});

test("the user's own accounts are never a counterparty", () => {
  // Credit card bill paid from the user's savings account XX5039
  const row = { id: 'cc', merchant: 'Credits', counterpartyKey: 'acct:5039' };
  const self = contact('c_self', 'Me', { keys: [{ type: 'acct', value: '5039', source: 'user' }] });
  assert.strictEqual(resolveCounterparty(row, buildCounterpartyIndex([self], ['5039'])), null);
  // Not learned either
  assert.deepStrictEqual(learnKeysFromRow(contact('c', 'X'), row, ['5039']), []);
});

test('an explicit link wins, and falls back to keys if that contact is gone', () => {
  const rohit = contact('c_rohit', 'Rohit', { upiIds: ['rohit.c@okaxis'] });
  const index = buildCounterpartyIndex([rohit]);
  assert.deepStrictEqual(resolveCounterparty({ ...rows[0], counterpartyId: 'c_rohit' }, index)?.via, 'linked');
  assert.deepStrictEqual(resolveCounterparty({ ...rows[0], counterpartyId: 'c_deleted' }, index), {
    contactId: 'c_rohit',
    via: 'vpa',
  });
});

test('merging two contacts keeps every key of both', () => {
  const a = contact('a', 'Rohit', { keys: [{ type: 'vpa', value: 'rohit.c@okaxis', source: 'user' }] });
  const b = contact('b', 'Rohit C', { upiIds: ['rohitchunarkar@ybl'] });
  const merged = { ...a, keys: mergeContactKeys(a, b) };
  const index = buildCounterpartyIndex([merged]);
  for (const r of rows) assert.strictEqual(resolveCounterparty(r, index)?.contactId, 'a', r.id);
});

test('placeholders and noise are not names; keys normalise', () => {
  for (const n of ['Spends', 'Credits', 'Transfer XX9988', 'Direct Credit', '', null]) {
    assert.strictEqual(normalizeName(n as any), '', String(n));
  }
  assert.strictEqual(normalizeName('Mr. ROHIT  C.'), 'rohit c');
  assert.deepStrictEqual(parseRowKey('acct:009988'), { type: 'acct', value: '9988', source: 'auto' });
  assert.strictEqual(parseRowKey('vpa:not a handle'), null);
  assert.strictEqual(parseRowKey('upi:x@y'), null);
  // Older contacts' fields count as keys, without duplicates
  const old = contact('o', 'Gitabai', { aliases: ['gitabai@paytm', 'Gitabai S'], upiIds: ['GITABAI@paytm'] });
  assert.deepStrictEqual(
    contactKeys(old).map((k) => `${k.type}:${k.value}:${k.source}`).sort(),
    ['name:gitabai s:auto', 'name:gitabai:user', 'vpa:gitabai@paytm:auto'],
  );
});

test('name similarity: the first name decides', () => {
  assert.strictEqual(nameSimilarity('rohit c', 'rohitc'), 3);
  // Same person, written differently: initial, or cut short by the bank
  assert.strictEqual(nameSimilarity('rohit c', 'rohit chunarkar'), 2);
  assert.strictEqual(nameSimilarity('kartik gopal avatira', 'kartik gopal avatirak'), 2);
  assert.strictEqual(nameSimilarity('kartik avatirak', 'kartik gopal avatirak'), 2);
  // Only the first name to go on: loose
  assert.strictEqual(nameSimilarity('rohit', 'rohit sharma'), 1);
  assert.strictEqual(nameSimilarity('rohitchunarkar', 'rohit'), 1);
  // Brothers share the father's name and the surname: different people
  assert.strictEqual(nameSimilarity('roshan gopal avatira', 'kartik gopal avatirak'), 0);
  assert.strictEqual(nameSimilarity('roshan avatirak', 'kartik avatirak'), 0);
  // Same first name, different surname: different people
  assert.strictEqual(nameSimilarity('rohit sharma', 'rohit chunarkar'), 0);
  assert.strictEqual(nameSimilarity('amit kumar', 'suresh kumar'), 0);
  assert.strictEqual(nameSimilarity('swiggy', 'rohit'), 0);
  assert.strictEqual(nameSimilarity('', 'rohit'), 0);
  // One wrong letter in a long surname: loose. Short surnames that differ are other families.
  assert.strictEqual(nameSimilarity('kartik gopal avatrirak', 'kartik gopal avatirak'), 1);
  assert.strictEqual(nameSimilarity('kartik gopal avatira', 'kartik gopal avatrirak'), 1);
  assert.strictEqual(nameSimilarity('rohit patil', 'rohit patel'), 0);
  assert.strictEqual(nameSimilarity('roshan gopal avatrirak', 'kartik gopal avatirak'), 0);
});

test("a brother's payments are not offered as the same person", () => {
  const ledger = [
    { id: 'k1', merchant: 'KARTIK GOPAL AVATIRA', timestamp: 3 },
    { id: 'r1', merchant: 'ROSHAN GOPAL AVATIRA', timestamp: 2 },
    { id: 'r2', merchant: 'Roshan Avatirak', timestamp: 1 },
  ];
  const kartik = contact('k', 'Kartik Gopal Avatirak');
  const index = buildCounterpartyIndex([kartik]);
  assert.deepStrictEqual(findSimilarRows(kartik, ledger, index).map((r) => r.id), ['k1']);
});

test('search finds people by name, other names and UPI ID; empty search suggests by the printed name', () => {
  const rohit = contact('r', 'Rohit', { upiIds: ['rohitchunarkar@ybl'], updatedAt: 5 });
  const priya = contact('p', 'Priya Kale', { updatedAt: 9 });
  const gita = contact('g', 'Gita', { aliases: ['GITABAI S'], updatedAt: 1 });
  const all = [rohit, priya, gita];
  assert.deepStrictEqual(searchContacts(all, 'ro').map((c) => c.id), ['r']);
  assert.deepStrictEqual(searchContacts(all, 'kale').map((c) => c.id), ['p']);
  assert.deepStrictEqual(searchContacts(all, 'gitabai').map((c) => c.id), ['g']);
  assert.deepStrictEqual(searchContacts(all, 'chunarkar').map((c) => c.id), ['r']);
  assert.deepStrictEqual(searchContacts(all, 'zzz'), []);
  // No query: the best match for "ROHIT C" first, then most recent
  assert.deepStrictEqual(searchContacts(all, '', 'ROHIT C').map((c) => c.id), ['r', 'p', 'g']);
  assert.deepStrictEqual(searchContacts(all, '').map((c) => c.id), ['p', 'r', 'g']);
});

test('after linking one, the look-alikes under other names are offered; recognised ones are not', () => {
  const ledger = [
    { id: 'a', merchant: 'ROHIT C', counterpartyKey: 'vpa:rohit.c@okaxis', timestamp: 3 },
    { id: 'b', merchant: 'rohitchunarkar', counterpartyKey: 'vpa:rohitchunarkar@ybl', timestamp: 2 },
    { id: 'c', merchant: 'Rohit C', timestamp: 1 }, // same name, no UPI ID
    { id: 'd', merchant: 'ROHIT C', counterpartyKey: 'vpa:rohit.c@okaxis', timestamp: 4 }, // same UPI ID
    { id: 'e', merchant: 'SWIGGY', counterpartyKey: 'vpa:swiggy@icici', timestamp: 5 },
  ];
  let rohit = contact('r', 'Rohit');
  rohit = { ...rohit, keys: learnKeysFromRow(rohit, ledger[0]) };
  const index = buildCounterpartyIndex([rohit]);

  // c (same name, confirmed) and d (same UPI ID) are recognised already
  assert.strictEqual(countRecognisedRows('r', ledger, index), 3); // a, c, d (a isn't linked by id here)
  // b is the different-name one the user is asked about; Swiggy is not offered
  assert.deepStrictEqual(findSimilarRows(rohit, ledger, index).map((r) => r.id), ['b']);
});

test('"Not Kartik" undoes a wrong link: his keys forget that payment, so Roshan stops matching', () => {
  const roshanRow = { id: 'r1', merchant: 'ROSHAN GOPAL AVATIRA', counterpartyKey: 'vpa:roshan@ybl' };
  let kartik = contact('k', 'Kartik Gopal Avatirak', { upiIds: ['kartik@okaxis'] });
  kartik = { ...kartik, keys: learnKeysFromRow(kartik, roshanRow) }; // the wrong "Link"
  assert.strictEqual(resolveCounterparty({ id: 'r2', merchant: 'Roshan Gopal Avatira' }, buildCounterpartyIndex([kartik]))?.contactId, 'k');

  kartik = { ...kartik, ...forgetRowKeys(kartik, roshanRow) };
  const index = buildCounterpartyIndex([kartik]);
  assert.strictEqual(resolveCounterparty({ id: 'r2', merchant: 'Roshan Gopal Avatira' }, index), null);
  assert.strictEqual(resolveCounterparty({ id: 'r3', merchant: 'x', counterpartyKey: 'vpa:roshan@ybl' }, index), null);
  // His own UPI ID is untouched
  assert.strictEqual(resolveCounterparty({ id: 'k2', merchant: 'x', counterpartyKey: 'vpa:kartik@okaxis' }, index)?.contactId, 'k');
});

test('suggestions: only close names, only people with at least one transaction', () => {
  const k1 = contact('k1', 'Kartik Gopal Avatirak', { updatedAt: 2 });
  const k2 = contact('k2', 'Kartik Gopal Avatrirak', { updatedAt: 3 }); // duplicate spelling
  const k3 = contact('k3', 'Kartik Sharma', { updatedAt: 9 }); // same first name, other surname
  const gauri = contact('g', 'GAURI SURESH KUTARMA', { updatedAt: 9 });
  const sahil = contact('s', 'Sahil Sanjay Hiwale', { updatedAt: 9 });
  const unused = contact('u', 'Kartik Gopal Avatira', { updatedAt: 9 }); // close, but no transactions
  const all = [k1, k2, k3, gauri, sahil, unused];
  const active = new Set(['k1', 'k2', 'k3', 'g', 's']);

  assert.deepStrictEqual(
    suggestContacts(all, 'KARTIK GOPAL AVATIRA', active).map((c) => c.id),
    // Cut-short spelling first (2), the misspelt duplicate next (1); no Gauri, Sahil, the other
    // Kartik, or the close one with no transactions
    ['k1', 'k2'],
  );
  assert.deepStrictEqual(suggestContacts(all, '', active), []);
});

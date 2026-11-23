import assert from 'node:assert';
import { test } from 'node:test';
import { findRepaymentSuggestions, counterpartyTotals, localDate } from './repaymentSuggestions.ts';
import { buildCounterpartyIndex } from './counterpartyResolver.ts';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-20T12:00:00').getTime();
const today = localDate(NOW);
const daysAgo = (n: number) => NOW - n * DAY;

const rohit: any = {
  id: 'c_rohit',
  displayName: 'Rohit',
  aliases: [],
  upiIds: ['rohit.c@okaxis', 'rohitchunarkar@ybl'],
  createdAt: 1,
  updatedAt: 1,
};
const priya: any = { id: 'c_priya', displayName: 'Priya', aliases: [], upiIds: ['priya.k@ybl'], createdAt: 1, updatedAt: 1 };

const entry = (id: string, contactId: string, kind: string, rupees: number, date: string, extra: object = {}): any => ({
  id,
  contactId,
  kind,
  amount: rupees * 100,
  date,
  source: { type: 'manual', method: 'cash' },
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

const credit = (id: string, rupees: number, ts: number, key: string, extra: object = {}): any => ({
  id,
  ledger: 'income',
  amount: rupees,
  timestamp: ts,
  source: 'Someone',
  counterpartyKey: key,
  category: 'money_received',
  ...extra,
});

const base = () => ({
  contacts: [rohit, priya],
  index: buildCounterpartyIndex([rohit, priya]),
  today,
  now: NOW,
});

test('money in from someone who owes you is offered as a repayment, across their UPI IDs', () => {
  const entries = [entry('e1', 'c_rohit', 'LEND', 10000, localDate(daysAgo(20)))];
  const rows = [
    credit('a', 4000, daysAgo(8), 'vpa:rohit.c@okaxis'),
    credit('b', 3500, daysAgo(7), 'vpa:rohitchunarkar@ybl'),
    credit('c', 2500, daysAgo(6), 'vpa:rohit.c@okaxis'),
  ];
  const s = findRepaymentSuggestions({ ...base(), rows, entries });
  assert.deepStrictEqual(s.map((x) => x.row.id), ['c', 'b', 'a']); // newest first
  assert.ok(s.every((x) => x.kind === 'REPAY_RECEIVED' && x.tag === 'peer_lent_repaid' && x.contactId === 'c_rohit'));
  // What was still owed when each came in: 10,000 → 6,000 → 2,500
  assert.deepStrictEqual(s.map((x) => x.outstanding / 100).reverse(), [10000, 6000, 2500]);
});

test('never more than is owed, nothing before the loan, nothing already in the ledger or dismissed', () => {
  const entries = [
    entry('e1', 'c_rohit', 'LEND', 5000, localDate(daysAgo(10))),
    entry('e2', 'c_rohit', 'REPAY_RECEIVED', 1000, localDate(daysAgo(9)), { source: { type: 'txn', txnId: 'inLedger' } }),
  ];
  const rows = [
    credit('before', 1000, daysAgo(15), 'vpa:rohit.c@okaxis'), // before the loan
    credit('inLedger', 1000, daysAgo(9), 'vpa:rohit.c@okaxis'),
    credit('ok', 3000, daysAgo(5), 'vpa:rohit.c@okaxis'),
    credit('tooMuch', 2000, daysAgo(4), 'vpa:rohit.c@okaxis'), // only 1,000 left after 'ok'
    credit('dismissed', 500, daysAgo(3), 'vpa:rohit.c@okaxis'),
    credit('tagged', 500, daysAgo(2), 'vpa:rohit.c@okaxis', { category: 'peer_lent_repaid' }),
    credit('old', 500, daysAgo(200), 'vpa:rohit.c@okaxis'),
  ];
  const s = findRepaymentSuggestions({ ...base(), rows, entries, dismissed: new Set(['dismissed']) });
  assert.deepStrictEqual(s.map((x) => x.row.id), ['ok']);
});

test('money out to someone you owe is offered as paying them back; strangers and settled people are not', () => {
  const entries = [entry('e1', 'c_priya', 'BORROW', 2000, localDate(daysAgo(30)))];
  const rows = [
    { id: 'pay', ledger: 'transaction', amount: 2000, timestamp: daysAgo(1), merchant: 'PRIYA K', counterpartyKey: 'vpa:priya.k@ybl', category: 'miscellaneous' },
    { id: 'stranger', ledger: 'transaction', amount: 100, timestamp: daysAgo(1), merchant: 'SWIGGY', counterpartyKey: 'vpa:swiggy@icici' },
    credit('rohitSettled', 100, daysAgo(1), 'vpa:rohit.c@okaxis'), // Rohit owes nothing
  ] as any[];
  const s = findRepaymentSuggestions({ ...base(), rows, entries });
  assert.deepStrictEqual(
    s.map((x) => [x.row.id, x.kind, x.tag]),
    [['pay', 'REPAY_PAID', 'peer_borrow_repaid']],
  );
  // Only one person's, for their page
  assert.deepStrictEqual(findRepaymentSuggestions({ ...base(), rows, entries, contactId: 'c_rohit' }), []);
});

test('totals with one person add up every payment under any of their names', () => {
  const rows = [
    credit('a', 4000, daysAgo(3), 'vpa:rohit.c@okaxis'),
    credit('b', 3500, daysAgo(2), 'vpa:rohitchunarkar@ybl'),
    { id: 'c', ledger: 'transaction', amount: 250.5, timestamp: daysAgo(1), merchant: 'x', counterpartyKey: 'vpa:rohit.c@okaxis' },
    { id: 'd', ledger: 'transaction', amount: 99, timestamp: daysAgo(1), merchant: 'SWIGGY', counterpartyKey: 'vpa:swiggy@icici' },
  ] as any[];
  const t = counterpartyTotals('c_rohit', rows, buildCounterpartyIndex([rohit, priya]), 2);
  assert.strictEqual(t.received, 7500);
  assert.strictEqual(t.paid, 250.5);
  assert.strictEqual(t.count, 3);
  assert.deepStrictEqual(t.recent.map((r) => r.id), ['c', 'b']);
});

import assert from 'node:assert';
import { test } from 'node:test';
import { computeContactSummary, computeGlobalMetrics } from './peerLedgerSelectors.ts';
import { shouldRemoveTxnEntry } from '../utils/peerReconcile.ts';

const contact = { id: 'c1', displayName: 'Gauri', aliases: [], upiIds: [], createdAt: 1, updatedAt: 1 };
const entry = (id: string, kind: any, rupees: number, date: string, extra: object = {}) => ({
  id,
  contactId: 'c1',
  kind,
  amount: rupees * 100,
  date,
  source: { type: 'manual', method: 'cash' } as const,
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

test('a settled loan stays settled', () => {
  const s = computeContactSummary(contact, [entry('l', 'LEND', 2200, '2026-10-24'), entry('r', 'REPAY_RECEIVED', 2200, '2026-11-18')] as any);
  assert.strictEqual(s.netPosition, 0);
  assert.strictEqual(s.openLoansCount, 0);
});

test('money not expected back is listed but not counted as owed', () => {
  const entries = [
    entry('a', 'LEND', 2200, '2026-10-24', { notExpectedBack: true }),
    entry('b', 'LEND', 1000, '2026-11-01'),
  ] as any;
  const s = computeContactSummary(contact, entries);
  assert.strictEqual(s.totalLentPending, 100000);
  assert.strictEqual(s.notExpectedPending, 220000);
  assert.strictEqual(s.netPosition, 100000);
  assert.strictEqual(s.openLoansCount, 1);

  const g = computeGlobalMetrics([contact], entries);
  assert.strictEqual(g.totalLentPending, 100000); // feeds net worth
  assert.strictEqual(g.totalNotExpected, 220000);
  assert.strictEqual(g.totalLentSettled, 0); // not "paid back"
});

test('if some of it does come back, it still counts as a repayment', () => {
  const entries = [
    entry('a', 'LEND', 2200, '2026-10-24', { notExpectedBack: true }),
    entry('r', 'REPAY_RECEIVED', 500, '2026-11-10'),
  ] as any;
  const s = computeContactSummary(contact, entries);
  assert.strictEqual(s.notExpectedPending, 170000);
  assert.strictEqual(s.totalLentPending, 0);
});

test('a repayment goes to the open loan before old let-go loans', () => {
  const entries = [
    entry('o1', 'LEND', 2200, '2026-10-25', { notExpectedBack: true }),
    entry('o2', 'LEND', 5000, '2026-10-25', { notExpectedBack: true }),
    entry('n', 'LEND', 5500, '2026-11-15'),
    entry('r', 'REPAY_RECEIVED', 2800, '2026-11-18'),
  ] as any;
  const s = computeContactSummary(contact, entries);
  assert.strictEqual(s.totalLentPending, 270000); // ₹2,700 left
  assert.strictEqual(s.lentTotal, 550000);
  assert.strictEqual(s.lentRepaid, 280000);
  assert.strictEqual(s.notExpectedPending, 720000); // let go stays ₹7,200, same everywhere

  const g = computeGlobalMetrics([contact], entries);
  assert.strictEqual(g.totalLentExpected, 550000);
  assert.strictEqual(g.totalLentRepaid, 280000);
  assert.strictEqual(g.totalNotExpected, 720000);
});

test('a loan already paid off is left out of You lent and Paid back', () => {
  const settled = { ...contact, id: 'c2' };
  const entries = [
    entry('n', 'LEND', 5500, '2026-11-15'),
    entry('r', 'REPAY_RECEIVED', 2800, '2026-11-18'),
    { ...entry('s', 'LEND', 2200, '2026-10-01'), contactId: 'c2' },
    { ...entry('sr', 'REPAY_RECEIVED', 2200, '2026-10-10'), contactId: 'c2' },
  ] as any;
  const g = computeGlobalMetrics([contact, settled], entries);
  assert.strictEqual(g.totalLentExpected, 550000);
  assert.strictEqual(g.totalLentRepaid, 280000);
  assert.strictEqual(g.totalLentPending, 270000);
});

test('reconcile only removes a bank-linked entry when the transaction was really untagged or deleted', () => {
  const isPeer = (c?: string) => c === 'peer_lent' || c === 'peer_lent_repaid';
  const oct = new Date('2026-10-01T00:00:00').getTime();
  const nov = new Date('2026-11-15T00:00:00').getTime();
  // Re-tagged as something else, or deleted: remove.
  assert.strictEqual(shouldRemoveTxnEntry('2026-10-24', { category: 'food' }, oct, isPeer), true);
  assert.strictEqual(shouldRemoveTxnEntry('2026-10-24', { category: 'peer_lent', isDeleted: true }, oct, isPeer), true);
  // Still tagged: keep.
  assert.strictEqual(shouldRemoveTxnEntry('2026-10-24', { category: 'peer_lent' }, oct, isPeer), false);
  // Missing, but the phone only has transactions from 15 Nov: not loaded, keep (the old bug removed it).
  assert.strictEqual(shouldRemoveTxnEntry('2026-10-24', undefined, nov, isPeer), false);
  // Missing although the list covers that date: it was deleted, remove.
  assert.strictEqual(shouldRemoveTxnEntry('2026-10-24', undefined, oct, isPeer), true);
});

import assert from 'node:assert';
import { test } from 'node:test';
import { monthSummary } from './monthSummary.ts';

const dummyGetColor = (_cat: string) => '#ffffff';

test('monthSummary excludes deleted debits', () => {
  const monthStart = 1000000;
  const txs = [
    { id: '1', amount: 500, type: 'debit', category: 'food', timestamp: monthStart + 10, isDeleted: true },
    { id: '2', amount: 300, type: 'debit', category: 'food', timestamp: monthStart + 20, isDeleted: false },
  ];
  const res = monthSummary(txs, [], monthStart, new Set(), false, dummyGetColor);
  assert.strictEqual(res.out, 300);
});

test('monthSummary excludes credits from debit spending', () => {
  const monthStart = 1000000;
  const txs = [
    { id: '1', amount: 1500, type: 'credit', category: 'salary', timestamp: monthStart + 10 },
    { id: '2', amount: 450, type: 'debit', category: 'groceries', timestamp: monthStart + 20 },
  ];
  const res = monthSummary(txs, [], monthStart, new Set(), false, dummyGetColor);
  assert.strictEqual(res.out, 450);
});

test('monthSummary excludes budget-excluded transactions (self-transfers, explicit exclusions)', () => {
  const monthStart = 1000000;
  const txs = [
    { id: '1', amount: 2000, type: 'debit', category: 'self_transfer', timestamp: monthStart + 10 },
    { id: '2', amount: 1000, type: 'debit', category: 'food', timestamp: monthStart + 20, isSelfTransfer: true },
    { id: '3', amount: 800, type: 'debit', category: 'shopping', timestamp: monthStart + 30, excludedFromBudget: true },
    { id: '4', amount: 600, type: 'debit', category: 'dining', timestamp: monthStart + 40 },
  ];
  const res = monthSummary(txs, [], monthStart, new Set(), false, dummyGetColor);
  assert.strictEqual(res.out, 600);
});

test('monthSummary handles string amounts like "1,250.50" accurately without float drift', () => {
  const monthStart = 1000000;
  const txs = [
    { id: '1', amount: '1,250.50', type: 'debit', category: 'rent', timestamp: monthStart + 10 },
    { id: '2', amount: '0.10', type: 'debit', category: 'rent', timestamp: monthStart + 20 },
    { id: '3', amount: '0.20', type: 'debit', category: 'rent', timestamp: monthStart + 30 },
  ];
  const res = monthSummary(txs, [], monthStart, new Set(), false, dummyGetColor);
  // 1250.50 + 0.10 + 0.20 = 1250.80 exactly
  assert.strictEqual(res.out, 1250.8);
});

test('monthSummary strictly includes exact monthStart boundary and excludes monthStart - 1', () => {
  const monthStart = 1000000;
  const txs = [
    { id: '1', amount: 100, type: 'debit', category: 'fuel', timestamp: monthStart },
    { id: '2', amount: 50, type: 'debit', category: 'fuel', timestamp: monthStart - 1 },
  ];
  const res = monthSummary(txs, [], monthStart, new Set(), false, dummyGetColor);
  assert.strictEqual(res.out, 100);
});

test('Old three-pass calculation vs new monthSummary on complex dataset', () => {
  const monthStart = 1000000;
  const sampleTxs = [
    { id: '1', amount: '1,500.25', type: 'debit', category: 'food', timestamp: monthStart + 100 },
    { id: '2', amount: 249.75, type: 'debit', category: 'groceries', timestamp: monthStart + 200 },
    { id: '3', amount: '80.10', type: 'debit', category: 'food', timestamp: monthStart + 300 },
    { id: '4', amount: '0.20', type: 'debit', category: 'groceries', timestamp: monthStart + 400 },
    { id: '5', amount: 5000, type: 'credit', category: 'salary', timestamp: monthStart + 500 },
    { id: '6', amount: 300, type: 'debit', category: 'self_transfer', timestamp: monthStart + 600 },
    { id: '7', amount: 150, type: 'debit', category: 'shopping', timestamp: monthStart + 700, isDeleted: true },
  ];

  // Old calculation logic (from navigation/index.tsx before refactoring):
  // Filtered by tx.type !== 'credit' && !isExcludedFromBudget(tx) && Number(tx.timestamp) >= monthStart
  // But DID NOT check tx.isDeleted
  const oldOutWithDeleted = sampleTxs
    .filter((tx) => {
      const ts = Number(tx.timestamp);
      return ts >= monthStart && tx.type !== 'credit' && tx.category !== 'self_transfer';
    })
    .reduce((sum, tx) => sum + Math.abs(parseFloat(String(tx.amount).replace(/,/g, '')) || 0), 0);

  // Old calculation if isDeleted was properly filtered
  const oldOutClean = sampleTxs
    .filter((tx) => {
      const ts = Number(tx.timestamp);
      return !tx.isDeleted && ts >= monthStart && tx.type !== 'credit' && tx.category !== 'self_transfer';
    })
    .reduce((sum, tx) => sum + Math.abs(parseFloat(String(tx.amount).replace(/,/g, '')) || 0), 0);

  const newSummary = monthSummary(sampleTxs, [], monthStart, new Set(), false, dummyGetColor);

  // Difference between old clean and new monthSummary should be <= 0.01 (pure float rounding)
  const diff = Math.abs(newSummary.out - oldOutClean);
  assert.ok(diff < 0.01, `Difference between old clean and new should be negligible: ${diff}`);

  // The difference between old with deleted and new should match exactly the deleted debit amount
  assert.strictEqual(Math.round((oldOutWithDeleted - newSummary.out) * 100) / 100, 150);
});


import assert from 'node:assert';
import { test } from 'node:test';
import { toMinor, fromMinor } from './money.ts';

test('toMinor converts numbers correctly to integer paise', () => {
  assert.strictEqual(toMinor(0), 0);
  assert.strictEqual(toMinor(1), 100);
  assert.strictEqual(toMinor(19.99), 1999);
  assert.strictEqual(toMinor(0.1 + 0.2), 30); // 0.30000000000000004 -> 30
  assert.strictEqual(toMinor(-45.50), -4550);
});

test('toMinor converts string inputs correctly with comma stripping', () => {
  assert.strictEqual(toMinor('1,234.56'), 123456);
  assert.strictEqual(toMinor('500'), 50000);
  assert.strictEqual(toMinor('0.05'), 5);
});

test('toMinor handles null, undefined and invalid values safely', () => {
  assert.strictEqual(toMinor(null), 0);
  assert.strictEqual(toMinor(undefined), 0);
  assert.strictEqual(toMinor(''), 0);
  assert.strictEqual(toMinor('invalid'), 0);
  assert.strictEqual(toMinor(NaN), 0);
  assert.strictEqual(toMinor(Infinity), 0);
});

test('fromMinor converts integer paise back to rupees', () => {
  assert.strictEqual(fromMinor(0), 0);
  assert.strictEqual(fromMinor(100), 1);
  assert.strictEqual(fromMinor(1999), 19.99);
  assert.strictEqual(fromMinor(-4550), -45.5);
  assert.strictEqual(fromMinor(5), 0.05);
});


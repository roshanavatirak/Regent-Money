import assert from 'node:assert';
import { test } from 'node:test';
import { isBankSmsSender } from './bankSmsSenders.ts';

test('isBankSmsSender accepts bank DLT headers and configured tags', () => {
  assert.strictEqual(isBankSmsSender('AX-HDFCBK'), true);
  assert.strictEqual(isBankSmsSender('VM-SBIINB-S'), true);
  assert.strictEqual(isBankSmsSender('ICICIB'), true);
  assert.strictEqual(isBankSmsSender('VM-MYBANK', ['MYBANK, MYBNKS']), true);
});

test('isBankSmsSender rejects personal numbers and unknown senders', () => {
  assert.strictEqual(isBankSmsSender('+919876543210'), false);
  assert.strictEqual(isBankSmsSender('98765-43210'), false);
  assert.strictEqual(isBankSmsSender('AM-MYGATE'), false);
  assert.strictEqual(isBankSmsSender('AM-MYGATE', [null, undefined, '']), false);
  assert.strictEqual(isBankSmsSender(''), false);
});

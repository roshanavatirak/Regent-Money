import assert from 'node:assert';
import { test } from 'node:test';
import { toIndianMobile } from './indianMobile.ts';

test('strips +91, 91 and spaces', () => {
  assert.equal(toIndianMobile('+91 79728 83376'), '7972883376');
  assert.equal(toIndianMobile('+917972883376'), '7972883376');
  assert.equal(toIndianMobile('917972883376'), '7972883376');
});

test('strips the leading 0 Google sometimes shows', () => {
  assert.equal(toIndianMobile('079728 83376'), '7972883376');
});

test('keeps a plain 10-digit mobile number', () => {
  assert.equal(toIndianMobile('9876543210'), '9876543210');
});

test('rejects anything that is not an Indian mobile number', () => {
  assert.equal(toIndianMobile('+1 415 555 0100'), null);
  assert.equal(toIndianMobile('0201234567'), null);
  assert.equal(toIndianMobile('12345'), null);
  assert.equal(toIndianMobile(''), null);
  assert.equal(toIndianMobile(null), null);
});

import assert from 'node:assert';
import { test } from 'node:test';
import { ago, spanWords, initials, displayName, platformLabel } from './feedbackMeta.ts';

const NOW = new Date(2026, 10, 21, 12, 0, 0).getTime();
const MIN = 60 * 1000;

test('ago shows minutes, hours and days, then a date', () => {
  assert.strictEqual(ago(NOW - 20 * 1000, NOW), 'now');
  assert.strictEqual(ago(NOW - 12 * MIN, NOW), '12m');
  assert.strictEqual(ago(NOW - 3 * 60 * MIN, NOW), '3h');
  assert.strictEqual(ago(NOW - 2 * 24 * 60 * MIN, NOW), '2d');
  assert.strictEqual(ago(new Date(2026, 9, 3, 9, 0).getTime(), NOW), '3 Oct');
});

test('spanWords says how long something has waited', () => {
  assert.strictEqual(spanWords(NOW - 10 * MIN, NOW), 'under an hour');
  assert.strictEqual(spanWords(NOW - 60 * MIN, NOW), '1 hour');
  assert.strictEqual(spanWords(NOW - 5 * 60 * MIN, NOW), '5 hours');
  assert.strictEqual(spanWords(NOW - 2 * 24 * 60 * MIN, NOW), '2 days');
});

test('initials and display name fall back from name to email', () => {
  assert.strictEqual(initials('Priya Sharma', 'p@x.com'), 'PS');
  assert.strictEqual(initials(null, 'arjun.mehta@example.com'), 'AM');
  assert.strictEqual(initials(null, null), '?');
  assert.strictEqual(displayName('  ', 'a@b.com'), 'a@b.com');
  assert.strictEqual(displayName(null, null), 'Deleted user');
});

test('platformLabel formats the phone OS', () => {
  assert.strictEqual(platformLabel('android', '14'), 'Android 14');
  assert.strictEqual(platformLabel('ios', '18.1'), 'iOS 18.1');
  assert.strictEqual(platformLabel(null, '14'), null);
});

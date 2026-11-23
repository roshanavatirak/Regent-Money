import assert from 'node:assert';
import { test } from 'node:test';
import { buildInviteMessage } from './inviteMessage.ts';

const LINK = 'https://regent-money.onrender.com/r/2ry6p2b8';

test('invite message keeps the link on its own line and signs with the first name', () => {
  const msg = buildInviteMessage(LINK, 'Priya Sharma');
  const lines = msg.split('\n');
  assert.ok(lines.includes(LINK));
  assert.strictEqual(lines[lines.length - 1], '– Priya');
  assert.match(msg, /bank SMS/);
});

test('invite message has no sign-off when the name is missing or not a name', () => {
  for (const name of [undefined, null, '', '   ', '+919876543210']) {
    const lines = buildInviteMessage(LINK, name).split('\n');
    assert.strictEqual(lines[lines.length - 1], LINK);
  }
});

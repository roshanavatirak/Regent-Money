import assert from 'node:assert';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseSMS, isOtpMessage } from './smsParser.ts';

// Shared with android SmsParserTest and the backend parser spec
const { cases } = JSON.parse(
  fs.readFileSync(new URL('./__fixtures__/sms-parity-cases.json', import.meta.url), 'utf8')
);

test('parseSMS and isOtpMessage match the shared parity cases', () => {
  for (const c of cases) {
    assert.strictEqual(isOtpMessage(c.body), c.otp, c.body);
    const parsed = parseSMS(c.sender, c.body);
    assert.deepStrictEqual(parsed === null ? null : JSON.parse(JSON.stringify(parsed)), c.expected, c.body);
  }
});

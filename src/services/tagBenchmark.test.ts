import assert from 'node:assert';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseSMS } from './smsParser.ts';
import { predictTagForTransaction } from '../constants/transactionTags.ts';
import { getCategory } from '../constants/categories.ts';

// Shared with backend/src/sync/tag-benchmark.spec.ts
const { cases } = JSON.parse(
  fs.readFileSync(new URL('./__fixtures__/tag-benchmark-cases.json', import.meta.url), 'utf8'),
) as { cases: Array<{ name: string; kind: string; expected: string; sender: string; body: string }> };

/** Phone pipeline: parse the SMS, then auto-tag it (no learned rules). */
const tagOf = (sender: string, body: string) => {
  const p = parseSMS(sender, body);
  return p ? getCategory(predictTagForTransaction(p.merchant, body, p.type, {}, !!p.isSalary)).id : '(not parsed)';
};

test('auto-tagging accuracy on the labelled benchmark stays high', () => {
  const misses: string[] = [];
  let wrong = 0;
  for (const c of cases) {
    const got = tagOf(c.sender, c.body);
    if (got !== c.expected) {
      if (got !== 'miscellaneous') wrong++;
      misses.push(`${c.name}: want ${c.expected}, got ${got}`);
    }
  }
  const accuracy = (cases.length - misses.length) / cases.length;
  // Misc is a safe miss (the user tags it); a confident wrong tag is the costly kind
  assert.ok(accuracy >= 0.95, `accuracy ${(accuracy * 100).toFixed(1)}%\n${misses.join('\n')}`);
  assert.ok(wrong / cases.length <= 0.02, `wrong tags ${wrong}\n${misses.join('\n')}`);
});

test('no ordinary payment is tagged Self transfer (that hides it from spending)', () => {
  for (const c of cases) {
    if (c.expected !== 'self_transfer') assert.notStrictEqual(tagOf(c.sender, c.body), 'self_transfer', c.name);
  }
});

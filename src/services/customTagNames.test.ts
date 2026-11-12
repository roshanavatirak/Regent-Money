import assert from 'node:assert';
import { test } from 'node:test';
import { cleanTagName, isCustomTagName, mergeTagNames } from './customTagNames.ts';

const builtIn = (n: string) => ['food', 'misc', 'miscellaneous'].includes(n.toLowerCase());

test('keeps real custom names and rejects built-ins, budget ids and junk', () => {
  assert.strictEqual(isCustomTagName('Google Play Console', builtIn), true);
  assert.strictEqual(isCustomTagName('Misc', builtIn), false);
  assert.strictEqual(isCustomTagName('custom_haircut_mhx2k9a1', builtIn), false);
  assert.strictEqual(isCustomTagName('x', builtIn), false);
  assert.strictEqual(isCustomTagName('a'.repeat(41), builtIn), false);
  assert.strictEqual(cleanTagName('  Hair   cut '), 'Hair cut');
});

test('merges server and payee-rule tags without duplicates, first spelling wins', () => {
  const { merged, added } = mergeTagNames(
    ['Haircut'],
    ['haircut', 'Google Play Console', 'food', 'custom_gym_mhx2k9a1', ' google play console '],
    builtIn,
  );
  assert.deepStrictEqual(merged, ['Haircut', 'Google Play Console']);
  assert.deepStrictEqual(added, ['Google Play Console']);
});

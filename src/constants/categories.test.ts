import assert from 'node:assert';
import { test } from 'node:test';
import { CATEGORIES, getCategory, searchCategories } from './categories.ts';

const NEW_TAGS: Array<[string, string, string]> = [
  ['subscriptions', 'Subscriptions', 'spending'],
  ['household_help', 'Household help', 'spending'],
  ['fitness', 'Fitness', 'spending'],
  ['festivals', 'Festivals', 'spending'],
  ['business_expense', 'Business expense', 'spending'],
  ['gifts', 'Gifts', 'billsCare'],
  ['family_support', 'Family support', 'billsCare'],
  ['cash_withdrawals', 'Cash withdrawal', 'money'],
  ['emi_loans', 'EMI & loans', 'money'],
  ['card_bill', 'Card bill', 'money'],
  ['tax', 'Tax', 'money'],
];

test('all 11 new tags are built in, with their label and section', () => {
  for (const [id, label, group] of NEW_TAGS) {
    const c = getCategory(id);
    assert.strictEqual(c.isCustom, false, id);
    assert.strictEqual(c.label, label, id);
    assert.strictEqual(c.group, group, id);
  }
  assert.strictEqual(CATEGORIES.length, 41);
});

test('ids the app already saved for these tags now show the new tag, not a custom one', () => {
  // Older auto-tagging stored these ids, which used to show as plain custom tags
  assert.strictEqual(getCategory('cash_withdrawals').label, 'Cash withdrawal');
  assert.strictEqual(getCategory('emi_loans').label, 'EMI & loans');
  assert.strictEqual(getCategory('fitness').label, 'Fitness');
  assert.strictEqual(getCategory('business_expense').label, 'Business expense');
});

test('old names move to their new tag', () => {
  assert.strictEqual(getCategory('emi').id, 'emi_loans');
  assert.strictEqual(getCategory('loan').id, 'emi_loans');
  assert.strictEqual(getCategory('gift').id, 'gifts');
  assert.strictEqual(getCategory('gifts').id, 'gifts');
  assert.strictEqual(getCategory('ott').id, 'subscriptions');
  assert.strictEqual(getCategory('subscriptions').id, 'subscriptions');
  assert.strictEqual(getCategory('ATM').id, 'cash_withdrawals');
  assert.strictEqual(getCategory('Credit card bill').id, 'card_bill');
  // What stays where it was
  assert.strictEqual(getCategory('charity').id, 'donation');
  assert.strictEqual(getCategory('movies').id, 'entertainment');
  assert.strictEqual(getCategory('financial').id, 'financial_services');
});

test('every id, label and alias points to exactly one tag', () => {
  const seen = new Map<string, string>();
  const norm = (s: string) => s.toLowerCase().trim().replace(/&/g, 'and').replace(/[\s-]+/g, '_');
  for (const c of CATEGORIES) {
    for (const key of [c.id, c.label, ...(c.aliases || [])]) {
      const k = norm(key);
      const owner = seen.get(k);
      assert.ok(!owner || owner === c.id, `"${key}" is used by both ${owner} and ${c.id}`);
      seen.set(k, c.id);
    }
  }
});

test('search finds the new tags by everyday words', () => {
  assert.ok(searchCategories('maid').some((c) => c.id === 'household_help'));
  assert.ok(searchCategories('gym').some((c) => c.id === 'fitness'));
  assert.ok(searchCategories('gst').some((c) => c.id === 'tax'));
  assert.ok(searchCategories('atm').some((c) => c.id === 'cash_withdrawals'));
});

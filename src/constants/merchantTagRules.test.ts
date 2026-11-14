import assert from 'node:assert';
import fs from 'node:fs';
import { test } from 'node:test';
import { creditTag, looksLikePerson, predictTag } from './merchantTagRules.ts';

test('the app and server copies of the rules are identical', () => {
  const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.strictEqual(
    read('../../backend/src/sync/merchant-tag-rules.ts'),
    read('./merchantTagRules.ts'),
    'Copy src/constants/merchantTagRules.ts to backend/src/sync/merchant-tag-rules.ts',
  );
});

test('an SBI "trf to" payment is a payment, not a self transfer', () => {
  const sbi = 'Dear UPI user A/C X5039 debited by 349.0 on date 02Nov26 trf to SWIGGY Refno 433355556666. -SBI';
  assert.strictEqual(predictTag('Swiggy', sbi, 'debit'), 'food');
  assert.strictEqual(predictTag('Rahul Sharma', sbi, 'debit'), 'money_transfer');
  // Real own-account wording still counts
  assert.strictEqual(predictTag('Transfer XX9988', 'Rs 5000 transfer to own a/c', 'debit'), 'self_transfer');
  assert.strictEqual(predictTag('Self transfer', '', 'credit'), 'self_transfer');
});

test('short keywords only match whole words', () => {
  assert.notStrictEqual(predictTag('Coca Cola Vending'), 'transport'); // "ola"
  assert.notStrictEqual(predictTag('Public Library'), 'insurance'); // "lic"
  assert.notStrictEqual(predictTag('Space Studio'), 'personal'); // "spa"
  assert.notStrictEqual(predictTag('Premium Motors'), 'emi_loans'); // "emi"
  assert.strictEqual(predictTag('LIC of India'), 'insurance');
  assert.strictEqual(predictTag('Ola'), 'transport');
});

test('longer keywords match the start of a word, and inside one-word UPI ids', () => {
  assert.strictEqual(predictTag('Pawar Petroleum'), 'fuel');
  assert.strictEqual(predictTag('pawarpetroleum'), 'fuel');
  assert.strictEqual(predictTag('bajajfinserv'), 'emi_loans');
  assert.strictEqual(predictTag('actfibernet'), 'bills');
  assert.strictEqual(predictTag('hotelsagar'), 'food');
});

test('brand mix-ups that used to happen', () => {
  assert.strictEqual(predictTag('Hotel Sagar'), 'food'); // an Indian "hotel" is usually a restaurant
  assert.strictEqual(predictTag('Lemon Tree Hotels'), 'travel');
  assert.strictEqual(predictTag('Ravi Auto Works'), 'services');
  assert.strictEqual(predictTag('Star Health'), 'insurance');
  assert.strictEqual(predictTag('Jio Recharge'), 'recharge');
  assert.strictEqual(predictTag('Airtel Postpaid'), 'bills');
  assert.strictEqual(predictTag('JioMart'), 'groceries');
  assert.strictEqual(predictTag('AJIO'), 'shopping');
  assert.strictEqual(predictTag('Zerodha'), 'investment');
});

test('phrases in the SMS text count only for wording banks never use in boilerplate', () => {
  assert.strictEqual(predictTag('Spends', 'Rs 5,000 debited from A/c XX5039 towards Credit Card XX1234 payment'), 'card_bill');
  assert.strictEqual(predictTag('Spends', 'Rs 2000 withdrawn at ATM S1BW000123'), 'cash_withdrawals');
  // Promotional "convert to EMI" text must not make a purchase an EMI
  assert.strictEqual(predictTag('Amazon', 'Spent Rs 9,999 on Card XX1234 at AMAZON. Convert to EMI now'), 'shopping');
  // "ATM PIN" in a safety line is not a withdrawal
  assert.strictEqual(predictTag('Swiggy', 'Rs 300 debited. Never share your ATM PIN'), 'food');
});

test('payments to people become Sent; businesses named after people do not', () => {
  for (const name of ['Rahul Sharma', 'Priya Patel', 'rameshkumar', 'vikramreddy', 'Mohammed Irfan', 'anandkumar']) {
    assert.strictEqual(looksLikePerson(name), true, name);
    assert.strictEqual(predictTag(name), 'money_transfer', name);
  }
  for (const name of ['Kumar Tailors', 'Sharma Sweets', 'Patel Brothers', 'Gupta General Store', 'Swiggy', 'chaayos', 'Sanjay']) {
    assert.strictEqual(looksLikePerson(name), false, name);
  }
});

test('money coming in', () => {
  assert.strictEqual(creditTag('ACME', 'by NEFT from ACME - SALARY OCT'), 'salary');
  assert.strictEqual(creditTag('x', '', true), 'salary');
  assert.strictEqual(creditTag('Refund', 'credited towards Refund from AMAZON'), 'cashback');
  assert.strictEqual(creditTag('Credits', 'interest of Rs 120.00 has been credited'), 'interest');
  assert.strictEqual(creditTag('rahulsharma', 'credited from VPA rahulsharma@okaxis'), 'money_received');
});

test('nothing known stays Misc', () => {
  assert.strictEqual(predictTag('XYZ123'), 'miscellaneous');
  assert.strictEqual(predictTag(''), 'miscellaneous');
});

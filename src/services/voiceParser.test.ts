import assert from 'node:assert';
import { test } from 'node:test';
import { parseSpokenTransaction, readSpokenLocally, amountWasSpoken, matchAccount, normalizeSpoken } from './voiceParser.ts';

// Mirrors backend/src/ai/voice-parser.spec.ts
const ACCOUNTS = ['HDFC Bank', 'Kotak Mahindra Bank', 'State Bank of India', 'Cash'];
const NOW = Date.UTC(2026, 10, 14, 4, 30); // 14 Nov 2026, 10:00 IST
const amountOf = (s: string) => parseSpokenTransaction(s, ACCOUNTS, NOW).amount;

test('spoken amounts in digits, Hindi and English words', () => {
  const cases: Array<[string, number]> = [
    ['450 rupaye', 450],
    ['₹1,200 diye', 1200],
    ['2k bheje', 2000],
    ['dedh sau ki chai', 150],
    ['dhai hazaar kiraya', 2500],
    ['saade teen sau rupaye', 350],
    ['paune do sau rupaye', 175],
    ['do sau pachas rupaye', 250],
    ['2 hazaar 500 rupaye', 2500],
    ['two hundred and fifty rupees', 250],
    ['४५० रुपये खर्च किए', 450],
    ['पांच सौ रुपये दिए', 500],
  ];
  for (const [said, want] of cases) assert.strictEqual(amountOf(said), want, said);
  assert.strictEqual(amountOf('Rahul ko paise diye cash mein'), null);
});

test('a Hinglish expense with a bank', () => {
  const d = parseSpokenTransaction('Swiggy pe 450 rupaye kharch kiye HDFC se', ACCOUNTS, NOW);
  assert.deepStrictEqual(
    { type: d.type, amount: d.amount, merchant: d.merchant, category: d.category, account: d.account },
    { type: 'debit', amount: 450, merchant: 'Swiggy', category: 'food', account: 'HDFC Bank' },
  );
});

test('income, cash, Devanagari bank names and past days', () => {
  assert.strictEqual(parseSpokenTransaction('Rahul se 500 rupaye mile', ACCOUNTS, NOW).type, 'credit');
  assert.strictEqual(parseSpokenTransaction('chai 20 rupaye cash', ACCOUNTS, NOW).account, 'Cash');
  assert.strictEqual(parseSpokenTransaction('पेट्रोल 500 रुपये कोटक से', ACCOUNTS, NOW).account, 'Kotak Mahindra Bank');
  assert.strictEqual(parseSpokenTransaction('kal auto 80 rupaye', ACCOUNTS, NOW).date, '2026-11-13');
  assert.strictEqual(matchAccount(normalizeSpoken('I spent ₹450 at Swiggy from HDFC.'), ACCOUNTS), 'HDFC Bank');
  assert.strictEqual(parseSpokenTransaction('Amazon 999 rupaye', ACCOUNTS, NOW).account, null);
});

test('the rules know when they are enough and when the AI should look', () => {
  // Clear: one amount, a known brand
  assert.strictEqual(readSpokenLocally('Swiggy pe 450 rupaye kharch kiye HDFC se', ACCOUNTS, NOW).confident, true);
  assert.strictEqual(readSpokenLocally('petrol 500 rupaye cash', ACCOUNTS, NOW).confident, true);
  // No amount
  assert.strictEqual(readSpokenLocally('Rahul ko paise diye', ACCOUNTS, NOW).confident, false);
  // Two transactions in one sentence
  assert.strictEqual(readSpokenLocally('chai 20 aur auto 50', ACCOUNTS, NOW).confident, false);
  // Unknown purpose
  assert.strictEqual(readSpokenLocally('Sharma ji ko 300 rupaye diye', ACCOUNTS, NOW).confident, false);
  // Name written in Devanagari needs transliterating
  assert.strictEqual(readSpokenLocally('स्विगी पे 450 रुपये', ACCOUNTS, NOW).confident, false);
});

test('amountWasSpoken', () => {
  assert.strictEqual(amountWasSpoken('dedh sau ki chai', 150), true);
  assert.strictEqual(amountWasSpoken('450 rupaye', 540), false);
});

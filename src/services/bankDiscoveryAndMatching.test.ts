// Discovery + "already linked" matching, run against the real modules the setup screen uses.
// Run: node --experimental-strip-types --import ./scripts/test/register.mjs --test src/services/bankDiscoveryAndMatching.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractDiscoveredBanksFromMessages } from './bankDiscoveryService.ts';
import { findLinkedProfile, isLinkedAccount } from './bankMatching.ts';

const T = 1762250000000;
const discover = (...msgs: Array<[string, string]>) =>
  extractDiscoveredBanksFromMessages(msgs.map(([address, body], i) => ({ address, body, date: T + i * 60000 })));

test('debit card SMS that names the account is filed under the account, with its balance', () => {
  const found = discover([
    'VM-KOTAKB',
    'Kotak Bank: Rs 256.00 debited on your Debit Card ending 1479 on 04-Nov-26 at SWIGGY. Avail Bal in A/c XX5039 is Rs 1,420.50.',
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].accountNumberSuffix, '5039');
  assert.equal(found[0].accountType, 'Savings');
  assert.equal(found[0].currentBalance, '1420.5');
});

test('debit card SMS with only the card number creates no account', () => {
  const found = discover(
    ['VM-KOTAKB', 'Kotak Bank: Rs 256.00 debited on your Debit Card ending 1479 at SWIGGY on 04-Nov-26. Avl Bal Rs 18,287.00'],
    ['VK-SBIINB', 'Rs 500 spent using SBI Debit Card XX6090 at AMAZON. Avl Bal Rs 18,287.00'],
  );
  assert.deepEqual(found, []);
});

test('card number with no card type creates no account', () => {
  assert.deepEqual(discover(['VM-KOTAKB', 'Rs 300.00 spent on Kotak Card XX4455 at AMAZON on 04-Nov-26.']), []);
});

test('"debited on your Credit Card" is a credit card, not savings', () => {
  const found = discover([
    'AX-HDFCBK',
    'Rs 500.00 debited on your HDFC Bank Credit Card ending 8899 on 04-Nov-26 at SHELL. Avl Limit: Rs 45,000.00.',
  ]);
  assert.equal(found.length, 1);
  assert.equal(found[0].accountNumberSuffix, '8899');
  assert.equal(found[0].accountType, 'Credit Card');
});

const kotak5039 = { id: 'k1', bankName: 'Kotak Mahindra Bank', accountNumberSuffix: '5039', currentBalance: 18287, debitCardSuffixes: [] as string[] };
const kotak8821 = { id: 'k2', bankName: 'Kotak Mahindra Bank', accountNumberSuffix: '8821', currentBalance: 900, debitCardSuffixes: [] as string[] };
const scanned = (accountNumberSuffix: string) => ({ bankName: 'Kotak Mahindra Bank', accountNumberSuffix });

test('same account number at the same bank is already linked', () => {
  assert.equal(isLinkedAccount(scanned('5039'), kotak5039), true);
  assert.equal(isLinkedAccount({ bankName: 'Kotak', accountNumberSuffix: '5039' }, kotak5039), true);
});

test('a second real account at a bank with one linked account is NOT treated as linked', () => {
  assert.equal(isLinkedAccount(scanned('7788'), kotak5039), false);
  assert.equal(findLinkedProfile(scanned('7788'), [kotak5039]), undefined);
});

test('a card number links only when it is registered on that account', () => {
  assert.equal(findLinkedProfile(scanned('1479'), [kotak5039, kotak8821]), undefined);
  const withCard = { ...kotak5039, debitCardSuffixes: ['1479'] };
  assert.equal(findLinkedProfile(scanned('1479'), [withCard, kotak8821]), withCard);
  // Backend sends the card list as a comma-separated string
  assert.equal(isLinkedAccount(scanned('1479'), { ...kotak5039, debitCardSuffixes: '1479,2222' }), true);
});

test('same number at a different bank is not linked, and empty names never match', () => {
  assert.equal(isLinkedAccount({ bankName: 'State Bank of India', accountNumberSuffix: '5039' }, kotak5039), false);
  assert.equal(isLinkedAccount({ bankName: '', accountNumberSuffix: '5039' }, kotak5039), false);
});

test('a renamed account ("Kotak Salary") still matches through its SMS sender tags', () => {
  const renamed = { ...kotak5039, bankName: 'Kotak Salary', smsSenderId: 'KOTAKB,KOTAKM' };
  const [found] = discover(['VM-KOTAKB', 'Rs 120.00 debited from A/c XX5039 via UPI to SWIGGY on 04-Nov-26.']);
  assert.equal(isLinkedAccount(found, renamed), true);
  // Same digits, but a renamed account at another bank: no match
  assert.equal(isLinkedAccount(found, { ...renamed, smsSenderId: 'HDFCBK' }), false);
});

test('the "already linked" row shows the saved profile balance, not the scan', () => {
  const found = discover(['VM-KOTAKB', 'Rs 120.00 debited from A/c XX5039 via UPI to SWIGGY on 04-Nov-26.']);
  assert.equal(found[0].currentBalance, ''); // no balance in this SMS: the scan alone would show ₹0
  assert.equal(findLinkedProfile(found[0], [kotak5039])?.currentBalance, 18287);
});

// src/services/bankDiscoveryService.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDiscoveredBanksFromMessages } from './bankDiscoveryService';

test('extractDiscoveredBanksFromMessages discovers distinct bank accounts with latest balances', () => {
  const mockMessages = [
    {
      address: 'AD-HDFCBK',
      body: 'Rs 450.00 debited from a/c XX5039 to Swiggy on 10-Oct. Avl bal Rs 12,500.00.',
      date: 1728550000000,
    },
    {
      address: 'AD-HDFCBK',
      body: 'Rs 1,200.00 debited from a/c XX5039 to Amazon on 12-Oct. Avl bal Rs 11,300.00.',
      date: 1728720000000, // Newer message for HDFC 5039
    },
    {
      address: 'AD-HDFCBK',
      body: 'Salary of Rs 85,000.00 credited to your a/c XX8842. Clear bal Rs 95,000.00.',
      date: 1728600000000, // Different account at same bank
    },
    {
      address: 'VK-SBIINB',
      body: 'Your a/c XX1234 debited by 250.00 on 11-Oct via UPI. Bal is Rs 4,500.00.',
      date: 1728650000000,
    },
    {
      address: 'AD-HDFCBK',
      body: 'Your OTP for online transaction is 492019. Never share OTP with anyone.',
      date: 1728800000000, // OTP should be ignored
    },
    {
      address: 'PersonalFriend',
      body: 'Hey can you send Rs 500 to my account?',
      date: 1728900000000, // Non-bank sender should be ignored
    },
  ];

  const discovered = extractDiscoveredBanksFromMessages(mockMessages);

  // Expect 3 distinct accounts: HDFC 5039, HDFC 8842, SBI 1234
  assert.equal(discovered.length, 3);

  const hdfc5039 = discovered.find((b) => b.accountNumberSuffix === '5039');
  assert.ok(hdfc5039);
  assert.equal(hdfc5039.bankName, 'HDFC Bank');
  assert.equal(hdfc5039.bankCode, 'HDFC');
  // Balance should be from the newer SMS (11,300), not the older one (12,500)
  assert.equal(hdfc5039.currentBalance, '11300');

  const hdfc8842 = discovered.find((b) => b.accountNumberSuffix === '8842');
  assert.ok(hdfc8842);
  assert.equal(hdfc8842.accountNumberSuffix, '8842');
  assert.equal(hdfc8842.currentBalance, '95000');

  const sbi1234 = discovered.find((b) => b.accountNumberSuffix === '1234');
  assert.ok(sbi1234);
  assert.equal(sbi1234.bankCode, 'SBIN');
  assert.equal(sbi1234.currentBalance, '4500');
});

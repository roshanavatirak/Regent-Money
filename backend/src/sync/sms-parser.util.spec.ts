import {
  parseSMS,
  extractAccountSuffix,
  detectBankFromSender,
} from './sms-parser.util';

describe('Financial SMS Parser & Bank Attribution Engine', () => {
  describe('detectBankFromSender', () => {
    it('should accurately resolve bank from Indian DLT SMS headers', () => {
      expect(detectBankFromSender('AD-SBIINB')).toBe('SBI');
      expect(detectBankFromSender('VK-KOTAKB')).toBe('Kotak');
      expect(detectBankFromSender('BW-HDFCBK')).toBe('HDFC');
      expect(detectBankFromSender('DZ-ICICIB')).toBe('ICICI');
      expect(detectBankFromSender('AXISBK')).toBe('Axis');
      expect(detectBankFromSender('PNBSMS')).toBe('PNB');
      expect(detectBankFromSender('BOBTXN')).toBe('Bank of Baroda');
      expect(detectBankFromSender('CANBNK')).toBe('Canara Bank');
      expect(detectBankFromSender('UBISMS')).toBe('Union Bank');
      expect(detectBankFromSender('YESBNK')).toBe('Yes Bank');
    });

    it('should return null for unknown or generic senders', () => {
      expect(detectBankFromSender('')).toBeNull();
      expect(detectBankFromSender('AM-MYGATE')).toBeNull();
      expect(detectBankFromSender('9876543210')).toBeNull();
    });
  });

  describe('extractAccountSuffix', () => {
    it('should extract masked card numbers like X6090 correctly', () => {
      const msg = 'Dear Customer, transaction number 628501422886 for Rs.5987.10 by SBI Debit Card X6090 done at AMAZASSP';
      expect(extractAccountSuffix(msg)).toBe('6090');
    });

    it('should never falsely match "ac" inside the word "transaction"', () => {
      const msg = 'Transaction number 9988776655 for Rs 500 debited from card ending with 4321';
      expect(extractAccountSuffix(msg)).toBe('4321');
    });

    it('should handle variations: a/c XX1234, Card **3333, and A/c ...4020', () => {
      expect(extractAccountSuffix('Rs 500 debited from A/c ...4020 on 12-Oct-26')).toBe('4020');
      expect(extractAccountSuffix('Paid Rs 1,200 from card ending with 5678')).toBe('5678');
      expect(extractAccountSuffix('Txn of Rs 250 done on Card **3333 at Cafe Coffee Day')).toBe('3333');
      expect(extractAccountSuffix('Rs 2,000 paid to SBI Life from a/c XX1234')).toBe('1234');
      expect(extractAccountSuffix('Account 123456789012 debited for Rs 100')).toBe('9012');
    });

    it('should prioritize masked suffix when multiple account matches exist', () => {
      const msg = 'Dear Customer, account 123456789 used for transaction on card X6090';
      expect(extractAccountSuffix(msg)).toBe('6090');
    });

    it('should return XXXX when no account pattern is found', () => {
      const msg = 'Rs 200 sent to Swiggy via UPI reference 9876543210';
      expect(extractAccountSuffix(msg)).toBe('XXXX');
    });
  });

  describe('parseSMS End-to-End Scenarios', () => {
    it('should accurately parse the real-world SBI debit card alert', () => {
      const sender = 'AD-SBIINB';
      const body =
        'Dear Customer, transaction number 628501422886 for Rs.5987.10 by SBI Debit Card X6090 done at AMAZASSP on 12Oct26 at 01:50:41. Your updated available balance is Rs.18287.25. If not done by you, forward this SMS to 7400165218/ call 1800111109/9449112211 to block card. GOI helpline for cyber fraud 1930.';

      const parsed = parseSMS(sender, body);
      expect(parsed).not.toBeNull();
      expect(parsed?.amount).toBe(5987.1);
      expect(parsed?.type).toBe('debit');
      expect(parsed?.accountSuffix).toBe('6090');
      expect(parsed?.bankName).toBe('SBI');
      expect(parsed?.availableBalance).toBe(18287.25);
      expect(parsed?.merchant).toBe('AMAZASSP');
    });

    it('should identify Kotak from sender even if payee text mentions SBI', () => {
      const sender = 'VK-KOTAKB';
      const body =
        'Rs 2,000.00 debited from Kotak Bank A/C XX1234 towards SBI Life Insurance on 12-Oct-26. Avl bal: Rs 5,450.00. UPI Ref 628501422886';

      const parsed = parseSMS(sender, body);
      expect(parsed).not.toBeNull();
      expect(parsed?.amount).toBe(2000);
      expect(parsed?.type).toBe('debit');
      expect(parsed?.bankName).toBe('Kotak'); // Must NOT be falsely identified as SBI
      expect(parsed?.accountSuffix).toBe('1234');
      expect(parsed?.availableBalance).toBe(5450);
      expect(parsed?.merchant).toContain('SBI Life');
    });

    it('should parse UPI payments with no account suffix', () => {
      const sender = 'SBIUPI';
      const body = 'Dear UPI user, Rs 150.00 debited from your VPA for transaction to Tea Post. UPI Ref 123456789012';

      const parsed = parseSMS(sender, body);
      expect(parsed).not.toBeNull();
      expect(parsed?.amount).toBe(150);
      expect(parsed?.type).toBe('debit');
      expect(parsed?.bankName).toBe('SBI');
      expect(parsed?.accountSuffix).toBe('XXXX');
    });
  });
});

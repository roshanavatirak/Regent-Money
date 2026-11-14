import { redactFinancialPii } from './pii-redaction';

const P = '[PHONE_REDACTED]';

/** The rules before this fix, to show that only the phone rule changed. */
const oldRedact = (t: string) =>
  t
    .replace(/\b\d{4}[-\s]\d{4}[-\s]\d{4}\b/g, '[AADHAAR_REDACTED]')
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN_REDACTED]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_REDACTED]')
    .replace(/(?:\+91[-\s]?)?[6-9]\d{9}\b/g, '[PHONE_REDACTED]')
    .replace(/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, '[IFSC_REDACTED]')
    .replace(
      /(?:A\/c(?:\s*No\.?)?|Account(?:\s*(?:Number|No\.?))?|Acc\s*No\.?)\s*[:#-]?\s*([0-9A-Za-z*X]{6,22})/gi,
      'Account No: [ACCOUNT_REDACTED]',
    )
    .replace(/(?:CIF(?:\s*No\.?)?|Customer\s*ID)\s*[:#-]?\s*([0-9A-Za-z]{6,16})/gi, 'CIF No: [CUSTOMER_ID_REDACTED]');

describe('redactFinancialPii: bank reference numbers stay whole', () => {
  it.each([
    ['12-digit UPI ref (RRN)', 'UPI/DR/629349184814/SWIGGY', '629349184814'],
    ['ref padded to 16 digits', 'UPI-SWIGGY 0000629349184814 01/10/26', '0000629349184814'],
    ['NEFT UTR with a letter prefix', 'NEFT CR-ACME TECHNOLOGIES-SALARY OCT N276260012345', 'N276260012345'],
    ['IMPS ref', 'IMPS/P2A/629312345678/RAHUL', '629312345678'],
    ['RTGS UTR', 'RTGS CR-HDFCR52026101298765432-ACME', 'HDFCR52026101298765432'],
    ['ref glued to letters', 'UPIAR629349184814DR', 'UPIAR629349184814DR'],
    ['10-digit ref after Ref No', 'Ref No: 7123456789 SWIGGY', '7123456789'],
    ['10-digit ref after UTR', 'UTR:9123456789', '9123456789'],
    ['10-digit ref after RRN', 'RRN 8123456789', '8123456789'],
    ['10-digit transaction ID', 'Txn ID 6123456789', '6123456789'],
    ['cheque number label', 'CHQ NO. 7000123456', '7000123456'],
  ])('%s', (_name, input, mustKeep) => {
    const out = redactFinancialPii(input);
    expect(out).toContain(mustKeep);
    expect(out).not.toContain(P);
  });
});

describe('redactFinancialPii: phone numbers are still removed', () => {
  it.each([
    ['plain 10 digits', 'Mob 9876543210 paid', `Mob ${P} paid`],
    ['with leading 0', 'call 09876543210', `call ${P}`],
    ['+91 joined', 'contact +919876543210.', `contact ${P}.`],
    ['+91 with hyphen', '+91-9876543210', P],
    ['+91 with spaces (missed before)', '+91 98765 43210', P],
    ['as a UPI ID', 'UPI-RAHUL KUMAR-9876543210@ybl-629349184814', `UPI-RAHUL KUMAR-${P}@ybl-629349184814`],
    ['as a UPI ID with 91', 'UPI/919876543210@paytm/Payment', `UPI/${P}@paytm/Payment`],
    ['between slashes', 'IMPS/P2A/9876543210/RAHUL', `IMPS/P2A/${P}/RAHUL`],
    ['at the end of a sentence', 'Call 9876543210. Thanks', `Call ${P}. Thanks`],
    ['after a dash', 'UPI-RAHUL-9876543210-PAYMENT', `UPI-RAHUL-${P}-PAYMENT`],
    ['at the end of a line', 'paid to\n9876543210', `paid to\n${P}`],
  ])('%s', (_name, input, expected) => {
    expect(redactFinancialPii(input)).toBe(expected);
  });

  it('removes the phone and keeps the ref in the same SBI narration', () => {
    const out = redactFinancialPii('TO TRANSFER-UPI/DR/629349184814/RAHUL KU/YESB/9876543210@ybl/Payment');
    expect(out).toBe(`TO TRANSFER-UPI/DR/629349184814/RAHUL KU/YESB/${P}@ybl/Payment`);
  });

  it('does not treat a word ending in a label as a label (PREF is not REF)', () => {
    expect(redactFinancialPii('PREF 9876543210')).toBe(`PREF ${P}`);
  });
});

describe('redactFinancialPii: amounts, dates and merchants are untouched', () => {
  it('keeps a full statement row as it was', () => {
    const rows = [
      '01/10/26 UPI-SWIGGY-swiggy@icici-629349184814 0000629349184814 01/10/26 349.00 24,651.00',
      '03/10/26 NEFT CR-ACME TECHNOLOGIES PVT LTD-SALARY OCT N276260012345 03/10/26 85,000.00 1,09,651.00',
      '15/10/2026 ATM WDL 6000.00 98765.43 Cr',
      '2026-10-20 BY CASH DEPOSIT 7,00,000.00 7,98,765.00',
      'TRANSFER 6123456789.00 Cr',
      'BALANCE 9876543210,50',
    ];
    for (const row of rows) expect(redactFinancialPii(row)).toBe(row);
  });
});

describe('redactFinancialPii: other personal details are removed as before', () => {
  it.each([
    ['Aadhaar', 'Aadhaar 2345 6789 0123 linked', 'Aadhaar [AADHAAR_REDACTED] linked'],
    ['PAN', 'PAN ABCDE1234F', 'PAN [PAN_REDACTED]'],
    ['email', 'mail rahul.k@gmail.com', 'mail [EMAIL_REDACTED]'],
    ['IFSC', 'UPI-SWIGGY-ICIC0000001-629349184814', 'UPI-SWIGGY-[IFSC_REDACTED]-629349184814'],
    ['account number', 'A/c No: 50100234567890', 'Account No: [ACCOUNT_REDACTED]'],
    ['customer ID', 'Customer ID: 12345678', 'CIF No: [CUSTOMER_ID_REDACTED]'],
  ])('%s', (_name, input, expected) => {
    expect(redactFinancialPii(input)).toBe(expected);
  });

  it('matches the old rules exactly on text without phone-like numbers', () => {
    const samples = [
      'Statement of Account A/c No: 50100234567890 CIF No: 87654321 IFSC HDFC0001234',
      'Name RAHUL KUMAR PAN ABCDE1234F Email rahul.k@gmail.com Aadhaar 2345-6789-0123',
      '01/10/26 UPI-SWIGGY-swiggy@icici-ICIC0000001-123456 349.00 24,651.00',
      'Opening Balance 25,000.00 Closing Balance 1,08,932.00 Page 1 of 4',
    ];
    for (const s of samples) expect(redactFinancialPii(s)).toBe(oldRedact(s));
  });

  it('gives the same result when run twice', () => {
    const text = 'UPI/DR/629349184814/RAHUL/9876543210@ybl +91 98765 43210 A/c No: 50100234567890';
    const once = redactFinancialPii(text);
    expect(redactFinancialPii(once)).toBe(once);
  });

  it('handles empty input', () => {
    expect(redactFinancialPii('')).toBe('');
  });
});

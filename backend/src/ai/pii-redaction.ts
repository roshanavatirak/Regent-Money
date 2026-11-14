/**
 * Removes personal details from statement text before it is sent to an AI, while keeping
 * what the AI needs to read transactions: amounts, dates, merchant names and the bank's
 * reference numbers (UPI RRN, IMPS / NEFT UTR, cheque and transaction IDs).
 *
 * Reference numbers matter: they are saved with each transaction and used to recognise the
 * same transaction when a statement is uploaded again.
 */

/** Not a letter or digit, so a match never starts or ends in the middle of a longer code. */
const START = '(?<![0-9A-Za-z])';
const END = '(?![0-9A-Za-z])';
/** Also not followed by decimals or more digit groups, so an amount like 6123456789.00 stays. */
const PHONE_END = `${END}(?![.,]\\d)`;

/** Labels after which a number is the bank's reference, not a phone number. */
const REF_LABEL =
  '(?<!(?<![A-Za-z])(?:UTR|RRN|REF|REFERENCE|TXN|TRAN|TRANSACTION|CHQ|CHEQUE)(?:[\\s:#./\\-]|NO|ID|NUM|NUMBER)*)';

const RULES: Array<[RegExp, string]> = [
  // 1. Aadhaar numbers (12 digits in groups of 4, with spaces or hyphens)
  [/\b\d{4}[-\s]\d{4}[-\s]\d{4}\b/g, '[AADHAAR_REDACTED]'],
  // 2. PAN (5 letters, 4 digits, 1 letter)
  [/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, '[PAN_REDACTED]'],
  // 3. Email addresses
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL_REDACTED]'],
  // 4a. Phone number used as a UPI ID: 9876543210@ybl, 919876543210@paytm (merchant IDs like swiggy@icici stay)
  [new RegExp(`${START}(?:\\+?91)?[6-9]\\d{9}(?=@)`, 'g'), '[PHONE_REDACTED]'],
  // 4b. Phone number written with +91: +919876543210, +91-9876543210, +91 98765 43210
  [new RegExp(`\\+91[-\\s]?[6-9]\\d{4}[-\\s]?\\d{5}${PHONE_END}`, 'g'), '[PHONE_REDACTED]'],
  // 4c. Phone number on its own: 9876543210 or 09876543210. Never part of a longer number or
  //     code (so the digits inside UPI refs like 629349184814 or UTRs like N276260012345
  //     stay), and not right after a reference label (Ref No: 7123456789).
  [new RegExp(`${START}${REF_LABEL}0?[6-9]\\d{9}${PHONE_END}`, 'gi'), '[PHONE_REDACTED]'],
  // 5. IFSC codes
  [/\b[A-Z]{4}0[A-Z0-9]{6}\b/g, '[IFSC_REDACTED]'],
  // 6. Account numbers after an account label (transaction refs elsewhere in the line stay)
  [
    /(?:A\/c(?:\s*No\.?)?|Account(?:\s*(?:Number|No\.?))?|Acc\s*No\.?)\s*[:#-]?\s*([0-9A-Za-z*X]{6,22})/gi,
    'Account No: [ACCOUNT_REDACTED]',
  ],
  // 7. CIF / customer ID
  [/(?:CIF(?:\s*No\.?)?|Customer\s*ID)\s*[:#-]?\s*([0-9A-Za-z]{6,16})/gi, 'CIF No: [CUSTOMER_ID_REDACTED]'],
];

export const redactFinancialPii = (rawText: string): string => {
  if (!rawText) return '';
  return RULES.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), rawText);
};

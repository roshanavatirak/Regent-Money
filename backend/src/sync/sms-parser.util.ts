// Server copy of src/services/smsParser.ts (keep identical; sms-parity-cases.json checks both).
// Server-only additions are at the end of the file.

export interface ParsedTransaction {
  amount: number;
  type: 'debit' | 'credit';
  merchant: string;
  accountSuffix: string;
  bankName: string;
  isSalary: boolean;
  availableBalance?: number;
  referenceId?: string;
}

// OTP rule, kept identical in src/services/smsParser.ts and android SmsParser.kt.
const OTP_FUTURE_TX = /\bwill\s*be\s*(?:debited|credited|refunded)\b/g;
const OTP_COMPLETED_TX = /\b(?:debited|credited|withdrawn|deposited|refunded|spent)\b/;
const OTP_DISCLAIMER = /\b(?:never|do\s*not|don't|not\s*to|will\s*never)\s+(?:share|disclose|tell|ask|asks|call)\b[^.]*/g;
const OTP_PHRASE = /\b(?:is\s*your\s*otp|your\s*otp\s*is|use\s*otp|enter\s*otp|otp\s*to\s*verify|otp\s*for|secret\s*(?:otp|code)|verification\s*code\s*is|is\s*the\s*verification\s*code|one\s*time\s*password\s*is)\b/;
const OTP_CODE_AFTER = /\b(?:otp|one\s*time\s*password|verification\s*code|security\s*code|authentication\s*code)\b[^.]{0,30}?\b\d{4,8}\b/;
const OTP_CODE_BEFORE = /\b\d{4,8}\b[^.]{0,20}?\b(?:otp|one\s*time\s*password|verification\s*code)\b/;

/**
 * True when the SMS carries a one-time password. A completed debit/credit alert that only
 * warns "never share your OTP" is not an OTP; a bank OTP mentioning "txn of Rs 500" is.
 */
export function isOtpMessage(body: string): boolean {
  if (!body) return false;
  const lower = body.replace(/\s+/g, ' ').trim().toLowerCase().replace(OTP_FUTURE_TX, ' ');
  if (OTP_COMPLETED_TX.test(lower)) return false;
  const text = lower.replace(OTP_DISCLAIMER, ' ');
  return OTP_PHRASE.test(text) || OTP_CODE_AFTER.test(text) || OTP_CODE_BEFORE.test(text);
}

const STRONG_CREDIT = /\b(?:credited|received|deposited|refunded)\b/;
const STRONG_DEBIT = /\b(?:debited|withdrawn|spent|deducted|sent|paid|charged|auto-debited)\b/;
const REVERSAL = /\b(?:refund|refunded|reversed|reversal)\b/;
const VPA_TO = /\bto\s+(?:vpa\s+)?([a-z0-9][a-z0-9._-]{1,40})@[a-z0-9.-]{2,}/i;
const VPA_FROM = /\b(?:from|by)\s+(?:vpa\s+)?([a-z0-9][a-z0-9._-]{1,40})@[a-z0-9.-]{2,}/i;
const PAYEE_CREDITED = /;\s*([A-Za-z][A-Za-z0-9\s&.*-]{1,40}?)\s+credited\b/i;
// Bare 12-digit UPI RRN: "UPI:432198765432", "(UPI 433398765432)"
const UPI_RRN = /\bupi\s*[:\-]?\s*(\d{12})\b/i;
const TO_ACCOUNT =/\bto\s+(?:a\/c|acct|account|ac)\s*(?:no\.?\s*)?[x*.]*(\d{3,18})\b/i;
const ON_MERCHANT =/\bon\s+([A-Za-z][A-Za-z0-9\s&*-]{1,40}?)(?=\s*[.,;]|\s+on\b|\s+avl|\s+avail|\s+if\b|$)/i;

const firstIndex = (rx: RegExp, text: string): number => {
  const m = rx.exec(text);
  return m ? m.index : -1;
};

/** Cleans a merchant candidate, or returns null for dates, amounts, payment rails and account words. */
function usableMerchant(raw: string): string | null {
  const r = raw.trim().replace(/^(?:mr|mrs|ms|dr)\.?\s+/i, '');
  if (
    r.length < 2 ||
    /^\d{1,2}:\d{2}/.test(r) ||
    /^\d{1,2}[-/.]\d{1,2}/.test(r) ||
    /^(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d+)?$/i.test(r) ||
    /^(?:rs\.?|inr|₹)(?:[\s\d.]|$)/i.test(r) ||
    /^(?:neft|imps|rtgs|upi|nach|ach|vpa)$/i.test(r) ||
    /^vpa\b/i.test(r) ||
    /^(?:kotak\s*bank|sbi|hdfc|icici|axis|pnb|a\/c|account)$/i.test(r) ||
    /\b(?:card|bank|a\/c|acct|account)\b/i.test(r)
  ) {
    return null;
  }
  return r;
}

/**
 * Highly resilient, production-grade semantic financial SMS parser.
 * Addresses critical real-world edge cases:
 * 1. "Credit Card" spends classified as DEBIT (not false credit).
 * 2. Balance vs. Amount disambiguation (ignores "Avl Bal Rs X" before the debit/credit).
 * 3. Future, conditional, and promised transactions ("will be credited") are filtered.
 * 4. Failed, declined, bounced, and reversed transactions are filtered.
 * 5. Time expressions ("debited at 10:00 AM") are excluded from merchant names.
 * 6. Word-boundary bank detection (prevents false matches like "reply YES" -> Yes Bank).
 * 7. Supports bare colon amounts ("debited: 500.00").
 */
export const parseSMS = (sender: string, body: string): ParsedTransaction | null => {
  if (!body) return null;

  const clean = body.replace(/\s+/g, ' ').trim();
  const lower = clean.toLowerCase();

  // 1. Exclude future, scheduled, or reversed transactions
  if (
    /\b(?:will be credited|will be debited|will be refunded|will be initiated|will be reversed|is scheduled|request has been placed|subject to clearing|declined|failed|unsuccessful|bounced|rejected|cancelled|canceled)\b/i.test(
      lower,
    )
  ) {
    return null;
  }

  // 2. Exclude OTP messages and marketing spam
  if (isOtpMessage(clean)) {
    return null;
  }
  if (/\b(?:pre-approved\s*loan|apply\s*now|claim\s*your\s*reward|congratulations!?\s*you\s*are\s*eligible)\b/i.test(lower)) {
    return null;
  }

  // 3. Detect Transaction Type (Debit vs Credit)
  // Mask 'credit card' / 'debit card' so "credit card" does not falsely trigger credit type
  const textWithoutCard = lower.replace(/\b(?:credit|debit)\s*card\b/g, 'card');
  let type: 'debit' | 'credit' | null = null;

  // Strong verbs decide first. When both appear, the earlier one describes the user's account:
  // "Acct XX6090 debited for Rs 89; NETFLIX credited" is a debit. Refunds/reversals are credits.
  const creditAt = firstIndex(STRONG_CREDIT, textWithoutCard);
  const debitAt = firstIndex(STRONG_DEBIT, textWithoutCard);
  if (creditAt !== -1 && REVERSAL.test(textWithoutCard)) {
    type = 'credit';
  } else if (creditAt !== -1 && debitAt !== -1) {
    type = debitAt < creditAt ? 'debit' : 'credit';
  } else if (creditAt !== -1) {
    type = 'credit';
  } else if (debitAt !== -1) {
    type = 'debit';
  } else if (
    /\b(?:credited|received|refunded|deposited|transferred\s*from|trf\s*from|\bcr\b|inward\s*remittance|cashback\s*received|money\s*received|added\s*to\s*(?:your\s*)?(?:a\/c|account))\b/i.test(
      textWithoutCard,
    )
  ) {
    type = 'credit';
  } else if (
    /\b(?:debited|debit|sent|paid|spent|withdrawn|used\s*for|used\s*at|purchase\s*of|transferred\s*to|trf\s*to|\bdr\b|txn\s*of|transaction\s*of|transaction\s*on|txn\s*on|done\s*at|done\s*on|done\s*for|charged|payment\s*of|payment\s*to|vpa\s*debited|deducted|auto-debit|auto-debited|money\s*sent)\b/i.test(
      textWithoutCard,
    )
  ) {
    type = 'debit';
  }

  // If no debit or credit action detected, not a completed financial transaction SMS
  if (!type) {
    return null;
  }

  // 3.5. Extract Authoritative Available / Closing Balance if explicitly mentioned in SMS
  let availableBalance: number | undefined;
  const balanceRx = /(?:avl\s*bal(?:ance)?|available\s*balance|avail\s*bal|clear\s*bal|total\s*bal|closing\s*bal|ledger\s*bal|\bbal(?:ance)?\s*(?:is)?)\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i;
  const balMatch = clean.match(balanceRx);
  if (balMatch && balMatch[1]) {
    const parsedBal = parseFloat(balMatch[1].replace(/,/g, ''));
    if (!isNaN(parsedBal) && parsedBal >= 0) {
      availableBalance = parsedBal;
    }
  }

  // 4. Extract Amount (Mask available/ledger balance to prevent picking up balance amount)
  const maskedForBalance = clean.replace(
    /(?:avl\s*bal|available\s*balance|avail\s*bal|bal|balance|clear\s*bal|total\s*bal|closing\s*bal|ledger\s*bal|limit)[:\s]*(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?/gi,
    '[BALANCE_MASK]',
  );

  let amount: number | null = null;
  let amountMatchIndex: number = -1;

  const amountRegexes = [
    // Preceded by verb: e.g. "debited by Rs 500", "was used for Rs 2,500.00", "debited: 500.00", "deducted Rs 200"
    /(?:debited|credited|paid|sent|withdrawn|spent|used\s*for|charge|towards|payment\s*of|txn\s*of|transaction\s*of|deducted)\s*(?:by|for|with|of)?\s*[:\-\s]*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    // Explicit currency symbol followed by number
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    // Verb with colon and number without currency
    /(?:debited|credited|deducted)\s*[:\-\s]+([\d,]+(?:\.\d{1,2})?)/i,
    // Suffix currency e.g. "500.00 INR"
    /([\d,]+(?:\.\d{1,2})?)\s*(?:rs\.?|inr|₹)/i,
  ];

  for (const rx of amountRegexes) {
    const match = maskedForBalance.match(rx);
    if (match && match[1]) {
      const parsedVal = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(parsedVal) && parsedVal > 0) {
        amount = parsedVal;
        amountMatchIndex = match.index !== undefined ? match.index : -1;
        break;
      }
    }
  }

  if (!amount) {
    return null;
  }

  // 5. Extract Account Number / Suffix
  // Matches: "A/C X4020", "Debit Card X6090", "A/C **9876", "Card ending with 4567", "A/c ...4020", "AC 5039"
  const accountSuffix = extractAccountSuffix(clean);

  // 6. Extract Merchant / Beneficiary / Counterparty
  let merchant = '';
  // Lookahead boundary stops before trailing references, dates, URLs, or support info
  const boundaryLookahead =
    '(?=(?:[,.]|\\s+from|\\s+to|\\s+ref|\\s+refno|\\s+upi|\\s+on|\\s+dated|\\s+if|\\s+avail|\\s+bal|\\s+not|\\s+has\\b|\\s+was\\b|\\s+credited\\b|\\s+debited\\b|\\s*[-–]|https?:|\\.\\s*|\\binfo:|$))';

  const merchantDebitRegexes = [
    new RegExp(
      `(?:trf\\s*to|transfer\\s*to|transferred\\s*to|paid\\s*to|sent\\s*to|\\bto\\b|\\bat\\b|towards)\\s+([A-Za-z0-9\\s&.*-]{2,40}?)` +
      boundaryLookahead,
      'i',
    ),
  ];

  // Explicit "from" wins over "by", which often precedes the amount or rail ("by Rs.500", "by NEFT")
  const merchantCreditRegexes = [
    new RegExp(
      `(?:transfer\\s*from|trf\\s*from|transferred\\s*from|received\\s*from|\\bfrom\\b)\\s+([A-Za-z0-9\\s&.*-]{2,40}?)` +
      boundaryLookahead,
      'i',
    ),
    new RegExp(`\\bby\\b\\s+([A-Za-z0-9\\s&.*-]{2,40}?)` + boundaryLookahead, 'i'),
  ];

  // A refund/reversal names the original merchant the way a debit does ("refund ... at MYNTRA")
  const isReversal = type === 'credit' && REVERSAL.test(textWithoutCard);
  const candidateRegexes =
    type === 'debit'
      ? merchantDebitRegexes
      : isReversal
        ? [...merchantDebitRegexes, ...merchantCreditRegexes]
        : merchantCreditRegexes;

  // A UPI handle is the most precise counterparty: "to VPA swiggy@icici", "from priya.k@ybl"
  const vpa = clean.match(type === 'debit' ? VPA_TO : VPA_FROM);
  if (vpa) merchant = usableMerchant(vpa[1].replace(/[._-]+/g, ' ')) || '';

  // Search scope order:
  // 1. Text AFTER the transaction amount (prevents capturing preamble text like "Reply YES to confirm your subscription")
  // 2. Full text as fallback (for messages where merchant precedes amount, e.g. "Swiggy was paid Rs. 300")
  const searchScopes: string[] = [];
  if (amountMatchIndex !== -1 && amountMatchIndex < clean.length) {
    searchScopes.push(clean.slice(amountMatchIndex));
  }
  searchScopes.push(clean);

  for (const scope of searchScopes) {
    if (merchant) break;
    for (const rx of candidateRegexes) {
      const match = scope.match(rx);
      const usable = match && match[1] ? usableMerchant(match[1]) : null;
      if (usable) {
        merchant = usable;
        break;
      }
    }
    if (merchant) break;
  }

  // Fallbacks for formats without a "to/at/from" phrase
  if (!merchant && type === 'debit') {
    // ICICI: "Acct XX6090 debited for Rs 89.00 on 02-Nov-26; NETFLIX credited"
    const payee = clean.match(PAYEE_CREDITED);
    if (payee) merchant = usableMerchant(payee[1]) || '';
  }
  if (!merchant && type === 'debit') {
    // Card spends: "spent using Card XX6090 on 02-Nov-26 on AMAZON PAY IN."
    const onRx = new RegExp(ON_MERCHANT.source, 'gi');
    let m: RegExpExecArray | null;
    while (!merchant && (m = onRx.exec(clean)) !== null) {
      merchant = usableMerchant(m[1]) || '';
    }
  }

  // Sanitize merchant string
  merchant = sanitizeMerchantName(merchant);
  if ((!merchant || merchant.length < 2) && type === 'debit') {
    // Account-to-account transfer: "to A/c **9988" -> "Transfer XX9988"
    const toAccount = clean.match(TO_ACCOUNT);
    if (toAccount) merchant = `Transfer XX${toAccount[1].slice(-4)}`;
  }
  if (!merchant || merchant.length < 2) {
    merchant = type === 'debit' ? 'Spends' : 'Credits';
  }

  // 7. Detect Bank Name
  // Priority 1: Authoritative Sender Header (DLT header: e.g. AD-SBIINB, VK-KOTAKB)
  let bankName = detectBankFromSender(sender) || 'Bank';

  // Priority 2: Full text fallback only when sender is unknown/generic
  if (bankName === 'Bank') {
    const cleanUpper = clean.toUpperCase();
    if (cleanUpper.includes('SBI') || cleanUpper.includes('STATE BANK')) {
      bankName = 'SBI';
    } else if (cleanUpper.includes('KOTAK') || cleanUpper.includes('KKBK')) {
      bankName = 'Kotak';
    } else if (cleanUpper.includes('HDFC')) {
      bankName = 'HDFC';
    } else if (cleanUpper.includes('ICICI')) {
      bankName = 'ICICI';
    } else if (cleanUpper.includes('AXIS')) {
      bankName = 'Axis';
    } else if (cleanUpper.includes('PNB') || cleanUpper.includes('PUNJAB')) {
      bankName = 'PNB';
    } else if (cleanUpper.includes('BOB') || cleanUpper.includes('BANK OF BARODA') || cleanUpper.includes('BARODA')) {
      bankName = 'Bank of Baroda';
    } else if (cleanUpper.includes('CANARA') || cleanUpper.includes('CANBNK')) {
      bankName = 'Canara Bank';
    } else if (cleanUpper.includes('UNION BANK') || cleanUpper.includes('UBISMS')) {
      bankName = 'Union Bank';
    } else if (cleanUpper.includes('INDUSIND')) {
      bankName = 'IndusInd';
    } else if (cleanUpper.includes('IDFC')) {
      bankName = 'IDFC First';
    } else if (cleanUpper.includes('PAYTM') || cleanUpper.includes('PPBL')) {
      bankName = 'Paytm Payments Bank';
    } else if (cleanUpper.includes('FEDERAL') || cleanUpper.includes('FEDBNK') || cleanUpper.includes('JUPITER') || cleanUpper.includes('FIMONEY') || cleanUpper.includes('EPICFI')) {
      bankName = 'Federal Bank';
    } else if (cleanUpper.includes('AUBANK') || cleanUpper.includes('AU BANK')) {
      bankName = 'AU Small Finance';
    } else if (cleanUpper.includes('RBL')) {
      bankName = 'RBL Bank';
    } else if (/\b(?:YES\s*BANK|YESBANK)\b/i.test(cleanUpper)) {
      bankName = 'Yes Bank';
    }
  }

  // 7.5 Extract UPI Reference / RRN / Bank Ref Number
  let referenceId: string | undefined;
  const refRx = /(?:upi\s*ref(?:\s*no\.?)?|rrn|ref\s*no\.?|reference(?:\s*no\.?)?|txn\s*(?:id|no)|imps\s*ref)\s*[:\-]?\s*([A-Za-z0-9]{8,22})/i;
  const refMatch = clean.match(refRx) || clean.match(UPI_RRN);
  if (refMatch && refMatch[1]) {
    referenceId = refMatch[1].trim();
  }

  // 8. Heuristic for Salary credit detection
  const isSalary =
    type === 'credit' &&
    (lower.includes('salary') ||
      lower.includes('employer') ||
      lower.includes('stipend') ||
      merchant.toLowerCase().includes('payroll'));

  return {
    amount,
    type,
    merchant,
    accountSuffix,
    bankName,
    isSalary,
    availableBalance,
    referenceId,
  };
};

/**
 * Normalizes and cleans merchant names:
 * Strips reference codes, URLs, and punctuation while preserving recognizable brands.
 */
function sanitizeMerchantName(name: string): string {
  if (!name) return '';

  let cleaned = name
    .replace(/\b(?:ref|refno|upi\s*ref|upi|rrn|val|info|trf|ft)\b.*$/i, '')
    .replace(/on\s+\d{2}[-/.]\d{2}[-/.]\d{2,4}.*$/i, '')
    .replace(/\s+(?:thru|through|via)\s+.*$/i, '')
    .replace(/[^\w\s\-\*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = cleaned.toLowerCase();
  if (lower.includes('zomato')) return 'Zomato';
  if (lower.includes('swiggy')) return 'Swiggy';
  if (lower.includes('blinkit')) return 'Blinkit';
  if (lower.includes('zepto')) return 'Zepto';
  if (lower.includes('uber')) return 'Uber';
  if (lower.includes('ola')) return 'Ola';
  if (lower.includes('rapido')) return 'Rapido';
  if (lower.includes('netflix')) return 'Netflix';
  if (lower.includes('spotify')) return 'Spotify';
  if (lower.includes('hotstar')) return 'Disney+ Hotstar';
  if (lower.includes('amazon')) return 'Amazon';
  if (lower.includes('flipkart')) return 'Flipkart';
  if (lower.includes('jio')) return 'Jio Recharge';
  if (lower.includes('airtel')) return 'Airtel Bill';
  if (lower.includes('starbucks')) return 'Starbucks';

  return cleaned;
}

/**
 * Authoritatively identifies bank from the SMS sender header (e.g. AD-SBIINB -> SBI, VK-KOTAKB -> Kotak).
 * Prevents false detections where message text mentions another bank (e.g. "paid to SBI Life Insurance").
 */
export function detectBankFromSender(sender: string): string | null {
  if (!sender) return null;
  const clean = sender.toUpperCase().replace(/^[A-Z]{2}-/i, '').replace(/[^A-Z0-9]/g, '');
  if (clean.includes('SBI') || clean.includes('SBIN')) return 'SBI';
  if (clean.includes('KOTAK') || clean.includes('KKBK') || clean.includes('KMBLTD')) return 'Kotak';
  if (clean.includes('HDFC')) return 'HDFC';
  if (clean.includes('ICICI')) return 'ICICI';
  if (clean.includes('AXIS') || clean.includes('UTIB')) return 'Axis';
  if (clean.includes('PNB') || clean.includes('PUNB')) return 'PNB';
  if (clean.includes('BOB') || clean.includes('BARB')) return 'Bank of Baroda';
  if (clean.includes('CANARA') || clean.includes('CNRB') || clean.includes('CANBNK')) return 'Canara Bank';
  if (clean.includes('UNION') || clean.includes('UBIN') || clean.includes('UBISMS')) return 'Union Bank';
  if (clean.includes('INDUS') || clean.includes('INDB')) return 'IndusInd';
  if (clean.includes('IDFC')) return 'IDFC First';
  if (clean.includes('PAYTM') || clean.includes('PPBL')) return 'Paytm Payments Bank';
  if (clean.includes('FEDERAL') || clean.includes('FEDBNK') || clean.includes('JUPITER') || clean.includes('FIMONEY') || clean.includes('EPICFI')) return 'Federal Bank';
  if (clean.includes('AUBANK') || clean.includes('AU BANK')) return 'AU Small Finance';
  if (clean.includes('RBL') || clean.includes('RATN')) return 'RBL Bank';
  if (clean.includes('YESB') || clean.includes('YESBNK')) return 'Yes Bank';
  if (clean.includes('BOI') || clean.includes('BOIND') || clean.includes('BKID')) return 'Bank of India';
  if (clean.includes('UCOBNK') || clean.includes('UCBA')) return 'UCO Bank';
  if (clean.includes('IOB')) return 'Indian Overseas Bank';
  if (clean.includes('CENTBK') || clean.includes('CBIN')) return 'Central Bank of India';
  if (clean.includes('INDIBK') || clean.includes('IDIB')) return 'Indian Bank';
  return null;
}

/**
 * Extracts account or card suffix with strict word boundaries and digit groups.
 * Scans all candidate matches in the SMS and prioritizes masked patterns (e.g. X6090, **1234, ...4020).
 */
export function extractAccountSuffix(cleanText: string): string {
  const rx = /\b(?:a\/c|acct|account|ac|card)\b[^0-9]{0,25}?([xX*.]*)(\d{3,18})\b/gi;
  const candidates: Array<{ suffix: string; hasMask: boolean }> = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(cleanText)) !== null) {
    const mask = m[1] || '';
    const digits = m[2];
    candidates.push({
      suffix: digits.slice(-4),
      hasMask: mask.length > 0,
    });
  }

  // Also check pattern where suffix precedes debited/credited: "XX1234 debited"
  if (candidates.length === 0) {
    const rxPre = /\b([xX*.]*)(\d{4,18})\s*(?:debited|credited|-credited|-debited)\b/gi;
    while ((m = rxPre.exec(cleanText)) !== null) {
      candidates.push({
        suffix: m[2].slice(-4),
        hasMask: (m[1] || '').length > 0,
      });
    }
  }

  if (candidates.length === 0) return 'XXXX';
  // Prefer the match with a mask (e.g. X6090, **1234, ...4020) over bare numbers
  const maskedCandidate = candidates.find((c) => c.hasMask);
  return maskedCandidate ? maskedCandidate.suffix : candidates[0].suffix;
}

// Mirrors DEFAULT_BANK_SENDERS in the Android SmsReceiver.
const KNOWN_BANK_SENDER_IDS = new Set([
  'HDFCBK', 'HDFCBN', 'HDFCLT', 'HDFCAL', 'HDFCCC', 'HDFCSM',
  'SBIPSG', 'SBIBNK', 'SBIUPI', 'SBIINB', 'ATMSBI', 'SBISMS', 'CBSSBI',
  'ICICIB', 'ICICIT', 'ICICIS', 'ICICAC', 'ICICIC',
  'AXISBK', 'AXISBC', 'AXISIN', 'AXISAL', 'AXISMS',
  'KOTAKB', 'KOTAKS', 'KOTAKN', 'KMBLTD',
  'BOBTXN', 'BOBSMS', 'BOBALT', 'BARB',
  'PNBSMS', 'PNBALT', 'PUNBNK', 'PNBTXN',
  'CNRBK', 'CANBNK', 'CANARA', 'CNRSMS',
  'UBININ', 'UBISMS', 'UNIONB',
  'IDFCFB', 'IDFCBK', 'IDFCBN',
  'INDBNK', 'INDUSB', 'INDUSI',
  'YESBNK', 'YESB', 'YESALT',
  'FEDBNK', 'FEDRAL', 'INDIBK', 'INDIAN',
  'BOIND', 'BOISMS', 'BOIALT', 'CBIN', 'CENTBK',
  'IOBCHN', 'IOBBNK', 'UCOBNK', 'RBLBNK', 'RBLSMS',
  'PAYTM', 'PAYTMB', 'AIRTEL', 'AIRBNK',
]);

/**
 * True only for bank DLT headers: a known default sender ID, a recognised bank header,
 * or one of the user's configured sender tags. Phone-number senders (personal SMS) never pass.
 */
export function isBankSmsSender(sender: string, configuredSenderIds: (string | null | undefined)[] = []): boolean {
  if (!sender) return false;
  const upper = sender.toUpperCase().trim();
  if (/^\+?[\d\s-]+$/.test(upper)) return false;

  // "AX-HDFCBK" / "VM-HDFCBK-S" -> "HDFCBK"
  const parts = upper.split('-');
  const core = (parts.length >= 2 ? parts[1] : parts[0]).replace(/[^A-Z0-9]/g, '');
  if (KNOWN_BANK_SENDER_IDS.has(core) || detectBankFromSender(sender)) return true;

  return configuredSenderIds.some((ids) => {
    const tags = (ids || '')
      .split(/[,;\s]+/)
      .map((t) => t.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
      .filter((t) => t.length >= 3);
    return tags.some((tag) => core === tag || core.includes(tag));
  });
}

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

  // 2. Exclude genuine OTP requests and marketing spam
  // NOTE: If message contains financial transaction indicators (debited, credited, spent, etc.),
  // any mention of OTP is merely a security disclaimer ("never share OTP") and must NOT be rejected.
  const hasTxIndicator = /\b(?:debited|credited|withdrawn|spent|paid|sent|deposited|refunded|done\s*at|purchase\s*of|txn\s*of|transaction\s*of|transfer\s*to|transfer\s*from|trf\s*to|trf\s*from|avl\s*bal|available\s*balance)\b/i.test(lower);
  if (!hasTxIndicator) {
    const isSecurityDisclaimer = /\b(?:never\s*share|do\s*not\s*share|don't\s*share|never\s*ask|not\s*ask|never\s*call|disclose|beware\s*of)\b.*?\b(?:otp|password|pin|cvv)\b/i.test(lower);
    if (
      !isSecurityDisclaimer &&
      /\b(?:is\s*your\s*otp|your\s*otp\s*is|use\s*otp|enter\s*otp|otp\s*to\s*verify|otp\s*for\s*(?:txn|transaction|login)|secret\s*(?:otp|code)|verification\s*code\s*is|is\s*the\s*verification\s*code|one\s*time\s*password\s*is)\b/i.test(
        lower,
      )
    ) {
      return null;
    }
  }
  if (/\b(?:pre-approved\s*loan|apply\s*now|claim\s*your\s*reward|congratulations!?\s*you\s*are\s*eligible)\b/i.test(lower)) {
    return null;
  }

  // 3. Detect Transaction Type (Debit vs Credit)
  // Mask 'credit card' / 'debit card' so "credit card" does not falsely trigger credit type
  const textWithoutCard = lower.replace(/\b(?:credit|debit)\s*card\b/g, 'card');
  let type: 'debit' | 'credit' | null = null;

  if (
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
    '(?=(?:[,.]|\\s+from|\\s+to|\\s+ref|\\s+refno|\\s+upi|\\s+on|\\s+dated|\\s+if|\\s+avail|\\s+bal|\\s+not|\\s*[-–]|https?:|\\.\\s*|\\binfo:|$))';

  const merchantDebitRegexes = [
    new RegExp(
      `(?:trf\\s*to|transfer\\s*to|transferred\\s*to|paid\\s*to|sent\\s*to|\\bto\\b|\\bat\\b|towards)\\s+([A-Za-z0-9\\s&.*-]{2,40}?)` +
      boundaryLookahead,
      'i',
    ),
  ];

  const merchantCreditRegexes = [
    new RegExp(
      `(?:transfer\\s*from|trf\\s*from|transferred\\s*from|received\\s*from|\\bfrom\\b|\\bby\\b)\\s+([A-Za-z0-9\\s&.*-]{2,40}?)` +
      boundaryLookahead,
      'i',
    ),
  ];

  const candidateRegexes = type === 'debit' ? merchantDebitRegexes : merchantCreditRegexes;

  // Search scope order:
  // 1. Text AFTER the transaction amount (prevents capturing preamble text like "Reply YES to confirm your subscription")
  // 2. Full text as fallback (for messages where merchant precedes amount, e.g. "Swiggy was paid Rs. 300")
  const searchScopes: string[] = [];
  if (amountMatchIndex !== -1 && amountMatchIndex < clean.length) {
    searchScopes.push(clean.slice(amountMatchIndex));
  }
  searchScopes.push(clean);

  for (const scope of searchScopes) {
    for (const rx of candidateRegexes) {
      const match = scope.match(rx);
      if (match && match[1]) {
        let raw = match[1].trim();
        // Remove honorifics like Mr, Mrs, Ms, Dr
        raw = raw.replace(/^(?:mr|mrs|ms|dr)\.?\s+/i, '');

        // Exclude time strings (e.g. "10:00 AM", "12:30 PM", "14:00 hrs"), pure dates, and currency amounts
        if (
          /^\d{1,2}:\d{2}/.test(raw) ||
          /^\d{1,2}[-/.]\d{1,2}/.test(raw) ||
          /^(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d+)?$/i.test(raw)
        ) {
          continue;
        }

        // Ensure we didn't capture a bank name or account word
        if (!/^(?:kotak\s*bank|sbi|hdfc|icici|axis|pnb|a\/c|account)$/i.test(raw)) {
          merchant = raw;
          break;
        }
      }
    }
    if (merchant) break;
  }

  // Sanitize merchant string
  merchant = sanitizeMerchantName(merchant);
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
  const refMatch = clean.match(refRx);
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
    .replace(/(?:ref|refno|upi\s*ref|upi|rrn|val|info|trf|ft)\b.*$/i, '')
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

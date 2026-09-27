export interface ParsedTransaction {
  amount: number;
  type: 'debit' | 'credit';
  merchant: string;
  accountSuffix: string;
  bankName: string;
  isSalary: boolean;
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

  // 2. Exclude OTPs, verification codes, and marketing spam
  if (
    /\b(?:otp|one\s*time\s*password|verification\s*code|secret\s*(?:otp|code)|pre-approved|apply\s*now)\b/i.test(
      lower,
    )
  ) {
    return null;
  }

  // 3. Detect Transaction Type (Debit vs Credit)
  // Mask 'credit card' / 'debit card' so "credit card" does not falsely trigger credit type
  const textWithoutCard = lower.replace(/\b(?:credit|debit)\s*card\b/g, 'card');
  let type: 'debit' | 'credit' | null = null;

  if (
    /\b(?:credited|received|refunded|deposited|transferred\s*from|trf\s*from|\bcr\b)\b/i.test(
      textWithoutCard,
    )
  ) {
    type = 'credit';
  } else if (
    /\b(?:debited|debit|sent|paid|spent|withdrawn|used\s*for|used\s*at|purchase\s*of|transferred\s*to|trf\s*to|\bdr\b)\b/i.test(
      textWithoutCard,
    )
  ) {
    type = 'debit';
  }

  // If no debit or credit action detected, not a completed financial transaction SMS
  if (!type) {
    return null;
  }

  // 4. Extract Amount (Mask available/ledger balance to prevent picking up balance amount)
  const maskedForBalance = clean.replace(
    /(?:avl\s*bal|available\s*balance|avail\s*bal|bal|balance|clear\s*bal|total\s*bal|closing\s*bal|ledger\s*bal|limit)[:\s]*(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d{1,2})?/gi,
    '[BALANCE_MASK]',
  );

  let amount: number | null = null;
  let amountMatchIndex: number = -1;

  const amountRegexes = [
    // Preceded by verb: e.g. "debited by Rs 500", "was used for Rs 2,500.00", "debited: 500.00"
    /(?:debited|credited|paid|sent|withdrawn|spent|used\s*for|charge|towards)\s*(?:by|for|with|of)?\s*[:\-\s]*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    // Explicit currency symbol followed by number
    /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    // Verb with colon and number without currency
    /(?:debited|credited)\s*[:\-\s]+([\d,]+(?:\.\d{1,2})?)/i,
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
  // Matches: "A/C X4020", "A/c XXXXXX4020", "A/C **9876", "Card ending 4567", "A/c ...4020", "AC 5039"
  let accountSuffix = 'XXXX';
  const accountRegexes = [
    /(?:a\/c|ac|acct|account|card)\s*(?:no\.?|number|ending(?:\s*in|\s*with)?)?\s*[:\-\s]*([A-Za-z0-9*._]{3,24})/i,
    /([A-Za-z0-9*]{4,20})\s*(?:debited|credited|-credited|-debited)/i,
  ];

  for (const rx of accountRegexes) {
    const match = clean.match(rx);
    if (match && match[1]) {
      const digitsOnly = match[1].replace(/\D/g, '');
      if (digitsOnly.length >= 4) {
        accountSuffix = digitsOnly.slice(-4);
        break;
      } else if (digitsOnly.length > 0) {
        accountSuffix = digitsOnly;
        break;
      }
    }
  }

  // 6. Extract Merchant / Beneficiary / Counterparty
  let merchant = '';
  // Lookahead boundary stops before trailing references, dates, URLs, or support info
  const boundaryLookahead =
    '(?=(?:\\s+from|\\s+to|\\s+ref|\\s+refno|\\s+upi|\\s+on|\\s+dated|\\s+if|\\s+avail|\\s+bal|\\s+not|\\s*[-–]|https?:|\\.\\s*|$))';

  const merchantDebitRegexes = [
    new RegExp(
      `(?:trf\\s*to|transfer\\s*to|transferred\\s*to|paid\\s*to|sent\\s*to|\\bto\\b|\\bat\\b|towards)\\s+([-A-Za-z0-9\\s&.*]{2,40})` +
      boundaryLookahead,
      'i',
    ),
  ];

  const merchantCreditRegexes = [
    new RegExp(
      `(?:transfer\\s*from|trf\\s*from|transferred\\s*from|received\\s*from|\\bfrom\\b)\\s+([-A-Za-z0-9\\s&.*]{2,40})` +
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
  // Substring matching is safe across Indian bank sender IDs/DLT headers (e.g. AXISB, ICICIB, HDFCBK, PNBSMS, SBIN)
  // because these acronyms are not ordinary English words.
  // "YES" is the only exception (common English word like "reply YES"), which requires word boundaries or YESB header.
  const combinedText = `${sender || ''} ${clean}`.toUpperCase();
  let bankName = 'Bank';

  if (combinedText.includes('SBI') || combinedText.includes('STATE BANK')) {
    bankName = 'SBI';
  } else if (combinedText.includes('KOTAK') || combinedText.includes('KKBK')) {
    bankName = 'Kotak';
  } else if (combinedText.includes('HDFC')) {
    bankName = 'HDFC';
  } else if (combinedText.includes('ICICI')) {
    bankName = 'ICICI';
  } else if (combinedText.includes('AXIS')) {
    bankName = 'Axis';
  } else if (combinedText.includes('PNB') || combinedText.includes('PUNJAB')) {
    bankName = 'PNB';
  } else if (combinedText.includes('BOB') || combinedText.includes('BANK OF BARODA')) {
    bankName = 'Bank of Baroda';
  } else if (combinedText.includes('CANARA') || combinedText.includes('CANBNK')) {
    bankName = 'Canara Bank';
  } else if (combinedText.includes('UNION BANK') || combinedText.includes('UBISMS')) {
    bankName = 'Union Bank';
  } else if (combinedText.includes('INDUSIND')) {
    bankName = 'IndusInd';
  } else if (combinedText.includes('IDFC')) {
    bankName = 'IDFC First';
  } else if (
    /\b(?:YES\s*BANK|YESBANK)\b/i.test(combinedText) ||
    (sender && sender.toUpperCase().includes('YESB'))
  ) {
    bankName = 'Yes Bank';
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

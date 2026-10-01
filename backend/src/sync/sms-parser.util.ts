export interface ParsedTransaction {
  amount: number;
  type: 'debit' | 'credit';
  merchant: string;
  accountSuffix: string;
  bankName: string;
  isSalary: boolean;
}

export function parseSMS(sender: string, body: string): ParsedTransaction | null {
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
  const textWithoutCard = lower.replace(/\b(?:credit|debit)\s*card\b/g, 'card');
  let type: 'debit' | 'credit' | null = null;

  if (
    /\b(?:credited|received|refunded|deposited|transferred\s*from|trf\s*from|\bcr\b|inward\s*remittance|cashback\s*received)\b/i.test(
      textWithoutCard,
    )
  ) {
    type = 'credit';
  } else if (
    /\b(?:debited|debit|sent|paid|spent|withdrawn|used\s*for|used\s*at|purchase\s*of|transferred\s*to|trf\s*to|\bdr\b|txn\s*of|transaction\s*of|transaction\s*on|txn\s*on|charged|payment\s*of|payment\s*to|vpa\s*debited)\b/i.test(
      textWithoutCard,
    )
  ) {
    type = 'debit';
  }

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
    /(?:debited|credited|paid|sent|withdrawn|spent|used\s*for|charge|towards|payment\s*of|txn\s*of|transaction\s*of)\s*(?:by|for|with|of)?\s*[:\-\s]*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)/i,
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
  let accountSuffix = 'XXXX';
  const accountRegexes = [
    /(?:a\/c|ac|acct|account|card|vpa)\s*(?:no\.?|number|ending(?:\s*in|\s*with)?)?\s*[:\-\s]*([A-Za-z0-9*._]{2,24})/i,
    /([A-Za-z0-9*]{4,20})\s*(?:debited|credited|-credited|-debited)/i,
    /(?:from|in)\s+(?:account|a\/c|card)\s+([A-Za-z0-9*._]{2,24})/i,
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
        raw = raw.replace(/^(?:mr|mrs|ms|dr)\.?\s+/i, '');

        if (
          /^\d{1,2}:\d{2}/.test(raw) ||
          /^\d{1,2}[-/.]\d{1,2}/.test(raw) ||
          /^(?:rs\.?|inr|₹)?\s*[\d,]+(?:\.\d+)?$/i.test(raw)
        ) {
          continue;
        }

        if (!/^(?:kotak\s*bank|sbi|hdfc|icici|axis|pnb|a\/c|account)$/i.test(raw)) {
          merchant = raw;
          break;
        }
      }
    }
    if (merchant) break;
  }

  merchant = sanitizeMerchantName(merchant);
  if (!merchant || merchant.length < 2) {
    merchant = type === 'debit' ? 'Spends' : 'Credits';
  }

  // 7. Detect Bank Name
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
  } else if (combinedText.includes('BOB') || combinedText.includes('BANK OF BARODA') || combinedText.includes('BARODA')) {
    bankName = 'Bank of Baroda';
  } else if (combinedText.includes('CANARA') || combinedText.includes('CANBNK')) {
    bankName = 'Canara Bank';
  } else if (combinedText.includes('UNION BANK') || combinedText.includes('UBISMS')) {
    bankName = 'Union Bank';
  } else if (combinedText.includes('INDUSIND')) {
    bankName = 'IndusInd';
  } else if (combinedText.includes('IDFC')) {
    bankName = 'IDFC First';
  } else if (combinedText.includes('PAYTM') || combinedText.includes('PPBL')) {
    bankName = 'Paytm Payments Bank';
  } else if (combinedText.includes('FEDERAL') || combinedText.includes('FEDBNK') || combinedText.includes('JUPITER') || combinedText.includes('FIMONEY') || combinedText.includes('EPICFI')) {
    bankName = 'Federal Bank';
  } else if (combinedText.includes('AUBANK') || combinedText.includes('AU BANK')) {
    bankName = 'AU Small Finance';
  } else if (combinedText.includes('RBL')) {
    bankName = 'RBL Bank';
  } else if (
    /\b(?:YES\s*BANK|YESBANK)\b/i.test(combinedText) ||
    (sender && sender.toUpperCase().includes('YESB'))
  ) {
    bankName = 'Yes Bank';
  }

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
}

function sanitizeMerchantName(name: string): string {
  if (!name) return '';

  const cleaned = name
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

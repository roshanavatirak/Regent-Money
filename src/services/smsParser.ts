export interface ParsedTransaction {
  amount: number;
  type: 'debit' | 'credit';
  merchant: string;
  accountSuffix: string;
  bankName: string;
  isSalary: boolean;
}

const BANK_REGEX_PATTERNS = [
  // HDFC Debit/Credit
  {
    bank: 'HDFC',
    regex: /Rs\.?\s*([\d,]+\.\d{2})\s*(debited|credited)\s*from\s*a\/c\s*(\S+)\s*to\s*(.+?)\s*on/i,
    amountIdx: 1,
    typeIdx: 2,
    accountIdx: 3,
    merchantIdx: 4,
  },
  // HDFC general alternative
  {
    bank: 'HDFC',
    regex: /Alert:\s*A\/c\s*(\S+)\s*(debited|credited)\s*with\s*Rs\.?\s*([\d,]+\.\d{2})\s*-\s*(.+?)\s*on/i,
    accountIdx: 1,
    typeIdx: 2,
    amountIdx: 3,
    merchantIdx: 4,
  },
  // SBI Debit/Credit
  {
    bank: 'SBI',
    regex: /A\/c\s*(\S+)\s*(debited|credited)\s*by\s*Rs\.?\s*([\d,]+\.?\d*)\s*on.*?Ref.*?to\s*(.+?)(?:\s*\.|\s*$)/i,
    accountIdx: 1,
    typeIdx: 2,
    amountIdx: 3,
    merchantIdx: 4,
  },
  // ICICI Debit/Credit
  {
    bank: 'ICICI',
    regex: /A\/c\s*(\S+)\s*(debited|credited)\s*with\s*INR\s*([\d,]+\.\d{2})\s*on.*?Info:\s*(.+?)(?:\.|\s*Ref)/i,
    accountIdx: 1,
    typeIdx: 2,
    amountIdx: 3,
    merchantIdx: 4,
  },
  // Axis Bank Debit/Credit
  {
    bank: 'Axis',
    regex: /(?:A\/c\s*|Card\s*)(\S+)\s*(debited|credited)\s*for\s*Rs\.?\s*([\d,]+\.\d{2})\s*at\s*(.+?)\s*on/i,
    accountIdx: 1,
    typeIdx: 2,
    amountIdx: 3,
    merchantIdx: 4,
  },
  // Kotak Debit/Credit
  {
    bank: 'Kotak',
    regex: /A\/c\s*(\S+)\s*(debited|credited)\s*for\s*Rs\.?\s*([\d,]+\.\d{2})\s*by\s*(.+?)\s*on/i,
    accountIdx: 1,
    typeIdx: 2,
    amountIdx: 3,
    merchantIdx: 4,
  },
  // PNB Bank Debit/Credit
  {
    bank: 'PNB',
    regex: /A\/c\s*(\S+)\s*(debited|credited)\s*with\s*Rs\.?\s*([\d,]+\.\d{2})\s*by\s*(.+?)\s*on/i,
    accountIdx: 1,
    typeIdx: 2,
    amountIdx: 3,
    merchantIdx: 4,
  },
  // Generic UPI Apps (GPay, PhonePe, Paytm notifications)
  {
    bank: 'UPI_APP',
    regex: /(?:Sent|Paid|Received)\s*Rs\.?\s*([\d,]+(?:\.\d{2})?)\s*(?:to|from)\s*(.+?)\s*(?:using|ref|\.)/i,
    amountIdx: 1,
    merchantIdx: 2,
    typeIdx: null, // Hardcoded or inferred based on first word
    accountIdx: null,
  }
];

export const parseSMS = (sender: string, body: string): ParsedTransaction | null => {
  // Pre-process body: clean multiple whitespaces
  const cleanBody = body.replace(/\s+/g, ' ').trim();

  for (const pattern of BANK_REGEX_PATTERNS) {
    const match = cleanBody.match(pattern.regex);
    if (match) {
      const amountStr = pattern.amountIdx !== null ? match[pattern.amountIdx] : '0';
      const amount = parseFloat(amountStr.replace(/,/g, ''));
      
      let type: 'debit' | 'credit' = 'debit';
      if (pattern.typeIdx !== null) {
        const typeStr = match[pattern.typeIdx].toLowerCase();
        type = typeStr.includes('credit') ? 'credit' : 'debit';
      } else {
        // For generic UPI, parse from starting text
        if (cleanBody.toLowerCase().startsWith('received') || cleanBody.toLowerCase().includes('credited')) {
          type = 'credit';
        }
      }

      const rawMerchant = pattern.merchantIdx !== null ? match[pattern.merchantIdx].trim() : 'Unknown';
      // Clean merchant string (strip reference numbers, etc.)
      const merchant = cleanMerchantName(rawMerchant);

      const accountRaw = pattern.accountIdx !== null ? match[pattern.accountIdx].trim() : 'XXXX';
      // Suffix is usually the last 4 digits
      const accountSuffix = accountRaw.slice(-4);

      // Simple heuristic for Salary detection
      const isSalary = type === 'credit' && (
        cleanBody.toLowerCase().includes('salary') ||
        cleanBody.toLowerCase().includes('employer') ||
        cleanBody.toLowerCase().includes('stipend') ||
        merchant.toLowerCase().includes('payroll')
      );

      return {
        amount,
        type,
        merchant,
        accountSuffix,
        bankName: pattern.bank,
        isSalary,
      };
    }
  }

  return null;
};

// Clean merchant names like "ZOMATO*12345" to "ZOMATO"
const cleanMerchantName = (merchant: string): string => {
  let name = merchant
    .replace(/(?:ref|ref\s*no|upi|rrn|val|info|trf|ft)\b.*$/i, '') // strip trailing transaction references
    .replace(/[^\w\s\-\*]/g, '') // remove special punctuation
    .trim();

  // Normalize common Indian merchants
  const lower = name.toLowerCase();
  if (lower.includes('zomato')) return 'Zomato';
  if (lower.includes('swiggy')) return 'Swiggy';
  if (lower.includes('blinkit')) return 'Blinkit';
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

  return name || 'Unknown Merchant';
};

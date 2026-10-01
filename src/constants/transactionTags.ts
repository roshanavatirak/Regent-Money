/**
 * Master Transaction Tags Dictionary & Indian Merchant Classification Engine
 * Matches Paytm's "Tag your payment" taxonomy with 30+ spending categories,
 * icons, pastel backgrounds, and comprehensive Indian merchant brand mappings.
 */

export interface TransactionTagDef {
  id: string;
  label: string;
  iconName: string;
  iconType: 'feather' | 'ionicons';
  bgColorLight: string;
  bgColorDark: string;
  iconColor: string;
}

export const PAYTM_TRANSACTION_TAGS: TransactionTagDef[] = [
  {
    id: 'food',
    label: 'Food',
    iconName: 'coffee',
    iconType: 'feather',
    bgColorLight: '#FFF3E0',
    bgColorDark: '#3A291A',
    iconColor: '#F57C00',
  },
  {
    id: 'shopping',
    label: 'Shopping',
    iconName: 'shopping-bag',
    iconType: 'feather',
    bgColorLight: '#FCE4EC',
    bgColorDark: '#3B1F2B',
    iconColor: '#E91E63',
  },
  {
    id: 'groceries',
    label: 'Groceries',
    iconName: 'shopping-cart',
    iconType: 'feather',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1E3524',
    iconColor: '#43A047',
  },
  {
    id: 'entertainment',
    label: 'Entertainment',
    iconName: 'film',
    iconType: 'feather',
    bgColorLight: '#FFEBEE',
    bgColorDark: '#3D1B1F',
    iconColor: '#E53935',
  },
  {
    id: 'travel',
    label: 'Travel',
    iconName: 'airplane-outline',
    iconType: 'ionicons',
    bgColorLight: '#E1F5FE',
    bgColorDark: '#1A3344',
    iconColor: '#0288D1',
  },
  {
    id: 'fuel',
    label: 'Fuel',
    iconName: 'flame-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFF8E1',
    bgColorDark: '#3E341B',
    iconColor: '#FFA000',
  },
  {
    id: 'services',
    label: 'Services',
    iconName: 'construct-outline',
    iconType: 'ionicons',
    bgColorLight: '#EDE7F6',
    bgColorDark: '#2C223E',
    iconColor: '#7E57C2',
  },
  {
    id: 'financial_services',
    label: 'Financial Services',
    iconName: 'business-outline',
    iconType: 'ionicons',
    bgColorLight: '#E0F2F1',
    bgColorDark: '#193633',
    iconColor: '#00897B',
  },
  {
    id: 'medical',
    label: 'Medical',
    iconName: 'medkit-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFEBEE',
    bgColorDark: '#3C1B1F',
    iconColor: '#E53935',
  },
  {
    id: 'education',
    label: 'Education',
    iconName: 'book-outline',
    iconType: 'ionicons',
    bgColorLight: '#E8EAF6',
    bgColorDark: '#22263C',
    iconColor: '#3F51B5',
  },
  {
    id: 'bill_payments',
    label: 'Bill Payments',
    iconName: 'receipt-outline',
    iconType: 'ionicons',
    bgColorLight: '#E0F7FA',
    bgColorDark: '#18363C',
    iconColor: '#00ACC1',
  },
  {
    id: 'cashback',
    label: 'Cashback',
    iconName: 'cash-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFFDE7',
    bgColorDark: '#393616',
    iconColor: '#FBC02D',
  },
  {
    id: 'insurance',
    label: 'Insurance',
    iconName: 'shield-checkmark-outline',
    iconType: 'ionicons',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1E3524',
    iconColor: '#2E7D32',
  },
  {
    id: 'investment',
    label: 'Investment',
    iconName: 'trending-up',
    iconType: 'feather',
    bgColorLight: '#FFF8E1',
    bgColorDark: '#3A3319',
    iconColor: '#FFB300',
  },
  {
    id: 'donation',
    label: 'Donation',
    iconName: 'heart-outline',
    iconType: 'ionicons',
    bgColorLight: '#FCE4EC',
    bgColorDark: '#371A27',
    iconColor: '#D81B60',
  },
  {
    id: 'money_transfer',
    label: 'Money Transfer',
    iconName: 'swap-horizontal-outline',
    iconType: 'ionicons',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1D3523',
    iconColor: '#43A047',
  },
  {
    id: 'money_received',
    label: 'Money Received',
    iconName: 'arrow-down-circle-outline',
    iconType: 'ionicons',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1A3622',
    iconColor: '#2E7D32',
  },
  {
    id: 'self_transfer',
    label: 'Self Transfer',
    iconName: 'repeat',
    iconType: 'feather',
    bgColorLight: '#E0F7FA',
    bgColorDark: '#19363D',
    iconColor: '#00838F',
  },
  {
    id: 'salary',
    label: 'Salary',
    iconName: 'briefcase',
    iconType: 'feather',
    bgColorLight: '#E8F5E9',
    bgColorDark: '#1B3521',
    iconColor: '#2E7D32',
  },
  {
    id: 'interest',
    label: 'Interest',
    iconName: 'percent',
    iconType: 'feather',
    bgColorLight: '#FFF8E1',
    bgColorDark: '#383218',
    iconColor: '#F57F17',
  },
  {
    id: 'miscellaneous',
    label: 'Miscellaneous',
    iconName: 'grid',
    iconType: 'feather',
    bgColorLight: '#ECEFF1',
    bgColorDark: '#263238',
    iconColor: '#546E7A',
  },
  {
    id: 'commute',
    label: 'Commute',
    iconName: 'car-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFF8E1',
    bgColorDark: '#39331B',
    iconColor: '#FFB300',
  },
  {
    id: 'fitness',
    label: 'Fitness',
    iconName: 'barbell-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFF3E0',
    bgColorDark: '#392817',
    iconColor: '#FB8C00',
  },
  {
    id: 'emi_loans',
    label: 'EMI and Loans',
    iconName: 'card-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFFDE7',
    bgColorDark: '#3A3716',
    iconColor: '#FDD835',
  },
  {
    id: 'business_expense',
    label: 'Business Expense',
    iconName: 'briefcase-outline',
    iconType: 'ionicons',
    bgColorLight: '#EFEBE9',
    bgColorDark: '#322B28',
    iconColor: '#6D4C41',
  },
  {
    id: 'utilities',
    label: 'Utilities',
    iconName: 'bulb-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFFDE7',
    bgColorDark: '#363417',
    iconColor: '#FBC02D',
  },
  {
    id: 'rent',
    label: 'Rent',
    iconName: 'home-outline',
    iconType: 'ionicons',
    bgColorLight: '#FBE9E7',
    bgColorDark: '#3B241E',
    iconColor: '#F4511E',
  },
  {
    id: 'personal_care',
    label: 'Personal Care',
    iconName: 'cut-outline',
    iconType: 'ionicons',
    bgColorLight: '#F3E5F5',
    bgColorDark: '#311E36',
    iconColor: '#8E24AA',
  },
  {
    id: 'gifts',
    label: 'Gifts',
    iconName: 'gift-outline',
    iconType: 'ionicons',
    bgColorLight: '#FFEBEE',
    bgColorDark: '#391B1F',
    iconColor: '#E53935',
  },
  {
    id: 'cash_withdrawals',
    label: 'Cash Withdrawals',
    iconName: 'card',
    iconType: 'ionicons',
    bgColorLight: '#E3F2FD',
    bgColorDark: '#1A2F45',
    iconColor: '#1976D2',
  },
];

/**
 * Normalizes merchant string for consistent rule matching & lookup.
 */
export function normalizeMerchantName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extensive Indian Merchant / Brand Keyword Mappings to Paytm Tags
 */
export const INDIAN_MERCHANT_KEYWORD_RULES: Record<string, string[]> = {
  groceries: [
    'blinkit', 'zepto', 'instamart', 'bigbasket', 'dmart', 'supermarket',
    'kirana', 'provision', 'nature basket', 'spencer', 'more retail',
    'fresh', 'vegetable', 'fruits', 'dairy', 'milk', 'bakery', 'market',
  ],
  food: [
    'zomato', 'swiggy', 'starbucks', 'mcdonald', 'burger king', 'kfc',
    'pizza hut', 'domino', 'haldiram', 'subway', 'barbeque', 'cafe',
    'restaurant', 'dhaba', 'tea', 'chai', 'coffee', 'bhojanalaya',
    'biryani', 'sweets', 'tiffin', 'hotel food', 'canteen', 'dining',
  ],
  commute: [
    'uber', 'ola', 'rapido', 'metro', 'chalo', 'fastag', 'toll',
    'parking', 'auto', 'taxi', 'ride', 'cab', 'transit',
  ],
  travel: [
    'makemytrip', 'goibibo', 'easemytrip', 'irctc', 'yatra', 'indigo',
    'air india', 'vistara', 'spicejet', 'akasa', 'hotel', 'flight',
    'resort', 'train ticket', 'railways', 'bus', 'redbus', 'abhibus',
  ],
  fuel: [
    'indian oil', 'iocl', 'bharat petroleum', 'bpcl', 'hindustan petroleum',
    'hpcl', 'shell', 'petrol', 'diesel', 'cng', 'fuel', 'gas station',
  ],
  shopping: [
    'amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'tata cliq',
    'meesho', 'zara', 'h&m', 'uniqlo', 'shoppers stop', 'lifestyle',
    'max fashion', 'westside', 'decathlon', 'croma', 'reliance digital',
    'mall', 'store', 'clothing', 'footwear', 'apparel',
  ],
  entertainment: [
    'netflix', 'prime video', 'hotstar', 'disney', 'spotify', 'pvr',
    'inox', 'cinepolis', 'bookmyshow', 'sonyliv', 'zee5', 'youtube',
    'gaming', 'steam', 'playstation', 'movies', 'theatre',
  ],
  medical: [
    'apollo', 'pharmeasy', '1mg', 'tata 1mg', 'netmeds', 'medplus',
    'hospital', 'clinic', 'diagnostic', 'doctor', 'dr.', 'pharmacy',
    'chemist', 'pathology', 'lab', 'health', 'dental', 'opticals',
  ],
  bill_payments: [
    'jio', 'airtel', 'vodafone', 'vi bill', 'bsnl', 'tatasky', 'tata play',
    'dth', 'dish tv', 'sun direct', 'broadband', 'act fibernet', 'hathway',
    'recharge', 'mobile bill',
  ],
  utilities: [
    'bescom', 'tata power', 'adani electricity', 'bses', 'mahavitaran',
    'wbsetcl', 'uppcl', 'torrent power', 'water board', 'igl', 'indraprastha gas',
    'mahanagar gas', 'gujarat gas', 'piped gas', 'electricity', 'cylinder',
    'hp gas', 'indane', 'bharat gas',
  ],
  rent: [
    'nobroker', 'magicbricks', 'housing', 'house rent', 'flat rent',
    'society maintenance', 'landlord', 'rent payment', 'property tax',
  ],
  emi_loans: [
    'bajaj finserv', 'home credit', 'kreditbee', 'lazypay', 'simpl',
    'loan', 'emi', 'hdfc loan', 'sbi loan', 'icici loan', 'finance emi',
    'car loan', 'home loan', 'personal loan',
  ],
  financial_services: [
    'zerodha', 'groww', 'upstox', 'angelone', 'indmoney', 'motilal oswal',
    'demat', 'brokerage', 'sharekhan', '5paisa',
  ],
  insurance: [
    'lic', 'hdfc ergo', 'icici lombard', 'star health', 'policybazaar',
    'care health', 'max life', 'sbi life', 'tata aia', 'insurance premium',
  ],
  investment: [
    'mutual fund', 'sip', 'fixed deposit', 'recurring deposit', 'sgb',
    'gold bond', 'nps', 'ppf', 'crypto', 'coin', 'securities',
  ],
  education: [
    'school', 'college', 'university', 'tuition', 'coaching', 'fees',
    'unacademy', 'byju', 'coursera', 'udemy', 'allen', 'fiitjee',
  ],
  fitness: [
    'cult.fit', 'cure.fit', 'gold gym', 'anytime fitness', 'gym',
    'fitness', 'yoga', 'crossfit', 'swimming', 'sports club', 'protein',
  ],
  personal_care: [
    'salon', 'spa', 'urban company', 'geetanjali', 'enrich', 'barber',
    'parlour', 'grooming', 'haircut', 'cosmetics',
  ],
  cash_withdrawals: [
    'atm', 'cash wdl', 'cash withdrawal', 'nfs cash', 'atmsbi',
  ],
  salary: [
    'salary', 'payroll', 'stipend', 'employer', 'batchid', 'wages',
  ],
  cashback: [
    'cashback', 'refund', 'reversal', 'reward', 'promo credit',
  ],
  interest: [
    'interest', 'savings bank interest', 'fd interest', 'int.pd',
  ],
};

/**
 * Predicts the most accurate category tag for a transaction based on:
 * 1. User memory map (passed in or queried)
 * 2. Credit vs Debit semantics
 * 3. 30+ Indian merchant & brand keywords
 * 4. Fallback to 'miscellaneous' (NEVER generic 'shopping')
 */
export function predictTagForTransaction(
  merchant: string,
  body?: string,
  type: 'debit' | 'credit' = 'debit',
  isSalary: boolean = false,
  userLearnedTags?: Record<string, string>
): string {
  const normMerchant = normalizeMerchantName(merchant);
  const normBody = (body || '').toLowerCase();

  // 1. User's previously chosen/custom tag takes supreme priority
  if (userLearnedTags && normMerchant) {
    if (userLearnedTags[normMerchant]) {
      return userLearnedTags[normMerchant];
    }
    // Substring match in learned map
    for (const [learnedMerchant, tag] of Object.entries(userLearnedTags)) {
      if (normMerchant.includes(learnedMerchant) || learnedMerchant.includes(normMerchant)) {
        return tag;
      }
    }
  }

  // 2. Credit-specific resolution
  if (type === 'credit') {
    if (isSalary || normMerchant.includes('salary') || normBody.includes('salary') || normBody.includes('payroll')) {
      return 'salary';
    }
    if (normMerchant.includes('refund') || normBody.includes('refund') || normBody.includes('cashback')) {
      return 'cashback';
    }
    if (normMerchant.includes('interest') || normBody.includes('interest')) {
      return 'interest';
    }
    if (normBody.includes('self trf') || normBody.includes('own a/c')) {
      return 'self_transfer';
    }
    return 'money_received';
  }

  // 3. Indian Brand & Keyword Classification
  const targetText = `${normMerchant} ${normBody}`;
  for (const [tag, keywords] of Object.entries(INDIAN_MERCHANT_KEYWORD_RULES)) {
    for (const kw of keywords) {
      if (targetText.includes(kw)) {
        return tag;
      }
    }
  }

  // 4. Default: miscellaneous (NOT hardcoded shopping)
  return 'miscellaneous';
}

/**
 * Returns tag definition by tag id or label.
 */
export function getTagDef(tagIdOrLabel?: string | null): TransactionTagDef {
  if (!tagIdOrLabel) {
    return PAYTM_TRANSACTION_TAGS.find(t => t.id === 'miscellaneous')!;
  }
  const clean = tagIdOrLabel.toLowerCase().replace(/\s+/g, '_');
  const found = PAYTM_TRANSACTION_TAGS.find(
    t => t.id === clean || t.label.toLowerCase() === tagIdOrLabel.toLowerCase()
  );
  if (found) return found;

  // Custom user tag fallback: create a dynamic def
  return {
    id: clean,
    label: tagIdOrLabel.charAt(0).toUpperCase() + tagIdOrLabel.slice(1),
    iconName: 'tag',
    iconType: 'feather',
    bgColorLight: '#EDE7F6',
    bgColorDark: '#2C223E',
    iconColor: '#7E57C2',
  };
}

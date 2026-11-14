/**
 * Auto-tagging rules shared by the app and the server.
 *
 * Two identical copies: src/constants/merchantTagRules.ts (app) and
 * backend/src/sync/merchant-tag-rules.ts (server). Edit one, copy it to the other;
 * src/constants/merchantTagRules.test.ts fails if they differ.
 * Accuracy is measured by src/services/__fixtures__/tag-benchmark-cases.json.
 *
 * How a keyword matches (so "ola" doesn't hit "Coca Cola" and "lab" doesn't hit "Available"):
 *  - up to 4 letters: a whole word ("atm", "lic", "spa", "jio")
 *  - longer: the start of a word ("petrol" matches "Petroleum"), unless written "=word"
 *  - a merchant written as one word, as UPI ids are ("bajajfinserv", "pawarpetroleum"):
 *    keywords of 5+ letters may appear anywhere in it, spaces ignored
 * Brand keywords are checked against the merchant name only. A few phrases that never appear
 * in bank boilerplate ("withdrawn", "income tax") are also checked against the whole SMS.
 */

export interface TagRule {
  tag: string;
  /** Matched against the merchant name. */
  merchant: string[];
  /** Also matched against the whole SMS text. */
  body?: string[];
}

/** Money moved between the user's own accounts (left out of spending and income). */
export const SELF_TRANSFER_PHRASES = [
  'self transfer', 'self trf', 'self tfr', 'transfer to own', 'transfer from own', 'trf to own', 'trf from own',
  'transferred to own', 'transferred from own', 'transfer to self', 'transfer from self', 'sent to self',
  'received from self', 'own a c', 'own ac', 'own acc', 'own account', 'self acc', 'self a c', 'to self',
  'from self', 'internal transfer', 'internal trf', 'transfer xx', 'trf xx',
];

/** Checked in this order; the first rule that matches wins. */
export const TAG_RULES: TagRule[] = [
  {
    tag: 'card_bill',
    merchant: ['credit card bill', 'credit card payment', 'creditcard payment', 'cc bill', 'card bill'],
    body: ['credit card bill', 'credit card payment', 'towards credit card', 'cc bill payment'],
  },
  {
    tag: 'tax',
    merchant: ['income tax', 'advance tax', 'tin nsdl', 'protean egov', 'cbdt', 'gst payment', 'tax challan', 'property tax', 'municipal tax'],
    body: ['income tax', 'advance tax', 'tax challan'],
  },
  {
    tag: 'cash_withdrawals',
    merchant: ['atm', 'cash wdl', 'cash withdrawal', 'atm wdl', 'nfs'],
    body: ['withdrawn at atm', 'atm withdrawal', 'cash withdrawal', 'atm wdl', 'cash wdl'],
  },
  {
    tag: 'emi_loans',
    merchant: [
      'emi', 'loan', 'loans', 'bajaj finserv', 'bajaj finance', 'home credit', 'kreditbee', 'lazypay', 'simpl',
      'tata capital', 'hdb financial', 'muthoot', 'moneyview', 'navi loan',
    ],
  },
  {
    tag: 'subscriptions',
    merchant: [
      'netflix', 'spotify', 'hotstar', 'disney', 'prime video', 'sonyliv', 'zee5', 'youtube premium', 'jiocinema',
      'icloud', 'apple services', 'apple media', 'google one',
    ],
  },
  {
    tag: 'insurance',
    merchant: [
      'insurance', 'lic', 'star health', 'care health', 'niva bupa', 'hdfc ergo', 'icici lombard', 'policybazaar',
      'max life', 'sbi life', 'tata aia', 'acko', 'digit insurance', 'bajaj allianz',
    ],
  },
  {
    tag: 'investment',
    merchant: [
      'zerodha', 'groww', 'upstox', 'angel one', 'angelone', 'indmoney', 'kuvera', 'smallcase', 'paytm money',
      'etmoney', 'mutual fund', 'sip', 'nps', 'ppf', 'fixed deposit', 'recurring deposit', 'sgb', 'gold bond',
      'securities', 'demat', 'motilal oswal', 'sharekhan', '5paisa', 'wazirx', 'coindcx',
    ],
  },
  {
    tag: 'bills',
    merchant: [
      'postpaid', 'broadband', 'fibernet', 'fiber', 'fibre', 'jio fiber', 'airtel xstream', 'act fibernet', 'hathway',
      'mobile bill', 'landline',
    ],
  },
  {
    tag: 'recharge',
    merchant: [
      'jio', 'airtel', 'vi', 'vodafone', 'bsnl', 'recharge', 'prepaid', 'dth', 'tata play', 'tatasky', 'dish tv',
      'sun direct', 'd2h',
    ],
  },
  {
    tag: 'utilities',
    merchant: [
      'electricity', 'bescom', 'tata power', 'adani electricity', 'bses', 'mahavitaran', 'msedcl', 'tneb', 'uppcl',
      'torrent power', 'water board', 'igl', 'indraprastha gas', 'mahanagar gas', 'gujarat gas', 'piped gas',
      'cylinder', 'hp gas', 'indane', 'bharat gas',
    ],
  },
  {
    tag: 'groceries',
    merchant: [
      'instamart', 'jiomart', 'blinkit', 'zepto', 'bigbasket', 'big basket', 'dmart', 'd mart', 'reliance fresh',
      'fresh', 'licious', 'country delight', 'milkbasket', 'more retail', 'spencer', 'nature basket', 'supermarket', 'grocery', 'grocer', 'kirana', 'provision',
      'general store', 'vegetable', 'sabzi', 'fruits', 'dairy', 'milk',
    ],
  },
  {
    tag: 'services',
    merchant: [
      'tailor', 'laundry', 'dry clean', 'garage', 'auto works', 'motor works', 'service center', 'service centre',
      'repair', 'plumber', 'electrician', 'xerox', 'courier', 'dtdc', 'blue dart', 'delhivery', 'porter',
    ],
  },
  {
    tag: 'food',
    merchant: [
      'zomato', 'swiggy', 'eatsure', 'box8', 'faasos', 'behrouz', 'wow momo', 'starbucks', 'mcdonald', 'burger king', 'kfc', 'pizza', 'domino', 'haldiram',
      // "=hotel": the whole word only, so "XYZ Hotels" (a stay) is left to Travel
      'subway', 'barbeque', 'chaayos', 'chai', 'tea', 'coffee', 'cafe', 'restaurant', '=hotel', 'dhaba',
      'bhojanalaya', 'biryani', 'sweets', 'bakery', 'tiffin', 'canteen', 'mess', 'juice', 'dining', 'food',
    ],
  },
  {
    tag: 'travel',
    merchant: [
      'makemytrip', 'goibibo', 'easemytrip', 'cleartrip', 'ixigo', 'irctc', 'yatra', 'indigo', 'air india', 'vistara',
      'spicejet', 'akasa', 'redbus', 'abhibus', 'oyo', 'hotels', 'resort', 'flight', 'train ticket', 'railway', 'travels',
      'tours',
    ],
  },
  {
    tag: 'transport',
    merchant: [
      'uber', 'ola', 'ola cabs', 'olacabs', 'rapido', 'metro', 'chalo', 'fastag', 'toll', 'parking', 'taxi', 'cab',
      'cabs', 'auto rickshaw', 'bmtc', 'best bus', 'yulu',
    ],
  },
  {
    tag: 'fuel',
    merchant: [
      'indian oil', 'iocl', 'bharat petroleum', 'bpcl', 'hindustan petroleum', 'hpcl', 'hp petrol', 'shell', 'nayara',
      'petrol', 'diesel', 'cng', 'fuel', 'filling station',
    ],
  },
  {
    tag: 'shopping',
    merchant: [
      'amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'tata cliq', 'meesho', 'lenskart', 'firstcry', 'decathlon',
      'croma', 'reliance digital', 'reliance trends', 'zara', 'uniqlo', 'shoppers stop', 'lifestyle', 'westside',
      'max fashion', 'pepperfry', 'ikea', 'bata', 'tanishq', 'caratlane', 'puma', 'nike', 'adidas', 'fashion', 'garments', 'clothing', 'apparel', 'footwear', 'jewellers',
      'boutique', 'mall',
    ],
  },
  {
    tag: 'entertainment',
    merchant: ['bookmyshow', 'pvr', 'inox', 'cinepolis', 'cinema', 'movies', 'theatre', 'steam', 'playstation', 'gaming', 'youtube'],
  },
  {
    tag: 'medical',
    merchant: [
      'apollo', 'pharmeasy', '1mg', 'tata 1mg', 'netmeds', 'medplus', 'medical', 'medicals', 'medicos', 'pharmacy', 'pharma',
      'chemist', 'practo', 'hospital', 'clinic', 'diagnostic', 'pathlabs', 'path lab', 'thyrocare', 'dental', 'opticals', 'doctor',
    ],
  },
  {
    tag: 'education',
    merchant: [
      'school', 'college', 'university', 'tuition', 'coaching', 'classes', 'academy', 'institute', 'fees',
      'unacademy', 'byju', 'coursera', 'udemy', 'allen', 'fiitjee', 'physics wallah', 'vedantu',
    ],
  },
  {
    tag: 'fitness',
    merchant: ['cult fit', 'cultfit', 'cure fit', 'curefit', 'gym', 'fitness', 'yoga', 'crossfit', 'sports club', 'protein'],
  },
  {
    tag: 'personal',
    merchant: ['salon', 'spa', 'urban company', 'urbanclap', 'barber', 'parlour', 'parlor', 'grooming', 'haircut', 'cosmetics', 'lakme'],
  },
  {
    tag: 'rent',
    merchant: ['nobroker', 'magicbricks', 'house rent', 'flat rent', 'rent', 'landlord', 'society maintenance'],
  },
  {
    tag: 'donation',
    merchant: ['donation', 'charity', 'foundation', 'akshaya patra', 'give india', 'ketto', 'milaap'],
  },
  {
    tag: 'gifts',
    merchant: ['gift', 'gifts', 'ferns n petals', 'fnp', 'igp'],
  },
];

/** Common Indian surnames and name endings: a payee named like a person is a payment to someone. */
const SURNAMES = [
  'sharma', 'verma', 'gupta', 'agarwal', 'aggarwal', 'jain', 'bansal', 'goyal', 'mittal', 'singh', 'kumar', 'kumari',
  'devi', 'yadav', 'patel', 'shah', 'mehta', 'desai', 'joshi', 'kulkarni', 'deshpande', 'patil', 'pawar', 'jadhav',
  'shinde', 'chavan', 'gaikwad', 'reddy', 'rao', 'naidu', 'nair', 'menon', 'pillai', 'iyer', 'iyengar',
  'krishnan', 'raman', 'das', 'dutta', 'ghosh', 'bose', 'banerjee', 'chatterjee', 'mukherjee', 'sen', 'roy', 'paul',
  'khan', 'ali', 'ahmed', 'ahmad', 'hussain', 'ansari', 'shaikh', 'sheikh', 'qureshi', 'siddiqui', 'irfan', 'mishra',
  'tiwari', 'pandey', 'dubey', 'shukla', 'tripathi', 'chauhan', 'rathore', 'thakur', 'mehra', 'kapoor', 'khanna',
  'malhotra', 'chopra', 'arora', 'bhatia', 'saxena', 'srivastava', 'chaudhary', 'choudhary', 'bhatt', 'nayak',
  'mohanty', 'behera', 'sahu', 'gill', 'sandhu', 'dhillon', 'fernandes', 'dsouza', 'gomes', 'thomas', 'george',
  'joseph', 'mathew', 'varghese', 'begum', 'bai', 'prasad', 'murthy', 'hegde', 'shetty', 'gowda', 'naik',
];

/** Words that make a payee a business, never a person ("Kumar Tailors", "Sharma Sweets"). */
const BUSINESS_WORDS = [
  'store', 'stores', 'mart', 'traders', 'trading', 'enterprises', 'enterprise', 'agency', 'agencies', 'medical',
  'medicals', 'hotel', 'restaurant', 'sweets', 'dairy', 'tailors', 'tailor', 'works', 'garage', 'motors', 'petroleum',
  'fuels', 'kirana', 'general', 'provision', 'electricals', 'electronics', 'mobile', 'mobiles', 'pharma', 'clinic',
  'hospital', 'center', 'centre', 'shop', 'bazaar', 'bazar', 'foods', 'cafe', 'bakery', 'salon', 'studio', 'services',
  'solutions', 'pvt', 'ltd', 'llp', 'india', 'company', 'bank', 'finance', 'industries', 'textiles', 'garments',
  'jewellers', 'furniture', 'hardware', 'paan', 'chai', 'tea', 'juice', 'vegetables', 'fruits', 'travels', 'tours',
  'school', 'academy', 'classes', 'institute', 'stall', 'house', 'palace', 'point', 'corner', 'collection', 'brothers',
  'sons', 'associates', 'and',
];

const norm = (s?: string | null) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const squash = (s: string) => s.replace(/ /g, '');

/** Does `keyword` appear in already-normalized `text` (see the header for the rules)? */
function hasKeyword(text: string, keyword: string, allowSquashed: boolean): boolean {
  // A leading "=" asks for the whole word even when it is longer than 4 letters
  const wholeWord = keyword.startsWith('=');
  const k = norm(wholeWord ? keyword.slice(1) : keyword);
  if (!k || !text) return false;
  const padded = ` ${text} `;
  if (k.length <= 4 || wholeWord ? padded.includes(` ${k} `) : padded.includes(` ${k}`)) return true;
  // A one-word merchant (a UPI id like "pawarpetroleum"): longer keywords may sit anywhere in it
  return allowSquashed && k.length >= 5 && !text.includes(' ') && text.includes(squash(k));
}

const hasAny = (text: string, keywords: string[], allowSquashed = false) =>
  keywords.some((k) => hasKeyword(text, k, allowSquashed));

/** A payee named like a person ("Rahul Sharma", "priyapatel"), not a business. */
export function looksLikePerson(merchant?: string | null): boolean {
  const m = norm(merchant);
  if (!m || /\d/.test(m)) return false;
  const words = m.split(' ');
  if (words.some((w) => BUSINESS_WORDS.includes(w))) return false;
  if (words.length === 1) {
    // UPI id written as one word: first name + surname ("rameshkumar"). Only longer surnames
    // and business words count here, so "anand" isn't read as "and" and "chosen" as "sen".
    return (
      SURNAMES.some((s) => s.length >= 4 && m.length >= s.length + 3 && m.endsWith(s)) &&
      !BUSINESS_WORDS.some((w) => w.length >= 5 && m.includes(w))
    );
  }
  return words.length <= 3 && words.every((w) => /^[a-z]+$/.test(w)) && SURNAMES.includes(words[words.length - 1]);
}

/** Tag for money coming in. */
export function creditTag(merchant?: string | null, body?: string | null, isSalary = false): string {
  const text = `${norm(merchant)} ${norm(body)}`.trim();
  if (isSalary || hasAny(text, ['salary', 'payroll', 'stipend', 'wages'])) return 'salary';
  if (hasAny(text, ['refund', 'reversal', 'reversed', 'cashback', 'reward', 'rewards'])) return 'cashback';
  if (hasAny(text, ['interest', 'int pd', 'sb int'])) return 'interest';
  return 'money_received';
}

/**
 * Tag for a transaction from its merchant (and the SMS text when there is one).
 * Returns 'miscellaneous' when nothing fits. The user's own "Always tag" rules are checked
 * by the caller before this.
 */
export function predictTag(
  merchant?: string | null,
  body?: string | null,
  type: 'debit' | 'credit' = 'debit',
  isSalary = false,
): string {
  const m = norm(merchant);
  const b = norm(body);
  if (hasAny(m, SELF_TRANSFER_PHRASES) || hasAny(b, SELF_TRANSFER_PHRASES)) return 'self_transfer';
  if (type === 'credit') return creditTag(merchant, body, isSalary);

  for (const rule of TAG_RULES) {
    if (hasAny(m, rule.merchant, true)) return rule.tag;
    if (rule.body && hasAny(b, rule.body)) return rule.tag;
  }
  if (looksLikePerson(merchant)) return 'money_transfer';
  return 'miscellaneous';
}

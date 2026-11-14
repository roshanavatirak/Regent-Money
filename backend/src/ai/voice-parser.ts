// Reads a spoken transaction ("Swiggy pe 450 rupaye kharch kiye HDFC se") without any AI.
//
// Used two ways:
//  1. as a check on the AI's answer (the amount must be one the person actually said), and
//  2. as the answer itself when every AI is down.
//
// Understands Hindi, English and the usual mix of both, in Latin or Devanagari script.

import { predictTag } from '../sync/merchant-tag-rules';

export interface VoiceDraft {
  type: 'debit' | 'credit';
  /** null when no amount was heard. */
  amount: number | null;
  merchant: string;
  category: string;
  /** One of the account labels the phone sent, 'cash', or null when none was said. */
  account: string | null;
  /** YYYY-MM-DD, or null for "now". */
  date: string | null;
  /** HH:mm, or null. */
  time: string | null;
}

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** Lower-cases, turns Devanagari digits into 0-9, and joins "1,200" into "1200". */
export const normalizeSpoken = (raw: string): string =>
  String(raw || '')
    .toLowerCase()
    .replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)))
    .replace(/(\d),(?=\d)/g, '$1')
    .replace(/[“”"'‘’।|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/* ------------------------------------------------------------------ */
/* Numbers said as words                                               */
/* ------------------------------------------------------------------ */

const UNITS: Record<string, number> = {
  // English
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
  // Hindi (Latin)
  ek: 1,
  do: 2,
  teen: 3,
  tin: 3,
  char: 4,
  chaar: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  chhah: 6,
  che: 6,
  saat: 7,
  aath: 8,
  aat: 8,
  nau: 9,
  das: 10,
  dus: 10,
  gyarah: 11,
  barah: 12,
  baarah: 12,
  terah: 13,
  chaudah: 14,
  pandrah: 15,
  solah: 16,
  satrah: 17,
  atharah: 18,
  unnis: 19,
  bees: 20,
  bis: 20,
  pachees: 25,
  pachis: 25,
  tees: 30,
  tis: 30,
  paintees: 35,
  chalis: 40,
  chaalis: 40,
  paintalis: 45,
  pachas: 50,
  pachaas: 50,
  pachpan: 55,
  saath: 60,
  sath: 60,
  painsath: 65,
  sattar: 70,
  pachattar: 75,
  assi: 80,
  pachasi: 85,
  nabbe: 90,
  pachanve: 95,
  // Hindi (Devanagari)
  एक: 1,
  दो: 2,
  तीन: 3,
  चार: 4,
  पांच: 5,
  पाँच: 5,
  छह: 6,
  छः: 6,
  सात: 7,
  आठ: 8,
  नौ: 9,
  दस: 10,
  ग्यारह: 11,
  बारह: 12,
  तेरह: 13,
  चौदह: 14,
  पंद्रह: 15,
  सोलह: 16,
  सत्रह: 17,
  अठारह: 18,
  उन्नीस: 19,
  बीस: 20,
  पच्चीस: 25,
  तीस: 30,
  पैंतीस: 35,
  चालीस: 40,
  पैंतालीस: 45,
  पचास: 50,
  पचपन: 55,
  साठ: 60,
  पैंसठ: 65,
  सत्तर: 70,
  पचहत्तर: 75,
  अस्सी: 80,
  पचासी: 85,
  नब्बे: 90,
  पचानवे: 95,
};

/** "dedh sau" = 150, "dhai hazaar" = 2500, "sava sau" = 125, "paune do sau" = 175. */
const FRACTIONS: Record<string, number> = {
  dedh: 1.5,
  derh: 1.5,
  डेढ़: 1.5,
  डेढ: 1.5,
  dhai: 2.5,
  adhai: 2.5,
  ढाई: 2.5,
  अढ़ाई: 2.5,
  sava: 1.25,
  sawa: 1.25,
  सवा: 1.25,
};
/** "saade teen sau" = 350. */
const HALF_MORE = new Set(['saade', 'sade', 'sadhe', 'साढ़े', 'साढे']);
/** "paune do sau" = 175. */
const QUARTER_LESS = new Set(['paune', 'pone', 'पौने']);

const MULTIPLIERS: Record<string, number> = {
  hundred: 100,
  sau: 100,
  so: 100,
  सौ: 100,
  thousand: 1000,
  hazaar: 1000,
  hazar: 1000,
  hajar: 1000,
  hajaar: 1000,
  k: 1000,
  हज़ार: 1000,
  हजार: 1000,
  lakh: 100000,
  lac: 100000,
  lakhs: 100000,
  लाख: 100000,
  crore: 10000000,
  karod: 10000000,
  करोड़: 10000000,
};

const RUPEE_WORDS =
  /^(₹|rs\.?|inr|rupee|rupees|rupaye|rupay|rupaiye|rupaya|rupiya|rupya|bucks|रुपये|रुपए|रुपया|रुपय|रूपये)$/;

interface NumberHit {
  value: number;
  /** Index of the first and last token the number used. */
  start: number;
  end: number;
  /** A rupee word sits right before or after it. */
  nearRupee: boolean;
}

const tokenize = (text: string): string[] =>
  text
    .replace(/₹\s*/g, ' ₹ ')
    .replace(/(\d)(k|rs|sau|hazaar|hazar|lakh)\b/g, '$1 $2')
    .replace(/\brs\.?(\d)/g, 'rs $1')
    .replace(/[,;:!?()]/g, ' ')
    .split(/\s+/)
    .map((t) => t.replace(/\.+$/, ''))
    .filter(Boolean);

/** Every number in the sentence, whether said as digits, words or a mix ("2 hazaar 500"). */
export const findNumbers = (tokens: string[]): NumberHit[] => {
  const hits: NumberHit[] = [];
  let i = 0;
  while (i < tokens.length) {
    const start = i;
    let total = 0;
    let current = 0;
    let seen = false;
    let addHalf = false;
    let lessQuarter = false;

    while (i < tokens.length) {
      const t = tokens[i];
      const digit = /^\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
      if (HALF_MORE.has(t) && !seen) {
        addHalf = true;
      } else if (QUARTER_LESS.has(t) && !seen) {
        lessQuarter = true;
      } else if (t in FRACTIONS) {
        current += FRACTIONS[t];
        seen = true;
      } else if (!isNaN(digit)) {
        // Two digit groups in a row ("450 20") are two numbers, not one
        if (seen && current > 0) break;
        current += digit;
        seen = true;
      } else if (t in UNITS) {
        current += UNITS[t];
        seen = true;
      } else if (
        t in MULTIPLIERS &&
        (seen || addHalf || lessQuarter || t !== 'so')
      ) {
        // "sau" with nothing before it means one hundred; "k" alone is not a number
        if (!seen && (t === 'k' || t === 'do')) break;
        let base = current || 1;
        if (addHalf) base += 0.5;
        if (lessQuarter) base -= 0.25;
        addHalf = false;
        lessQuarter = false;
        const m = MULTIPLIERS[t];
        if (m >= 1000) {
          total += base * m;
          current = 0;
        } else {
          current = base * m;
        }
        seen = true;
      } else if (t === 'and' || t === 'aur' || t === 'और') {
        // "two hundred and fifty": only joins when a number follows straight away
        const next = tokens[i + 1];
        if (!seen || !next || !(next in UNITS || /^\d+$/.test(next))) break;
        if (current % 100 !== 0 || current === 0) break;
      } else {
        break;
      }
      i++;
    }

    if (seen) {
      let value = total + current;
      if (addHalf) value += 0.5;
      if (lessQuarter) value -= 0.25;
      const end = i - 1;
      const before = tokens[start - 1] || '';
      const after = tokens[end + 1] || '';
      hits.push({
        value,
        start,
        end,
        nearRupee: RUPEE_WORDS.test(before) || RUPEE_WORDS.test(after),
      });
    } else {
      i = start + 1;
    }
  }
  return hits;
};

/* ------------------------------------------------------------------ */
/* Words that say what happened                                        */
/* ------------------------------------------------------------------ */

const CREDIT_WORDS = [
  'received',
  'receive',
  'got',
  'credited',
  'credit',
  'salary',
  'income',
  'refund',
  'cashback',
  'earned',
  'deposit',
  'deposited',
  'mila',
  'mile',
  'mili',
  'aaya',
  'aaye',
  'aayi',
  'aya',
  'jama',
  'wapas',
  'vapas',
  'lauta',
  'tankhwah',
  'मिला',
  'मिले',
  'मिली',
  'आया',
  'आए',
  'आई',
  'जमा',
  'वापस',
  'सैलरी',
  'तनख्वाह',
  'क्रेडिट',
  'रिफंड',
];
const DEBIT_WORDS = [
  'spent',
  'spend',
  'paid',
  'pay',
  'bought',
  'buy',
  'gave',
  'sent',
  'debited',
  'debit',
  'expense',
  'purchase',
  'kharch',
  'kharcha',
  'diya',
  'diye',
  'di',
  'bheja',
  'bheje',
  'liya',
  'liye',
  'kharida',
  'kharidi',
  'bhara',
  'chukaya',
  'खर्च',
  'खर्चा',
  'दिया',
  'दिए',
  'दी',
  'भेजा',
  'भेजे',
  'लिया',
  'लिए',
  'खरीदा',
  'खरीदी',
  'भरा',
  'डेबिट',
  'पेमेंट',
];

const CASH_WORDS = ['cash', 'nakad', 'naqad', 'कैश', 'नकद', 'नगद'];

/** Bank names as speech-to-text writes them in Devanagari, mapped to how the app spells them. */
const DEVANAGARI_BANKS: Record<string, string> = {
  एचडीएफसी: 'hdfc',
  कोटक: 'kotak',
  एसबीआई: 'sbi',
  'स्टेट बैंक': 'sbi',
  आईसीआईसीआई: 'icici',
  एक्सिस: 'axis',
  पेटीएम: 'paytm',
  पीएनबी: 'pnb',
  'बैंक ऑफ बड़ौदा': 'baroda',
  बड़ौदा: 'baroda',
  केनरा: 'canara',
  यूनियन: 'union',
  इंडसइंड: 'indusind',
  'यस बैंक': 'yes',
  आईडीएफसी: 'idfc',
  फेडरल: 'federal',
  महाराष्ट्र: 'maharashtra',
};

/** Everyday words that say the category when the merchant alone does not. */
const CATEGORY_WORDS: Array<[string, string[]]> = [
  [
    'food',
    [
      'food',
      'khana',
      'khaana',
      'lunch',
      'dinner',
      'breakfast',
      'nashta',
      'chai',
      'coffee',
      'tea',
      'snacks',
      'restaurant',
      'hotel',
      'pizza',
      'biryani',
      'खाना',
      'चाय',
      'नाश्ता',
      'कॉफी',
      'लंच',
      'डिनर',
    ],
  ],
  [
    'groceries',
    [
      'grocery',
      'groceries',
      'kirana',
      'sabzi',
      'sabji',
      'doodh',
      'milk',
      'vegetables',
      'ration',
      'rashan',
      'किराना',
      'सब्जी',
      'सब्ज़ी',
      'दूध',
      'राशन',
    ],
  ],
  ['fuel', ['petrol', 'diesel', 'fuel', 'cng', 'पेट्रोल', 'डीजल', 'डीज़ल']],
  [
    'transport',
    [
      'auto',
      'rickshaw',
      'riksha',
      'cab',
      'taxi',
      'bus',
      'metro',
      'uber',
      'ola',
      'rapido',
      'kiraya bus',
      'ऑटो',
      'रिक्शा',
      'टैक्सी',
      'बस',
      'मेट्रो',
    ],
  ],
  ['recharge', ['recharge', 'रिचार्ज']],
  ['rent', ['rent', 'kiraya', 'kiraaya', 'किराया']],
  [
    'utilities',
    ['bijli', 'electricity', 'light bill', 'water bill', 'gas bill', 'बिजली'],
  ],
  ['bills', ['bill', 'बिल']],
  [
    'medical',
    [
      'medicine',
      'medical',
      'dawai',
      'dawa',
      'doctor',
      'hospital',
      'pharmacy',
      'chemist',
      'दवाई',
      'दवा',
      'डॉक्टर',
      'अस्पताल',
    ],
  ],
  [
    'entertainment',
    ['movie', 'film', 'cinema', 'picture', 'game', 'मूवी', 'फिल्म'],
  ],
  [
    'shopping',
    [
      'shopping',
      'kapde',
      'clothes',
      'shoes',
      'joote',
      'कपड़े',
      'शॉपिंग',
      'जूते',
    ],
  ],
  [
    'education',
    [
      'fees',
      'fee',
      'school',
      'college',
      'tuition',
      'course',
      'books',
      'फीस',
      'स्कूल',
      'कॉलेज',
    ],
  ],
  ['salary', ['salary', 'tankhwah', 'सैलरी', 'तनख्वाह']],
  ['cashback', ['cashback', 'कैशबैक']],
  ['interest', ['interest', 'byaj', 'ब्याज']],
  ['emi_loans', ['emi', 'loan', 'kist', 'किस्त', 'लोन']],
  [
    'investment',
    ['sip', 'mutual fund', 'investment', 'shares', 'stocks', 'निवेश'],
  ],
  ['travel', ['flight', 'train', 'ticket', 'trip', 'टिकट', 'ट्रेन', 'फ्लाइट']],
];

/** Words that are never the merchant's name. */
const NOISE = new Set([
  'maine',
  'mene',
  'main',
  'mai',
  'i',
  'me',
  'my',
  'mera',
  'mere',
  'meri',
  'ne',
  'ko',
  'se',
  'pe',
  'par',
  'mein',
  'me',
  'ka',
  'ki',
  'ke',
  'ke liye',
  'liye',
  'for',
  'at',
  'to',
  'from',
  'on',
  'in',
  'the',
  'a',
  'an',
  'of',
  'with',
  'by',
  'aaj',
  'kal',
  'parso',
  'today',
  'yesterday',
  'abhi',
  'hai',
  'hain',
  'tha',
  'the',
  'thi',
  'hua',
  'hue',
  'ho',
  'gaya',
  'gaye',
  'gayi',
  'kiya',
  'kiye',
  'kar',
  'karke',
  'wala',
  'wale',
  'aur',
  'and',
  'bank',
  'account',
  'upi',
  'online',
  'paise',
  'paisa',
  'money',
  'amount',
  'total',
  'ek',
  'bhi',
  'toh',
  'to',
  'was',
  'is',
  'were',
  'it',
  'this',
  'that',
  'मैंने',
  'मैं',
  'ने',
  'को',
  'से',
  'पे',
  'पर',
  'में',
  'का',
  'की',
  'के',
  'लिए',
  'आज',
  'कल',
  'परसों',
  'अभी',
  'है',
  'हैं',
  'था',
  'थे',
  'थी',
  'हुआ',
  'हुए',
  'गया',
  'गए',
  'किया',
  'किए',
  'कर',
  'और',
  'बैंक',
  'पैसे',
  'पैसा',
  'यूपीआई',
]);

const hasWord = (text: string, word: string) =>
  // \b does not work around Devanagari, so compare whole space-separated pieces instead
  ` ${text} `.includes(` ${word} `);

const pad2 = (n: number) => String(n).padStart(2, '0');
const isoDay = (d: Date) =>
  `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;

/** Today's date in India as a Date at UTC midnight (so adding days is safe). */
export const istToday = (now = Date.now()): Date => {
  const ist = new Date(now + 5.5 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()),
  );
};

const titleCase = (s: string) =>
  s.replace(/(^|\s)([a-z])/g, (_, a, b) => a + b.toUpperCase());

/** The first word of an account name, the way people say it: "HDFC Bank" -> "hdfc". */
export const accountKey = (label: string) =>
  String(label || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .trim()
    .split(/\s+/)[0] || '';

/** Which of the user's accounts was named in the sentence, 'cash', or null. */
export const matchAccount = (
  text: string,
  accounts: string[],
): string | null => {
  // Full stops and commas from speech-to-text must not hide a name ("from HDFC.")
  let t = ` ${text.replace(/[.,!?;:()]/g, ' ')} `;
  for (const [dev, latin] of Object.entries(DEVANAGARI_BANKS))
    t = t.split(dev).join(` ${latin} `);
  t = t.replace(/\s+/g, ' ');
  for (const label of accounts) {
    const key = accountKey(label);
    if (key && key !== 'cash' && key.length >= 2 && hasWord(t.trim(), key))
      return label;
  }
  if (CASH_WORDS.some((w) => hasWord(t.trim(), w))) {
    return accounts.find((a) => accountKey(a) === 'cash') || 'cash';
  }
  return null;
};

/**
 * One spoken sentence as a draft transaction. `amount` is null when no amount was heard:
 * the app then asks for it instead of guessing.
 */
export const parseSpokenTransaction = (
  raw: string,
  accounts: string[] = [],
  now = Date.now(),
): VoiceDraft => {
  const text = normalizeSpoken(raw);
  const tokens = tokenize(text);
  const joined = tokens.join(' ');

  // Amount: the number next to a rupee word wins, otherwise the largest one that is not a clock time
  const numbers = findNumbers(tokens).filter(
    (n) => n.value > 0 && n.value < 100000000,
  );
  const best =
    numbers.find((n) => n.nearRupee) ||
    [...numbers].sort((a, b) => b.value - a.value)[0] ||
    null;
  const amount = best ? Math.round(best.value * 100) / 100 : null;

  const credit = CREDIT_WORDS.some((w) => hasWord(joined, w));
  const debit = DEBIT_WORDS.some((w) => hasWord(joined, w));
  const type: 'debit' | 'credit' = credit && !debit ? 'credit' : 'debit';

  const account = matchAccount(joined, accounts);

  // Day: kal / yesterday, parso / day before. "kal" is always the past here: nobody logs tomorrow's spend.
  const today = istToday(now);
  let date: string | null = null;
  if (
    hasWord(joined, 'parso') ||
    hasWord(joined, 'परसों') ||
    joined.includes('day before yesterday')
  ) {
    date = isoDay(new Date(today.getTime() - 2 * 86400000));
  } else if (
    hasWord(joined, 'kal') ||
    hasWord(joined, 'कल') ||
    hasWord(joined, 'yesterday')
  ) {
    date = isoDay(new Date(today.getTime() - 86400000));
  }

  // Merchant: what is left after taking out numbers, money words, account names and filler
  const used = new Set<number>();
  if (best) for (let k = best.start; k <= best.end; k++) used.add(k);
  const accountWords = new Set<string>([
    ...accounts.map(accountKey),
    ...CASH_WORDS,
    ...Object.values(DEVANAGARI_BANKS),
  ]);
  const kept = tokens.filter((t, idx) => {
    if (used.has(idx)) return false;
    if (RUPEE_WORDS.test(t) || NOISE.has(t) || accountWords.has(t))
      return false;
    if (CREDIT_WORDS.includes(t) || DEBIT_WORDS.includes(t)) return false;
    if (t in MULTIPLIERS || /^\d/.test(t)) return false;
    return true;
  });

  let category = 'miscellaneous';
  for (const [tag, words] of CATEGORY_WORDS) {
    if (
      words.some((w) =>
        w.includes(' ') ? joined.includes(w) : hasWord(joined, w),
      )
    ) {
      category = tag;
      break;
    }
  }

  const merchantRaw = kept.slice(0, 4).join(' ').trim();
  const merchant = /[a-z]/.test(merchantRaw)
    ? titleCase(merchantRaw)
    : merchantRaw;

  // The app's own merchant rules know brands ("swiggy" -> food) better than the word list
  if (merchant) {
    const byRule = predictTag(merchant, null, type);
    if (
      byRule &&
      byRule !== 'miscellaneous' &&
      (byRule !== 'money_transfer' || category === 'miscellaneous')
    ) {
      category = byRule;
    }
  }
  if (
    type === 'credit' &&
    !['salary', 'cashback', 'interest', 'investment', 'self_transfer'].includes(
      category,
    )
  ) {
    category = 'money_received';
  }

  return {
    type,
    amount,
    merchant: merchant.slice(0, 50),
    category,
    account,
    date,
    time: null,
  };
};

/** True when `amount` is a number the person actually said (digits or words). */
export const amountWasSpoken = (raw: string, amount: number): boolean => {
  const numbers = findNumbers(tokenize(normalizeSpoken(raw)));
  return numbers.some((n) => Math.abs(n.value - amount) < 0.005);
};

import {
  amountWasSpoken,
  findNumbers,
  matchAccount,
  normalizeSpoken,
  parseSpokenTransaction,
} from './voice-parser';
import { cleanDraft, geminiTranscript } from './voice.service';

const ACCOUNTS = [
  'HDFC Bank',
  'Kotak Mahindra Bank',
  'State Bank of India',
  'Cash',
];
// 14 Nov 2026, 10:00 IST
const NOW = Date.UTC(2026, 10, 14, 4, 30);

const amountOf = (s: string) => parseSpokenTransaction(s, ACCOUNTS, NOW).amount;

describe('spoken numbers', () => {
  it.each([
    ['450 rupaye', 450],
    ['₹1,200 diye', 1200],
    ['rs 99.50 paid', 99.5],
    ['2k bheje', 2000],
    ['dedh sau ki chai', 150],
    ['dhai hazaar kiraya', 2500],
    ['sava sau rupaye', 125],
    ['saade teen sau rupaye', 350],
    ['paune do sau rupaye', 175],
    ['do sau pachas rupaye', 250],
    ['ek hazaar do sau rupaye', 1200],
    ['2 hazaar 500 rupaye', 2500],
    ['two hundred and fifty rupees', 250],
    ['twenty five thousand salary', 25000],
    ['ek lakh mila', 100000],
    ['४५० रुपये खर्च किए', 450],
    ['पांच सौ रुपये दिए', 500],
    ['डेढ़ सौ की चाय', 150],
  ])('%s -> %d', (said, expected) => {
    expect(amountOf(said)).toBe(expected);
  });

  it('prefers the number next to a rupee word', () => {
    expect(amountOf('2 chai 40 rupaye')).toBe(40);
  });

  it('keeps two separate numbers separate', () => {
    const hits = findNumbers(normalizeSpoken('chai 20 aur auto 50').split(' '));
    expect(hits.map((h) => h.value)).toEqual([20, 50]);
  });

  it('returns no amount when none was said', () => {
    expect(amountOf('Rahul ko paise diye cash mein')).toBeNull();
  });
});

describe('parseSpokenTransaction', () => {
  it('reads a Hinglish expense with a bank', () => {
    const d = parseSpokenTransaction(
      'Swiggy pe 450 rupaye kharch kiye HDFC se',
      ACCOUNTS,
      NOW,
    );
    expect(d).toMatchObject({
      type: 'debit',
      amount: 450,
      merchant: 'Swiggy',
      category: 'food',
      account: 'HDFC Bank',
    });
    expect(d.date).toBeNull();
  });

  it('reads a cash expense', () => {
    const d = parseSpokenTransaction('chai 20 rupaye cash', ACCOUNTS, NOW);
    expect(d).toMatchObject({
      type: 'debit',
      amount: 20,
      category: 'food',
      account: 'Cash',
    });
  });

  it('reads income', () => {
    const d = parseSpokenTransaction(
      'salary 45000 credited in SBI',
      ['SBI', 'Cash'],
      NOW,
    );
    expect(d).toMatchObject({
      type: 'credit',
      amount: 45000,
      category: 'salary',
      account: 'SBI',
    });
  });

  it('treats money from a person as money received', () => {
    const d = parseSpokenTransaction('Rahul se 500 rupaye mile', ACCOUNTS, NOW);
    expect(d).toMatchObject({
      type: 'credit',
      amount: 500,
      category: 'money_received',
    });
    expect(d.merchant).toBe('Rahul');
  });

  it('reads Devanagari with a Devanagari bank name', () => {
    const d = parseSpokenTransaction(
      'पेट्रोल 500 रुपये कोटक से',
      ACCOUNTS,
      NOW,
    );
    expect(d).toMatchObject({
      type: 'debit',
      amount: 500,
      category: 'fuel',
      account: 'Kotak Mahindra Bank',
    });
  });

  it('understands kal and parso as past days', () => {
    expect(
      parseSpokenTransaction('kal auto 80 rupaye', ACCOUNTS, NOW).date,
    ).toBe('2026-11-13');
    expect(
      parseSpokenTransaction('parso 200 ka recharge', ACCOUNTS, NOW).date,
    ).toBe('2026-11-12');
  });

  it('says cash even when the user has no cash wallet', () => {
    expect(matchAccount('100 rupaye nakad diye', ['HDFC Bank'])).toBe('cash');
  });

  it('finds a bank name followed by punctuation', () => {
    expect(
      matchAccount(
        normalizeSpoken('I spent ₹450 at Swiggy from HDFC.'),
        ACCOUNTS,
      ),
    ).toBe('HDFC Bank');
  });

  it('does not match an account that was not said', () => {
    expect(
      parseSpokenTransaction('Amazon 999 rupaye', ACCOUNTS, NOW).account,
    ).toBeNull();
  });
});

describe('cleanDraft (checks on the AI answer)', () => {
  const said = 'Swiggy pe 450 rupaye kharch kiye HDFC se';

  it('accepts a correct draft and marks the amount as verified', () => {
    const d = cleanDraft(
      {
        type: 'debit',
        amount: 450,
        merchant: 'Swiggy',
        category: 'food',
        account: 'HDFC Bank',
        date: null,
        time: null,
      },
      said,
      ACCOUNTS,
      NOW,
    );
    expect(d).toMatchObject({
      amount: 450,
      amountVerified: true,
      account: 'HDFC Bank',
      category: 'food',
    });
  });

  it('flags an amount that was never said', () => {
    const d = cleanDraft(
      { type: 'debit', amount: 4500, merchant: 'Swiggy', category: 'food' },
      said,
      ACCOUNTS,
      NOW,
    );
    expect(d?.amountVerified).toBe(false);
  });

  it('drops an account the AI made up', () => {
    const d = cleanDraft(
      { type: 'debit', amount: 999, merchant: 'Amazon', account: 'HDFC Bank' },
      'Amazon 999 rupaye',
      ACCOUNTS,
      NOW,
    );
    expect(d?.account).toBeNull();
  });

  it('replaces an unknown category and a future date', () => {
    const d = cleanDraft(
      {
        type: 'debit',
        amount: 450,
        merchant: 'Swiggy',
        category: 'yummy',
        date: '2027-01-01',
        time: '25:00',
      },
      said,
      ACCOUNTS,
      NOW,
    );
    expect(d).toMatchObject({
      category: 'miscellaneous',
      date: null,
      time: null,
    });
  });

  it('rejects junk', () => {
    expect(cleanDraft(null, said, ACCOUNTS, NOW)).toBeNull();
    expect(
      cleanDraft({ amount: -5, merchant: '' }, said, ACCOUNTS, NOW),
    ).toBeNull();
  });

  it('strips markup from the merchant', () => {
    const d = cleanDraft(
      { type: 'debit', amount: 450, merchant: '<b>Swiggy</b>\n{x}' },
      said,
      ACCOUNTS,
      NOW,
    );
    expect(d?.merchant).toBe('bSwiggy/b x');
  });
});

describe('amountWasSpoken', () => {
  it('matches digits and words', () => {
    expect(amountWasSpoken('dedh sau ki chai', 150)).toBe(true);
    expect(amountWasSpoken('450 rupaye', 450)).toBe(true);
    expect(amountWasSpoken('450 rupaye', 540)).toBe(false);
  });
});

describe('geminiTranscript', () => {
  it('reads every reply shape', () => {
    expect(geminiTranscript({ output_text: 'hello' })).toBe('hello');
    expect(
      geminiTranscript({
        steps: [
          { type: 'model_output', content: [{ type: 'text', text: 'a b' }] },
        ],
      }),
    ).toBe('a b');
    expect(geminiTranscript({ outputs: [{ type: 'text', text: 'c' }] })).toBe(
      'c',
    );
    expect(geminiTranscript({})).toBeUndefined();
  });
});

import { classifySms, LedgerRow, SmsCandidate, smsContentId, smsReviewKeys } from './sms-dedupe.util';

const T0 = new Date(2026, 10, 7, 14, 30, 0).getTime();
const MIN = 60_000;

const row = (over: Partial<LedgerRow>): LedgerRow => ({
  id: 'row_' + Math.random().toString(36).slice(2, 8),
  amount: 500,
  timestamp: T0,
  smsId: null,
  contentId: null,
  party: 'Swiggy',
  bankProfileId: 'bank_1',
  isDeleted: false,
  ...over,
});

const sms = (over: Partial<SmsCandidate>): SmsCandidate => ({
  amount: 500,
  timestamp: T0,
  merchant: 'Swiggy',
  bankProfileId: 'bank_1',
  ...over,
});

describe('classifySms: re-reading an SMS is never a duplicate', () => {
  it('matches the same UPI reference', () => {
    const r = row({ smsId: 'ref_432198765432' });
    expect(classifySms([r], sms({ referenceId: '432198765432', smsId: 'ref_432198765432' })).kind).toBe('same');
  });

  it('matches the same text hash (card / ATM SMS without a reference)', () => {
    const r = row({ smsId: 'sms_123', contentId: 'sms_123' });
    expect(classifySms([r], sms({ smsId: 'sms_123', contentId: 'sms_123' })).kind).toBe('same');
  });

  it('matches by text hash when the stored id is a reference the parser no longer finds', () => {
    const r = row({ smsId: 'ref_ABC12345', contentId: 'sms_77' });
    expect(classifySms([r], sms({ smsId: 'sms_77', contentId: 'sms_77' })).kind).toBe('same');
  });

  it('recognises an SMS whose row the user deleted, so it does not come back', () => {
    const r = row({ smsId: 'sms_9', contentId: 'sms_9', isDeleted: true });
    expect(classifySms([r], sms({ smsId: 'sms_9', contentId: 'sms_9' })).kind).toBe('same');
  });

  it('claims a legacy income row that has no stored SMS identity', () => {
    const r = row({ smsId: null, party: 'Salary ACME', timestamp: T0 + 20_000 });
    const match = classifySms([r], sms({ merchant: 'Salary ACME', smsId: 'sms_5', contentId: 'sms_5' }));
    expect(match.kind).toBe('legacy');
  });

  it('gives each of two legacy look-alikes its own row', () => {
    const a = row({ id: 'a', timestamp: T0 });
    const b = row({ id: 'b', timestamp: T0 + MIN });
    const claimed = new Set<string>();
    const first = classifySms([a, b], sms({ timestamp: T0, contentId: 'sms_1', smsId: 'sms_1' }), claimed);
    expect(first).toEqual({ kind: 'legacy', row: a });
    claimed.add(a.id);
    a.contentId = 'sms_1';
    const second = classifySms([a, b], sms({ timestamp: T0 + MIN, contentId: 'sms_2', smsId: 'sms_2' }), claimed);
    expect(second).toEqual({ kind: 'legacy', row: b });
  });
});

describe('classifySms: genuine double payments are still reviewed', () => {
  it('flags a second UPI payment with a different reference a minute later', () => {
    const first = row({ smsId: 'ref_111111111111', contentId: 'sms_1' });
    const match = classifySms(
      [first],
      sms({ timestamp: T0 + MIN, referenceId: '222222222222', smsId: 'ref_222222222222', contentId: 'sms_2' }),
    );
    expect(match.kind).toBe('duplicate');
  });

  it('flags a second card swipe with different SMS text a minute later', () => {
    const first = row({ smsId: 'sms_1', contentId: 'sms_1' });
    expect(classifySms([first], sms({ timestamp: T0 + 90_000, smsId: 'sms_2', contentId: 'sms_2' })).kind).toBe(
      'duplicate',
    );
  });

  it('does not flag a different merchant', () => {
    const first = row({ smsId: 'sms_1', contentId: 'sms_1' });
    expect(
      classifySms([first], sms({ merchant: 'Zomato', timestamp: T0 + MIN, smsId: 'sms_2', contentId: 'sms_2' })).kind,
    ).toBe('new');
  });

  it('does not flag the same amount at another bank', () => {
    const first = row({ smsId: 'sms_1', contentId: 'sms_1', bankProfileId: 'bank_2' });
    expect(classifySms([first], sms({ timestamp: T0 + MIN, smsId: 'sms_2', contentId: 'sms_2' })).kind).toBe('new');
  });

  it('does not flag payments more than two minutes apart', () => {
    const first = row({ smsId: 'sms_1', contentId: 'sms_1' });
    expect(classifySms([first], sms({ timestamp: T0 + 3 * MIN, smsId: 'sms_2', contentId: 'sms_2' })).kind).toBe(
      'new',
    );
  });

  it('does not flag against a deleted payment', () => {
    const first = row({ smsId: 'sms_1', contentId: 'sms_1', isDeleted: true });
    expect(classifySms([first], sms({ timestamp: T0 + MIN, smsId: 'sms_2', contentId: 'sms_2' })).kind).toBe('new');
  });

  it('flags two payments whose SMS text is identical but sent one second apart', () => {
    // e.g. "Rs 500 spent on card XX1234 at SWIGGY on 07-11-26": no reference, no balance
    const first = row({ smsId: 'sms_42', contentId: 'sms_42', timestamp: T0 });
    expect(classifySms([first], sms({ timestamp: T0 + 1000, smsId: 'sms_42', contentId: 'sms_42' })).kind).toBe(
      'duplicate',
    );
  });

  it('still treats a re-read of that identical-text SMS (same sent time) as the same SMS', () => {
    const first = row({ smsId: 'sms_42', contentId: 'sms_42', timestamp: T0 });
    expect(classifySms([first], sms({ timestamp: T0, smsId: 'sms_42', contentId: 'sms_42' })).kind).toBe('same');
  });

  it('keeps text-only matching for rows saved before content_id existed', () => {
    // Older rows may carry a few seconds of drift, so time is not used for them
    const old = row({ smsId: 'sms_42', contentId: null, timestamp: T0 });
    expect(classifySms([old], sms({ timestamp: T0 + 4000, smsId: 'sms_42', contentId: 'sms_42' })).kind).toBe('same');
  });

  it('remembers the answer to an identical-text review', () => {
    const first = row({ smsId: 'sms_42', contentId: 'sms_42', timestamp: T0 });
    const answered = row({ smsId: 'sms_42', contentId: 'sms_42', timestamp: T0 + 1000, isDeleted: true });
    const match = classifySms([first, answered], sms({ timestamp: T0 + 1000, smsId: 'sms_42', contentId: 'sms_42' }));
    expect(match).toEqual({ kind: 'same', row: answered });
  });

  it('remembers a dismissed review (stored as a deleted row with the SMS identity)', () => {
    const paid = row({ smsId: 'sms_1', contentId: 'sms_1' });
    const dismissed = row({ smsId: 'sms_2', contentId: 'sms_2', timestamp: T0 + MIN, isDeleted: true });
    expect(classifySms([paid, dismissed], sms({ timestamp: T0 + MIN, smsId: 'sms_2', contentId: 'sms_2' })).kind).toBe(
      'same',
    );
  });
});

describe('SMS identity helpers', () => {
  it('hashes text exactly like the phone (whitespace collapsed)', () => {
    expect(smsContentId('Rs 500  debited\nfrom A/c')).toBe(smsContentId('Rs 500 debited from A/c'));
    expect(smsContentId('abc')).toBe('sms_96354');
  });

  it('lists every key a review may be stored under', () => {
    expect(smsReviewKeys(sms({ referenceId: '123456789012', smsId: 'ref_123456789012', contentId: 'sms_4' }))).toEqual([
      'ref_123456789012',
      'sms_4',
    ]);
  });
});

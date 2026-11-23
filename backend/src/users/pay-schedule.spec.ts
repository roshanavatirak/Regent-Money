import { cleanPaySchedule, parsePaySchedule } from './pay-schedule';
import { daysToNextPayoutIST } from '../notifications/signals.service';

const ist = (y: number, m: number, d: number, h = 12) => Date.UTC(y, m - 1, d, h) - 5.5 * 60 * 60 * 1000;

describe('cleanPaySchedule', () => {
  it('keeps valid schedules and drops fields that do not belong', () => {
    expect(cleanPaySchedule({ kind: 'weekly', weekday: 1, secondPayday: 7 })).toEqual({ kind: 'weekly', weekday: 1 });
    expect(cleanPaySchedule({ kind: 'irregular' })).toEqual({ kind: 'irregular' });
    expect(cleanPaySchedule({ kind: 'monthly', secondPayday: 7, secondLabel: '  Partner’s salary  ' })).toEqual({
      kind: 'monthly',
      secondPayday: 7,
      secondLabel: 'Partner’s salary',
    });
  });

  it('rejects anything malformed', () => {
    expect(cleanPaySchedule(null)).toBeNull();
    expect(cleanPaySchedule('weekly')).toBeNull();
    expect(cleanPaySchedule({ kind: 'daily' })).toBeNull();
    expect(cleanPaySchedule({ kind: 'weekly', weekday: 9 })).toBeNull();
    expect(cleanPaySchedule({ kind: 'fortnightly', anchor: 'soon' })).toBeNull();
    expect(cleanPaySchedule({ kind: 'monthly', secondPayday: 40 })).toEqual({ kind: 'monthly' });
    expect(cleanPaySchedule({ kind: 'monthly', secondPayday: 7, secondLabel: 'x'.repeat(500) })!.secondLabel!.length).toBe(40);
  });

  it('parses stored text, tolerating damage', () => {
    expect(parsePaySchedule(JSON.stringify({ kind: 'weekly', weekday: 3 }))).toEqual({ kind: 'weekly', weekday: 3 });
    expect(parsePaySchedule('{oops')).toBeNull();
    expect(parsePaySchedule(null)).toBeNull();
  });
});

describe('daysToNextPayoutIST', () => {
  it('weekly: days to the payout weekday; on payday, a full week', () => {
    // 18 Nov 2026 is a Wednesday; paid Mondays.
    expect(daysToNextPayoutIST({ kind: 'weekly', weekday: 1 }, ist(2026, 11, 18))).toBe(5);
    expect(daysToNextPayoutIST({ kind: 'weekly', weekday: 1 }, ist(2026, 11, 23))).toBe(7);
  });

  it('every 2 weeks: counts from the anchor', () => {
    const anchor = ist(2026, 11, 6, 0);
    expect(daysToNextPayoutIST({ kind: 'fortnightly', anchor }, ist(2026, 11, 18))).toBe(2);
    expect(daysToNextPayoutIST({ kind: 'fortnightly', anchor }, ist(2026, 11, 20))).toBe(14);
  });

  it('monthly and irregular leave it to the salary day or month end', () => {
    expect(daysToNextPayoutIST({ kind: 'irregular' }, ist(2026, 11, 18))).toBeNull();
    expect(daysToNextPayoutIST(null, ist(2026, 11, 18))).toBeNull();
  });
});

import { daysToNextPaydayIST } from './signals.service';

// A moment given as IST wall-clock time.
const ist = (y: number, m: number, d: number, h = 12, min = 0) => Date.UTC(y, m - 1, d, h, min) - 5.5 * 60 * 60 * 1000;

describe('daysToNextPaydayIST', () => {
  it('counts to this month’s payday', () => {
    expect(daysToNextPaydayIST(7, ist(2026, 11, 3))).toBe(4);
  });

  it('treats today’s payday as received and counts to next month', () => {
    expect(daysToNextPaydayIST(7, ist(2026, 11, 7))).toBe(30);
  });

  it('clamps month-end salary to short months', () => {
    expect(daysToNextPaydayIST(31, ist(2026, 2, 20))).toBe(8); // 28 Feb
    expect(daysToNextPaydayIST(31, ist(2026, 2, 28))).toBe(31); // then 31 Mar
  });

  it('uses the IST date just after midnight, not the UTC one', () => {
    // 00:30 IST on 7 Nov is still 6 Nov in UTC: payday is today in IST.
    expect(daysToNextPaydayIST(7, ist(2026, 11, 7, 0, 30))).toBe(30);
  });

  it('rolls over the year', () => {
    expect(daysToNextPaydayIST(1, ist(2026, 12, 15))).toBe(17);
  });
});

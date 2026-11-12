jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined, CronExpression: {} }));
jest.mock('pdf.js-extract', () => ({
  PDFExtract: class {
    extract = jest.fn();
  },
}));

jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

import { savingStreakMonths } from './sync.service';

const save = (at: string) => ({ type: 'save', amount: 100, at });

describe('savingStreakMonths', () => {
  it('counts months in a row, not the number of savings', () => {
    const entries = [save('2026-11-02'), save('2026-11-09'), save('2026-11-10'), save('2026-10-15'), save('2026-09-01')];
    expect(savingStreakMonths(entries, '2026-11-10')).toBe(3);
  });

  it('keeps the streak while this month has no saving yet, and ends it after a missed month', () => {
    expect(savingStreakMonths([save('2026-10-15'), save('2026-09-01')], '2026-11-10')).toBe(2);
    expect(savingStreakMonths([save('2026-09-01'), save('2026-08-01')], '2026-11-10')).toBe(0);
  });

  it('crosses a year end and ignores withdrawals and opening balances', () => {
    const entries = [save('2027-01-05'), save('2026-12-20'), { type: 'withdraw', amount: 50, at: '2026-11-01' }, { type: 'opening', amount: 500, at: '2026-11-01' }];
    expect(savingStreakMonths(entries, '2027-01-06')).toBe(2);
    expect(savingStreakMonths([], '2027-01-06')).toBe(0);
  });
});

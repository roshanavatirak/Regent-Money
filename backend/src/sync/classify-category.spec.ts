jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined, CronExpression: {} }));
jest.mock('pdf.js-extract', () => ({
  PDFExtract: class {
    extractBuffer() {}
  },
}));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {},
}));

import { SyncService } from './sync.service';

/** Runs the merchant-name rules alone (no saved user rules). */
const classify = (merchant: string): Promise<string> =>
  (SyncService.prototype as any).classifyCategory.call({}, merchant, undefined, []);

describe('classifyCategory: new tags', () => {
  it.each([
    ['NETFLIX.COM', 'subscriptions'],
    ['Spotify India', 'subscriptions'],
    ['Disney Hotstar', 'subscriptions'],
    ['YouTube Premium', 'subscriptions'],
    ['PVR Cinemas', 'entertainment'],
    ['BookMyShow', 'entertainment'],
    ['HDFC Credit Card Bill', 'card_bill'],
    ['CC BILL PAYMENT', 'card_bill'],
    ['Income Tax Department', 'tax'],
    ['TIN NSDL', 'tax'],
    ['Property tax BBMP', 'tax'],
    ['ATM CASH WDL', 'cash_withdrawals'],
    ['Bajaj Finserv EMI', 'emi_loans'],
    ['cult.fit', 'fitness'],
  ])('%s -> %s', async (merchant, expected) => {
    expect(await classify(merchant)).toBe(expected);
  });

  it('does not treat CRED on its own as a card bill (it is used for rent and more)', async () => {
    expect(await classify('CRED')).not.toBe('card_bill');
  });

  it('tags a payment to a person as Sent, and still falls back to miscellaneous', async () => {
    expect(await classify('Ramesh Kumar')).toBe('money_transfer');
    expect(await classify('XYZ123 Corp')).toBe('miscellaneous');
  });

  it('never looks up the database when the rules were passed in, even an empty list', async () => {
    const repo = { findOne: jest.fn(), find: jest.fn() };
    const tag = await (SyncService.prototype as any).classifyCategory.call(
      { userMerchantTagRepository: repo },
      'Swiggy',
      'user-1',
      [],
    );
    expect(tag).toBe('food');
    expect(repo.findOne).not.toHaveBeenCalled();
    expect(repo.find).not.toHaveBeenCalled();
  });
});

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OcrSyncDto } from './ocr-sync.dto';

const errorsFor = async (payload: object) =>
  validate(plainToInstance(OcrSyncDto, payload), { whitelist: true, forbidNonWhitelisted: true });

describe('OcrSyncDto', () => {
  it('accepts the SMS inbox-scan transaction shape, including availableBalance and contentId', async () => {
    const errors = await errorsFor({
      bankProfileId: 'b1',
      updatedBalance: 1200,
      transactions: [
        {
          amount: 500,
          type: 'debit',
          merchant: 'Swiggy',
          category: 'food',
          date: '2026-11-02',
          timestamp: 1762070400000,
          availableBalance: 1200,
          referenceId: '432112345678',
          smsId: 'ref_432112345678',
          contentId: 'sms_1242674780',
        },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects a malformed contentId', async () => {
    const errors = await errorsFor({
      transactions: [{ amount: 1, type: 'debit', merchant: 'x', date: '2026-11-02', contentId: 'ref_abc' }],
    });
    expect(errors).not.toHaveLength(0);
  });
});

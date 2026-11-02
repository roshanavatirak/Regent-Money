import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DirectSmsDto } from './direct-sms.dto';

const errorsFor = async (payload: object) =>
  validate(plainToInstance(DirectSmsDto, payload), { whitelist: true, forbidNonWhitelisted: true });

describe('DirectSmsDto', () => {
  it('accepts the phone-parsed payload without any message text', async () => {
    const errors = await errorsFor({
      sender: 'AX-HDFCBK',
      timestamp: 1762070400000,
      smsId: 'ref_432112345678',
      parsed: {
        amount: 500,
        type: 'debit',
        merchant: 'Swiggy',
        accountSuffix: '1234',
        bankName: 'HDFC',
        isSalary: false,
        availableBalance: 1200.5,
        referenceId: '432112345678',
      },
    });
    expect(errors).toHaveLength(0);
  });

  it('still accepts the legacy text payload from older app versions', async () => {
    expect(await errorsFor({ sender: 'AX-HDFCBK', body: 'Rs 500 debited', timestamp: 1 })).toHaveLength(0);
  });

  it('rejects malformed parsed fields and smsIds', async () => {
    expect(
      await errorsFor({
        sender: 'AX-HDFCBK',
        smsId: 'anything goes',
        parsed: { amount: -5, type: 'refund', merchant: 'x', accountSuffix: '1', bankName: 'b', isSalary: false },
      }),
    ).not.toHaveLength(0);
  });
});

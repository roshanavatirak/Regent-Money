import { KmsService } from './kms.service';

const ARN = 'arn:aws:kms:ap-south-1:000000000000:key/regent-default';
const USER = '11111111-1111-4111-8111-111111111111';
const SECRET = 'a-long-random-test-secret-that-is-over-32-chars';

const withEnv = (value: string | undefined, fn: () => void | Promise<void>) => async () => {
  const before = process.env.FIELD_MASTER_KEY;
  if (value === undefined) delete process.env.FIELD_MASTER_KEY;
  else process.env.FIELD_MASTER_KEY = value;
  try {
    await fn();
  } finally {
    if (before === undefined) delete process.env.FIELD_MASTER_KEY;
    else process.env.FIELD_MASTER_KEY = before;
  }
};

describe('KmsService with FIELD_MASTER_KEY', () => {
  it(
    'wraps new user keys with the secret and reads them back',
    withEnv(SECRET, async () => {
      const kms = new KmsService();
      const { plaintextDek, wrappedDek } = await kms.generateDataKey(USER, ARN);
      expect(wrappedDek.subarray(0, 4).toString('ascii')).toBe('RMK2');
      expect(kms.needsRewrap(wrappedDek)).toBe(false);
      expect((await kms.unwrapDek(USER, wrappedDek, ARN)).equals(plaintextDek)).toBe(true);
    }),
  );

  it('still reads keys wrapped the old way, and upgrades them without changing the key', async () => {
    let legacyWrapped!: Buffer;
    let dek!: Buffer;
    await withEnv(undefined, async () => {
      const old = new KmsService();
      const made = await old.generateDataKey(USER, ARN);
      legacyWrapped = made.wrappedDek;
      dek = made.plaintextDek;
      expect(old.needsRewrap(legacyWrapped)).toBe(false); // no secret: nothing to upgrade to
    })();

    await withEnv(SECRET, async () => {
      const kms = new KmsService();
      expect(kms.needsRewrap(legacyWrapped)).toBe(true);
      const unwrapped = await kms.unwrapDek(USER, legacyWrapped, ARN);
      expect(unwrapped.equals(dek)).toBe(true);

      const rewrapped = kms.rewrapDek(USER, unwrapped);
      expect(kms.needsRewrap(rewrapped)).toBe(false);
      expect((await kms.unwrapDek(USER, rewrapped, ARN)).equals(dek)).toBe(true);
    })();
  });

  it(
    'cannot be read with a different secret, by another user, or from the source code alone',
    withEnv(SECRET, async () => {
      const { wrappedDek } = await new KmsService().generateDataKey(USER, ARN);
      await expect(new KmsService().unwrapDek('22222222-2222-4222-8222-222222222222', wrappedDek, ARN)).rejects.toThrow();

      process.env.FIELD_MASTER_KEY = 'another-secret-that-is-also-longer-than-32-chars';
      await expect(new KmsService().unwrapDek(USER, wrappedDek, ARN)).rejects.toThrow();

      delete process.env.FIELD_MASTER_KEY;
      await expect(new KmsService().unwrapDek(USER, wrappedDek, ARN)).rejects.toThrow(/FIELD_MASTER_KEY/);
    }),
  );

  it(
    'refuses a short secret',
    withEnv('too-short', () => {
      expect(() => new KmsService()).toThrow(/at least 32/);
    }),
  );
});

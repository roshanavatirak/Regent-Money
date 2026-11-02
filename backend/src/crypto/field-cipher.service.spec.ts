import { FieldCipherService, DecryptionTamperingException } from './field-cipher.service';
import { KmsService } from './kms.service';
import { UserKey } from './entities/user-key.entity';
import { Transaction } from '../sync/entities/transaction.entity';
import { IncomeRecord } from '../sync/entities/income-record.entity';

describe('FieldCipherService (Repository Level Integration)', () => {
  let service: FieldCipherService;
  let mockUserKeyRepo: any;
  let kmsService: KmsService;
  let mockDataSource: any;
  let dbTransactions: any[];
  let dbIncome: any[];

  const testUserId = '018f3a2b-c852-789a-bcde-0123456789ab';
  const savedKeys: UserKey[] = [];

  beforeEach(() => {
    savedKeys.length = 0;
    dbTransactions = [];
    dbIncome = [];

    mockUserKeyRepo = {
      findOne: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          savedKeys.find(
            (k) =>
              k.userId === where.userId &&
              (where.keyVersion == null || k.keyVersion === where.keyVersion) &&
              (where.status == null || k.status === where.status),
          ) || null,
        );
      }),
      find: jest.fn().mockImplementation(({ where }) => {
        return Promise.resolve(
          savedKeys.filter(
            (k) =>
              k.userId === where.userId &&
              (where.keyVersion == null || k.keyVersion === where.keyVersion) &&
              (where.status == null || k.status === where.status),
          ),
        );
      }),
      create: jest.fn().mockImplementation((dto) => ({ ...dto, createdAt: new Date() })),
      save: jest.fn().mockImplementation((key) => {
        const existingIdx = savedKeys.findIndex(
          (k) => k.userId === key.userId && k.keyVersion === key.keyVersion,
        );
        if (existingIdx >= 0) {
          savedKeys[existingIdx] = key;
        } else {
          savedKeys.push(key);
        }
        return Promise.resolve(key);
      }),
    };

    mockDataSource = {
      query: jest.fn().mockImplementation((sql: string, params: any[] = []) => {
        const clean = sql.replace(/\s+/g, ' ').trim();
        if (clean.includes('SELECT id, user_id, amount, merchant, note, row_version FROM finance.transactions WHERE enc_amount IS NULL')) {
          const limit = params[0] || 500;
          return Promise.resolve(dbTransactions.filter((r) => r.enc_amount == null).slice(0, limit));
        }
        if (clean.includes('UPDATE finance.transactions SET enc_amount = $2')) {
          const [id, encAmount, encMerchant, encNote, merchantIdx, rowVersion, expectedVer] = params;
          const row = dbTransactions.find((r) => r.id === id && String(r.row_version) === String(expectedVer));
          if (row) {
            row.enc_amount = encAmount;
            row.enc_merchant = encMerchant;
            row.enc_note = encNote;
            row.merchant_idx = merchantIdx;
            row.row_version = BigInt(rowVersion);
            return Promise.resolve([{ '?column?': 1 }]);
          }
          return Promise.resolve([]);
        }
        if (clean.includes('SELECT id, amount, merchant, note, enc_amount, enc_merchant, enc_note, row_version FROM finance.transactions WHERE user_id = $1')) {
          return Promise.resolve(dbTransactions.filter((r) => r.user_id === params[0] && r.enc_amount != null));
        }
        if (clean.includes('get_byte(enc_amount, 4)')) {
          const [userId, targetVer] = params;
          const foundTx = dbTransactions.some(
            (r) => r.user_id === userId && r.enc_amount && r.enc_amount.readUInt32BE(4) === targetVer,
          );
          return Promise.resolve(foundTx ? [{ '?column?': 1 }] : []);
        }
        return Promise.resolve([]);
      }),
    };

    kmsService = new KmsService();
    service = new FieldCipherService(mockUserKeyRepo, kmsService, mockDataSource);
  });

  afterEach(() => {
    service.zeroizeCache();
  });

  it('provisions a new active UserKey on first access', async () => {
    const session = await service.getActiveKey(testUserId);
    expect(session.userId).toBe(testUserId);
    expect(session.keyVersion).toBe(1);
    expect(session.dek.length).toBe(32);
    expect(session.kEnc.length).toBe(32);
    expect(session.kIdx.length).toBe(32);

    expect(mockUserKeyRepo.save).toHaveBeenCalledTimes(1);
    expect(savedKeys.length).toBe(1);
    expect(savedKeys[0].status).toBe('active');
  });

  it('caches the active session in memory and reuses it on subsequent calls', async () => {
    const session1 = await service.getActiveKey(testUserId);
    const session2 = await service.getActiveKey(testUserId);

    expect(session1.dek).toBe(session2.dek);
    expect(mockUserKeyRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it('enforces 1,000-use cap: evicts key session from cache once max uses reached', async () => {
    const session1 = await service.getActiveKey(testUserId);
    expect(session1.useCount).toBe(1);

    // Simulate 999 additional uses
    session1.useCount = 1000;

    // Next access should evict and re-fetch from repo
    const session2 = await service.getActiveKey(testUserId);
    expect(mockUserKeyRepo.findOne).toHaveBeenCalledTimes(2);
    expect(session2.useCount).toBe(1);
  });

  it('encrypts and decrypts transaction fields using exact decimal arithmetic without float drift', async () => {
    const rowId = 'tx_manual_1730000000_abc123';
    // Amount 0.29 rupees: standard float 0.29 * 100 produces 28.999999999999996
    const fields = await service.encryptTransactionFields(
      testUserId,
      rowId,
      { amount: 0.29, merchant: 'Swiggy', note: 'Dinner' },
    );

    expect(fields.rowVersion).toBe(1n);
    expect(fields.encAmount.length).toBe(44);

    const tx = new Transaction();
    tx.id = rowId;
    tx.userId = testUserId;
    tx.amount = 0.29;
    tx.merchant = 'Swiggy';
    tx.encAmount = fields.encAmount;
    tx.encMerchant = fields.encMerchant;
    tx.encNote = fields.encNote;
    tx.merchantIdx = fields.merchantIdx;
    tx.rowVersion = fields.rowVersion;

    const decrypted = await service.decryptTransactionFields(testUserId, tx);
    expect(decrypted.paise).toBe(29n); // Exact 29 paise!
    expect(decrypted.amount).toBe(0.29);
    expect(decrypted.merchant).toBe('Swiggy');
    expect(decrypted.note).toBe('Dinner');
  });

  it('fails fast on tampering during dual-run: NEVER silently falls back to plaintext if enc_amount is present', async () => {
    const rowId = 'tx_tamper_detect_1';
    const fields = await service.encryptTransactionFields(
      testUserId,
      rowId,
      { amount: 100, merchant: 'Cafe Coffee Day' },
    );

    const tx = new Transaction();
    tx.id = rowId;
    tx.userId = testUserId;
    tx.amount = 100;
    tx.merchant = 'Cafe Coffee Day';
    tx.encAmount = Buffer.from(fields.encAmount);
    tx.encMerchant = fields.encMerchant;
    tx.rowVersion = fields.rowVersion;

    // 1. Valid dual-run read succeeds
    const validRead = await service.readTransactionDualRun(testUserId, tx);
    expect(validRead.verified).toBe(true);
    expect(validRead.amount).toBe(100);

    // 2. Corrupt ciphertext: MUST throw DecryptionTamperingException immediately
    tx.encAmount[25] ^= 0x01; // flip bit in ciphertext
    await expect(service.readTransactionDualRun(testUserId, tx)).rejects.toThrow(
      DecryptionTamperingException,
    );

    // 3. NULL enc_amount (legacy row pre-backfill): gracefully falls back to plaintext
    const legacyTx = new Transaction();
    legacyTx.id = 'legacy_row';
    legacyTx.amount = 500;
    legacyTx.merchant = 'Chai Point';
    legacyTx.encAmount = null;

    const legacyRead = await service.readTransactionDualRun(testUserId, legacyTx);
    expect(legacyRead.verified).toBe(false);
    expect(legacyRead.amount).toBe(500);
    expect(legacyRead.merchant).toBe('Chai Point');
  });

  it('enforces the row_version bump invariant: re-encrypts all fields under row_version + 1', async () => {
    const rowId = 'tx_row_concurrency_test';

    const insertFields = await service.encryptTransactionFields(
      testUserId,
      rowId,
      { amount: 500, merchant: 'Uber' },
    );
    expect(insertFields.rowVersion).toBe(1n);

    const tx = new Transaction();
    tx.id = rowId;
    tx.userId = testUserId;
    tx.amount = 500;
    tx.merchant = 'Uber';
    tx.encAmount = insertFields.encAmount;
    tx.encMerchant = insertFields.encMerchant;
    tx.rowVersion = insertFields.rowVersion;

    // Update with row_version bump
    const updateFields = await service.encryptTransactionFields(
      testUserId,
      rowId,
      { amount: 550, merchant: 'Uber Auto' },
      tx.rowVersion,
    );
    expect(updateFields.rowVersion).toBe(2n);

    // If row_version changed to 2n but ciphertext wasn't updated, decryption fails
    tx.rowVersion = 2n;
    await expect(service.decryptTransactionFields(testUserId, tx)).rejects.toThrow();

    // With updated ciphertexts, decryption succeeds
    tx.amount = 550;
    tx.merchant = 'Uber Auto';
    tx.encAmount = updateFields.encAmount;
    tx.encMerchant = updateFields.encMerchant;

    const decrypted = await service.decryptTransactionFields(testUserId, tx);
    expect(decrypted.amount).toBe(550);
    expect(decrypted.merchant).toBe('Uber Auto');
  });

  it('computes blind index for merchant search queries', async () => {
    const idx1 = await service.computeMerchantBlindIndex(testUserId, '  SWIGGY  ');
    const idx2 = await service.computeMerchantBlindIndex(testUserId, 'swiggy');
    expect(idx1.equals(idx2)).toBe(true);
  });

  it('encrypts, decrypts, and dual-run reads income records', async () => {
    const rowId = 'inc_salary_001';
    const fields = await service.encryptIncomeFields(
      testUserId,
      rowId,
      { amount: 150000.5, source: 'Acme Corp', note: 'Monthly Salary' },
    );

    expect(fields.rowVersion).toBe(1n);

    const inc = new IncomeRecord();
    inc.id = rowId;
    inc.userId = testUserId;
    inc.amount = 150000.5;
    inc.source = 'Acme Corp';
    inc.encAmount = fields.encAmount;
    inc.encSource = fields.encSource;
    inc.encNote = fields.encNote;
    inc.sourceIdx = fields.sourceIdx;
    inc.rowVersion = fields.rowVersion;

    const read = await service.readIncomeDualRun(testUserId, inc);
    expect(read.verified).toBe(true);
    expect(read.amount).toBe(150000.5);
    expect(read.source).toBe('Acme Corp');
    expect(read.note).toBe('Monthly Salary');

    const sIdx1 = await service.computeSourceBlindIndex(testUserId, '  ACME CORP  ');
    const sIdx2 = await service.computeSourceBlindIndex(testUserId, 'acme corp');
    expect(sIdx1.equals(sIdx2)).toBe(true);
  });

  it('rotates user key to next version, retiring active key', async () => {
    const v1 = await service.getActiveKey(testUserId);
    expect(v1.keyVersion).toBe(1);

    const v2 = await service.rotateUserKey(testUserId);
    expect(v2.keyVersion).toBe(2);
    expect(v2.userId).toBe(testUserId);

    // V1 must now be marked decrypt_only in repo
    const key1 = savedKeys.find((k) => k.keyVersion === 1);
    expect(key1?.status).toBe('decrypt_only');

    // V2 must be active
    const key2 = savedKeys.find((k) => k.keyVersion === 2);
    expect(key2?.status).toBe('active');

    // Next getActiveKey returns v2
    const active = await service.getActiveKey(testUserId);
    expect(active.keyVersion).toBe(2);
  });

  it('backfills legacy unencrypted transactions in batches', async () => {
    dbTransactions.push({
      id: 'tx_legacy_001',
      user_id: testUserId,
      amount: 450,
      merchant: 'Zomato',
      note: 'Lunch',
      row_version: 1n,
      enc_amount: null,
    });

    const updated = await service.backfillTransactionsBatch(10);
    expect(updated).toBe(1);

    const row = dbTransactions[0];
    expect(row.enc_amount).not.toBeNull();
    expect(row.enc_merchant).not.toBeNull();
    expect(row.row_version).toBe(2n); // bumped by 1
  });

  it('sweeps older key versions during rotation', async () => {
    // 1. Create a transaction under key version 1
    const v1Fields = await service.encryptTransactionFields(
      testUserId,
      'tx_rotate_001',
      { amount: 999, merchant: 'Flipkart' },
    );
    expect(v1Fields.encAmount.readUInt32BE(4)).toBe(1);

    dbTransactions.push({
      id: 'tx_rotate_001',
      user_id: testUserId,
      amount: 999,
      merchant: 'Flipkart',
      note: null,
      enc_amount: v1Fields.encAmount,
      enc_merchant: v1Fields.encMerchant,
      enc_note: null,
      row_version: 1n,
    });

    // 2. Rotate to version 2
    await service.rotateUserKey(testUserId);

    // 3. Run sweeper
    const sweepResult = await service.sweepUserKeyRotation(testUserId);
    expect(sweepResult.sweptTransactions).toBe(1);

    // Row must now have key_version 2 in envelope and row_version = 2
    const sweptRow = dbTransactions[0];
    expect(sweptRow.enc_amount.readUInt32BE(4)).toBe(2);
    expect(sweptRow.row_version).toBe(2n);

    // 4. Verify old key version 1 was crypto-shredded (status = destroyed and edek zeroized)
    const key1 = savedKeys.find((k) => k.keyVersion === 1);
    expect(key1?.status).toBe('destroyed');
    expect(key1?.edek.every((byte: number) => byte === 0)).toBe(true);

    // Attempting to get key session for destroyed key throws
    await expect(service.getKeySession(testUserId, 1)).rejects.toThrow(/destroyed/);
  });
});

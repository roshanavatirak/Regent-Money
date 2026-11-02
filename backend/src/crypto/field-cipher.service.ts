import { Injectable, Logger, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { UserKey } from './entities/user-key.entity';
import { KmsService } from './kms.service';
import {
  deriveSubkey,
  encryptField,
  decryptField,
  encodeAmount,
  decodeAmount,
  padText,
  unpadText,
  blindIndex,
  decimalToPaise,
  paiseToRupees,
  FieldContext,
  AAD_TABLE,
  AAD_COLUMN,
  MERCHANT_BLOCK,
  MERCHANT_MAX,
  NOTE_BLOCK,
  NOTE_MAX,
} from './field-cipher';
import { Transaction } from '../sync/entities/transaction.entity';
import { IncomeRecord } from '../sync/entities/income-record.entity';

export interface UserKeySession {
  userId: string;
  keyVersion: number;
  dek: Buffer;
  kEnc: Buffer;
  kIdx: Buffer;
  cachedAt: number;
  useCount: number;
}

export class DecryptionTamperingException extends Error {
  constructor(public readonly rowId: string, public readonly table: string, cause?: unknown) {
    super(`Tampering or integrity failure detected on row ${rowId} in ${table}`);
    this.name = 'DecryptionTamperingException';
    this.cause = cause;
  }
}

@Injectable()
export class FieldCipherService implements OnModuleDestroy {
  private readonly logger = new Logger(FieldCipherService.name);
  private readonly defaultKmsArn = process.env.AWS_KMS_KEY_ARN || 'arn:aws:kms:ap-south-1:000000000000:key/regent-default';
  private readonly keyCache = new Map<string, UserKeySession>();
  private readonly activeVersionCache = new Map<string, number>();

  private readonly cacheTtlMs = 5 * 60 * 1000; // 5-minute TTL
  private readonly maxKeyUses = 1000;           // 1,000-use cap per Section 5.3

  constructor(
    @InjectRepository(UserKey)
    private readonly userKeyRepo: Repository<UserKey>,
    private readonly kmsService: KmsService,
    @Optional()
    @Inject(DataSource)
    private readonly dataSource?: DataSource,
  ) {}

  onModuleDestroy() {
    this.zeroizeCache();
  }

  /**
   * Zeroizes in-memory DEK and subkey buffers on shutdown or wipe.
   */
  public zeroizeCache() {
    for (const session of this.keyCache.values()) {
      this.zeroizeSession(session);
    }
    this.keyCache.clear();
    this.activeVersionCache.clear();
  }

  private zeroizeSession(session: UserKeySession) {
    session.dek.fill(0);
    session.kEnc.fill(0);
    session.kIdx.fill(0);
  }

  /**
   * Evicts a single user's cached keys, zeroizing buffer memory.
   */
  public evictUser(userId: string) {
    this.activeVersionCache.delete(userId);
    for (const [cacheKey, session] of this.keyCache.entries()) {
      if (session.userId === userId) {
        this.zeroizeSession(session);
        this.keyCache.delete(cacheKey);
      }
    }
  }

  /**
   * Retrieves or provisions the active key for a user.
   */
  async getActiveKey(userId: string): Promise<UserKeySession> {
    const activeVersion = this.activeVersionCache.get(userId);
    if (activeVersion != null) {
      const cached = this.keyCache.get(`${userId}:${activeVersion}`);
      if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs && cached.useCount < this.maxKeyUses) {
        cached.useCount++;
        return cached;
      }
    }

    const existing = await this.userKeyRepo.findOne({
      where: { userId, status: 'active' },
      order: { keyVersion: 'DESC' },
    });

    if (existing) {
      this.activeVersionCache.set(userId, existing.keyVersion);
      return this.getKeySession(userId, existing.keyVersion, existing);
    }

    // Provision new active key (key_version = 1)
    const { plaintextDek, wrappedDek } = await this.kmsService.generateDataKey(userId, this.defaultKmsArn);
    const newKey = this.userKeyRepo.create({
      userId,
      keyVersion: 1,
      status: 'active',
      edek: wrappedDek,
      kmsKeyArn: this.defaultKmsArn,
    });

    await this.userKeyRepo.save(newKey);
    this.activeVersionCache.set(userId, 1);

    const session: UserKeySession = {
      userId,
      keyVersion: 1,
      dek: plaintextDek,
      kEnc: deriveSubkey(plaintextDek, userId, 'enc'),
      kIdx: deriveSubkey(plaintextDek, userId, 'idx'),
      cachedAt: Date.now(),
      useCount: 1,
    };

    this.keyCache.set(`${userId}:1`, session);
    return session;
  }

  /**
   * Retrieves a specific key version for a user, using in-memory cache or KMS unwrap.
   */
  async getKeySession(userId: string, keyVersion: number, existingRecord?: UserKey): Promise<UserKeySession> {
    const cacheKey = `${userId}:${keyVersion}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.cacheTtlMs && cached.useCount < this.maxKeyUses) {
      cached.useCount++;
      return cached;
    }

    if (cached) {
      // Evict expired / max-use session
      this.zeroizeSession(cached);
      this.keyCache.delete(cacheKey);
    }

    const keyRecord = existingRecord ?? await this.userKeyRepo.findOne({
      where: { userId, keyVersion },
    });

    if (!keyRecord) {
      throw new Error(`Key version ${keyVersion} not found for user ${userId}`);
    }

    if (keyRecord.status === 'destroyed') {
      throw new Error(`Key version ${keyVersion} for user ${userId} has been destroyed (crypto-shredded)`);
    }

    const plaintextDek = await this.kmsService.unwrapDek(userId, keyRecord.edek, keyRecord.kmsKeyArn);
    const session: UserKeySession = {
      userId,
      keyVersion,
      dek: plaintextDek,
      kEnc: deriveSubkey(plaintextDek, userId, 'enc'),
      kIdx: deriveSubkey(plaintextDek, userId, 'idx'),
      cachedAt: Date.now(),
      useCount: 1,
    };

    this.keyCache.set(cacheKey, session);
    return session;
  }

  /**
   * Encrypts all fields for a Transaction entity.
   * If expectedRowVersion is provided, increments row_version by 1; otherwise defaults to 1.
   * Invariant: ALL encrypted fields are encrypted under the new row_version in the same call.
   */
  async encryptTransactionFields(
    userId: string,
    rowId: string,
    data: { amount: number | string; merchant?: string | null; note?: string | null },
    expectedRowVersion?: bigint,
  ): Promise<{
    encAmount: Buffer;
    encMerchant: Buffer | null;
    encNote: Buffer | null;
    merchantIdx: Buffer | null;
    rowVersion: bigint;
  }> {
    const session = await this.getActiveKey(userId);
    const targetRowVersion = expectedRowVersion != null ? expectedRowVersion + 1n : 1n;

    // 1. Amount: convert with exact decimal arithmetic to paise
    const paise = decimalToPaise(data.amount);
    const amountCtx: FieldContext = {
      userId,
      table: AAD_TABLE.transactions,
      column: AAD_COLUMN.amount,
      rowId,
      rowVersion: targetRowVersion,
    };
    const encAmount = encryptField(session.kEnc, session.keyVersion, encodeAmount(paise), amountCtx);

    // 2. Merchant (padded 32B) + blind index
    let encMerchant: Buffer | null = null;
    let merchantIdx: Buffer | null = null;
    if (data.merchant != null && data.merchant.length > 0) {
      const merchantCtx: FieldContext = {
        userId,
        table: AAD_TABLE.transactions,
        column: AAD_COLUMN.merchant,
        rowId,
        rowVersion: targetRowVersion,
      };
      encMerchant = encryptField(session.kEnc, session.keyVersion, padText(data.merchant, MERCHANT_BLOCK, MERCHANT_MAX), merchantCtx);
      merchantIdx = blindIndex(session.kIdx, data.merchant);
    }

    // 3. Note (padded 64B)
    let encNote: Buffer | null = null;
    if (data.note != null && data.note.length > 0) {
      const noteCtx: FieldContext = {
        userId,
        table: AAD_TABLE.transactions,
        column: AAD_COLUMN.note,
        rowId,
        rowVersion: targetRowVersion,
      };
      encNote = encryptField(session.kEnc, session.keyVersion, padText(data.note, NOTE_BLOCK, NOTE_MAX), noteCtx);
    }

    return {
      encAmount,
      encMerchant,
      encNote,
      merchantIdx,
      rowVersion: targetRowVersion,
    };
  }

  /**
   * Encrypts all fields for an IncomeRecord entity.
   */
  async encryptIncomeFields(
    userId: string,
    rowId: string,
    data: { amount: number | string; source?: string | null; note?: string | null },
    expectedRowVersion?: bigint,
  ): Promise<{
    encAmount: Buffer;
    encSource: Buffer | null;
    encNote: Buffer | null;
    sourceIdx: Buffer | null;
    rowVersion: bigint;
  }> {
    const session = await this.getActiveKey(userId);
    const targetRowVersion = expectedRowVersion != null ? expectedRowVersion + 1n : 1n;

    // 1. Amount: convert with exact decimal arithmetic to paise
    const paise = decimalToPaise(data.amount);
    const amountCtx: FieldContext = {
      userId,
      table: AAD_TABLE.incomeRecords,
      column: AAD_COLUMN.amount,
      rowId,
      rowVersion: targetRowVersion,
    };
    const encAmount = encryptField(session.kEnc, session.keyVersion, encodeAmount(paise), amountCtx);

    // 2. Source (padded 32B) + blind index
    let encSource: Buffer | null = null;
    let sourceIdx: Buffer | null = null;
    if (data.source != null && data.source.length > 0) {
      const sourceCtx: FieldContext = {
        userId,
        table: AAD_TABLE.incomeRecords,
        column: AAD_COLUMN.source,
        rowId,
        rowVersion: targetRowVersion,
      };
      encSource = encryptField(session.kEnc, session.keyVersion, padText(data.source, MERCHANT_BLOCK, MERCHANT_MAX), sourceCtx);
      sourceIdx = blindIndex(session.kIdx, data.source);
    }

    // 3. Note (padded 64B)
    let encNote: Buffer | null = null;
    if (data.note != null && data.note.length > 0) {
      const noteCtx: FieldContext = {
        userId,
        table: AAD_TABLE.incomeRecords,
        column: AAD_COLUMN.note,
        rowId,
        rowVersion: targetRowVersion,
      };
      encNote = encryptField(session.kEnc, session.keyVersion, padText(data.note, NOTE_BLOCK, NOTE_MAX), noteCtx);
    }

    return {
      encAmount,
      encSource,
      encNote,
      sourceIdx,
      rowVersion: targetRowVersion,
    };
  }

  /**
   * Decrypts a Transaction's encrypted fields using the envelope's key version and row_version AAD.
   * Throws DecryptionTamperingException immediately if decryption fails (never swallows).
   */
  async decryptTransactionFields(
    userId: string,
    tx: Transaction,
  ): Promise<{ amount: number; paise: bigint; merchant: string | null; note: string | null }> {
    if (!tx.encAmount) {
      throw new Error(`Transaction ${tx.id} has no enc_amount envelope`);
    }

    try {
      // 1. Amount
      const amountCtx: FieldContext = {
        userId,
        table: AAD_TABLE.transactions,
        column: AAD_COLUMN.amount,
        rowId: tx.id,
        rowVersion: tx.rowVersion,
      };
      const session = await this.getKeySession(userId, tx.encAmount.readUInt32BE(4));
      const ptAmount = decryptField(() => session.kEnc, tx.encAmount, amountCtx);
      const paise = decodeAmount(ptAmount);
      const amount = paiseToRupees(paise);

      // 2. Merchant
      let merchant: string | null = null;
      if (tx.encMerchant) {
        const merchantCtx: FieldContext = {
          userId,
          table: AAD_TABLE.transactions,
          column: AAD_COLUMN.merchant,
          rowId: tx.id,
          rowVersion: tx.rowVersion,
        };
        const merchantSession = await this.getKeySession(userId, tx.encMerchant.readUInt32BE(4));
        const ptMerchant = decryptField(() => merchantSession.kEnc, tx.encMerchant, merchantCtx);
        merchant = unpadText(ptMerchant);
      }

      // 3. Note
      let note: string | null = null;
      if (tx.encNote) {
        const noteCtx: FieldContext = {
          userId,
          table: AAD_TABLE.transactions,
          column: AAD_COLUMN.note,
          rowId: tx.id,
          rowVersion: tx.rowVersion,
        };
        const noteSession = await this.getKeySession(userId, tx.encNote.readUInt32BE(4));
        const ptNote = decryptField(() => noteSession.kEnc, tx.encNote, noteCtx);
        note = unpadText(ptNote);
      }

      return { amount, paise, merchant, note };
    } catch (err) {
      this.logger.error(`Tampering alert: Failed to decrypt transaction row ${tx.id}`, err);
      throw new DecryptionTamperingException(tx.id, AAD_TABLE.transactions, err);
    }
  }

  /**
   * Verify-on-read dual-run helper:
   * 1. Falls back to plaintext ONLY when enc_amount is null/undefined (legacy row pre-backfill).
   * 2. If enc_amount IS present, decrypts it. If decryption fails, throws DecryptionTamperingException.
   * 3. Verifies exact integer paise equality between plaintext and ciphertext (0 tolerance).
   * 4. Verifies merchant and note equality.
   * 5. Logs any discrepancy with row IDs only (never secret financial values).
   */
  async readTransactionDualRun(
    userId: string,
    tx: Transaction,
  ): Promise<{ amount: number; merchant: string | null; note: string | null; verified: boolean }> {
    // 1. Fall back to plaintext ONLY when the encrypted column is NULL
    if (tx.encAmount == null) {
      return {
        amount: tx.amount,
        merchant: tx.merchant,
        note: null,
        verified: false,
      };
    }

    // 2. If enc_amount is present, it MUST decrypt. Failure throws DecryptionTamperingException immediately.
    const decrypted = await this.decryptTransactionFields(userId, tx);

    // 3. Exact integer paise equality check
    const expectedPaise = decimalToPaise(tx.amount);
    if (decrypted.paise !== expectedPaise) {
      this.logger.error(
        `Dual-run amount mismatch for transaction row ${tx.id} (metric: dual_run_amount_mismatch)`,
      );
    }

    // 4. Exact merchant equality check
    const expectedMerchant = tx.merchant ? tx.merchant.trim() : null;
    const actualMerchant = decrypted.merchant ? decrypted.merchant.trim() : null;
    if (expectedMerchant !== actualMerchant) {
      this.logger.error(
        `Dual-run merchant mismatch for transaction row ${tx.id} (metric: dual_run_merchant_mismatch)`,
      );
    }

    return {
      amount: decrypted.amount,
      merchant: decrypted.merchant ?? tx.merchant,
      note: decrypted.note,
      verified: true,
    };
  }

  /**
   * Computes a blind index for merchant search queries using the active user index key.
   */
  async computeMerchantBlindIndex(userId: string, merchant: string): Promise<Buffer> {
    const session = await this.getActiveKey(userId);
    return blindIndex(session.kIdx, merchant);
  }

  /**
   * Decrypts an IncomeRecord's encrypted fields using the envelope's key version and row_version AAD.
   * Throws DecryptionTamperingException immediately if decryption fails (never swallows).
   */
  async decryptIncomeFields(
    userId: string,
    inc: IncomeRecord,
  ): Promise<{ amount: number; paise: bigint; source: string | null; note: string | null }> {
    if (!inc.encAmount) {
      throw new Error(`IncomeRecord ${inc.id} has no enc_amount envelope`);
    }

    try {
      // 1. Amount
      const amountCtx: FieldContext = {
        userId,
        table: AAD_TABLE.incomeRecords,
        column: AAD_COLUMN.amount,
        rowId: inc.id,
        rowVersion: inc.rowVersion,
      };
      const session = await this.getKeySession(userId, inc.encAmount.readUInt32BE(4));
      const ptAmount = decryptField(() => session.kEnc, inc.encAmount, amountCtx);
      const paise = decodeAmount(ptAmount);
      const amount = paiseToRupees(paise);

      // 2. Source
      let source: string | null = null;
      if (inc.encSource) {
        const sourceCtx: FieldContext = {
          userId,
          table: AAD_TABLE.incomeRecords,
          column: AAD_COLUMN.source,
          rowId: inc.id,
          rowVersion: inc.rowVersion,
        };
        const sourceSession = await this.getKeySession(userId, inc.encSource.readUInt32BE(4));
        const ptSource = decryptField(() => sourceSession.kEnc, inc.encSource, sourceCtx);
        source = unpadText(ptSource);
      }

      // 3. Note
      let note: string | null = null;
      if (inc.encNote) {
        const noteCtx: FieldContext = {
          userId,
          table: AAD_TABLE.incomeRecords,
          column: AAD_COLUMN.note,
          rowId: inc.id,
          rowVersion: inc.rowVersion,
        };
        const noteSession = await this.getKeySession(userId, inc.encNote.readUInt32BE(4));
        const ptNote = decryptField(() => noteSession.kEnc, inc.encNote, noteCtx);
        note = unpadText(ptNote);
      }

      return { amount, paise, source, note };
    } catch (err) {
      this.logger.error(`Tampering alert: Failed to decrypt income record row ${inc.id}`, err);
      throw new DecryptionTamperingException(inc.id, AAD_TABLE.incomeRecords, err);
    }
  }

  /**
   * Verify-on-read dual-run helper for IncomeRecord:
   * 1. Falls back to plaintext ONLY when enc_amount is null/undefined (legacy row pre-backfill).
   * 2. If enc_amount IS present, decrypts it. If decryption fails, throws DecryptionTamperingException.
   * 3. Verifies exact integer paise equality between plaintext and ciphertext (0 tolerance).
   * 4. Verifies source and note equality.
   * 5. Logs any discrepancy with row IDs only (never secret financial values).
   */
  async readIncomeDualRun(
    userId: string,
    inc: IncomeRecord,
  ): Promise<{ amount: number; source: string | null; note: string | null; verified: boolean }> {
    // 1. Fall back to plaintext ONLY when the encrypted column is NULL
    if (inc.encAmount == null) {
      return {
        amount: inc.amount,
        source: inc.source,
        note: null,
        verified: false,
      };
    }

    // 2. If enc_amount is present, it MUST decrypt. Failure throws DecryptionTamperingException immediately.
    const decrypted = await this.decryptIncomeFields(userId, inc);

    // 3. Exact integer paise equality check
    const expectedPaise = decimalToPaise(inc.amount);
    if (decrypted.paise !== expectedPaise) {
      this.logger.error(
        `Dual-run amount mismatch for income row ${inc.id} (metric: dual_run_amount_mismatch)`,
      );
    }

    // 4. Exact source equality check
    const expectedSource = inc.source ? inc.source.trim() : null;
    const actualSource = decrypted.source ? decrypted.source.trim() : null;
    if (expectedSource !== actualSource) {
      this.logger.error(
        `Dual-run source mismatch for income row ${inc.id} (metric: dual_run_source_mismatch)`,
      );
    }

    return {
      amount: decrypted.amount,
      source: decrypted.source ?? inc.source,
      note: decrypted.note,
      verified: true,
    };
  }

  /**
   * Computes a blind index for source search queries using the active user index key.
   */
  async computeSourceBlindIndex(userId: string, source: string): Promise<Buffer> {
    const session = await this.getActiveKey(userId);
    return blindIndex(session.kIdx, source);
  }

  /**
   * Backfills a batch of unencrypted transactions where enc_amount IS NULL.
   * Encrypts fields with targetRowVersion = OLD.row_version + 1 (satisfying the DB trigger).
   * Updates WHERE id = $1 AND row_version = $expectedVer AND enc_amount IS NULL.
   * Returns count of successfully updated rows.
   */
  async backfillTransactionsBatch(batchSize = 500): Promise<number> {
    if (!this.dataSource) return 0;
    const rows = await this.dataSource.query(
      `SELECT id, user_id, amount, merchant, note, row_version
       FROM finance.transactions
       WHERE enc_amount IS NULL
       LIMIT $1`,
      [batchSize],
    );

    let updatedCount = 0;
    for (const r of rows) {
      try {
        const expectedVer = BigInt(r.row_version ?? 1);
        const enc = await this.encryptTransactionFields(
          r.user_id,
          r.id,
          { amount: Number(r.amount ?? 0), merchant: r.merchant, note: r.note },
          expectedVer,
        );

        const res = await this.dataSource.query(
          `UPDATE finance.transactions
           SET enc_amount = $2,
               enc_merchant = $3,
               enc_note = $4,
               merchant_idx = $5,
               row_version = $6
           WHERE id = $1 AND row_version = $7 AND enc_amount IS NULL RETURNING 1`,
          [r.id, enc.encAmount, enc.encMerchant, enc.encNote, enc.merchantIdx, enc.rowVersion.toString(), expectedVer.toString()],
        );
        if (Array.isArray(res) && res.length > 0) {
          updatedCount++;
        }
      } catch (err) {
        this.logger.error(`Failed to backfill transaction row ${r.id}`, err);
      }
    }
    return updatedCount;
  }

  /**
   * Backfills a batch of unencrypted income records where enc_amount IS NULL.
   * Encrypts fields with targetRowVersion = OLD.row_version + 1 (satisfying the DB trigger).
   * Updates WHERE id = $1 AND row_version = $expectedVer AND enc_amount IS NULL.
   */
  async backfillIncomeBatch(batchSize = 500): Promise<number> {
    if (!this.dataSource) return 0;
    const rows = await this.dataSource.query(
      `SELECT id, user_id, amount, source, note, row_version
       FROM finance.income_records
       WHERE enc_amount IS NULL
       LIMIT $1`,
      [batchSize],
    );

    let updatedCount = 0;
    for (const r of rows) {
      try {
        const expectedVer = BigInt(r.row_version ?? 1);
        const enc = await this.encryptIncomeFields(
          r.user_id,
          r.id,
          { amount: Number(r.amount ?? 0), source: r.source, note: r.note },
          expectedVer,
        );

        const res = await this.dataSource.query(
          `UPDATE finance.income_records
           SET enc_amount = $2,
               enc_source = $3,
               enc_note = $4,
               source_idx = $5,
               row_version = $6
           WHERE id = $1 AND row_version = $7 AND enc_amount IS NULL RETURNING 1`,
          [r.id, enc.encAmount, enc.encSource, enc.encNote, enc.sourceIdx, enc.rowVersion.toString(), expectedVer.toString()],
        );
        if (Array.isArray(res) && res.length > 0) {
          updatedCount++;
        }
      } catch (err) {
        this.logger.error(`Failed to backfill income row ${r.id}`, err);
      }
    }
    return updatedCount;
  }

  /**
   * Rotates a user's encryption key to the next version:
   * 1. Retires the current active key.
   * 2. Generates a fresh DEK via KMS.
   * 3. Persists key_version = current + 1 with status = 'active'.
   * 4. Updates memory cache.
   */
  async rotateUserKey(userId: string): Promise<UserKeySession> {
    const currentActive = await this.userKeyRepo.findOne({
      where: { userId, status: 'active' },
      order: { keyVersion: 'DESC' },
    });

    const nextVersion = currentActive ? currentActive.keyVersion + 1 : 1;

    if (currentActive) {
      currentActive.status = 'decrypt_only';
      currentActive.rotatedAt = new Date();
      await this.userKeyRepo.save(currentActive);
    }

    const { plaintextDek, wrappedDek } = await this.kmsService.generateDataKey(userId, this.defaultKmsArn);
    const newKey = this.userKeyRepo.create({
      userId,
      keyVersion: nextVersion,
      status: 'active',
      edek: wrappedDek,
      kmsKeyArn: this.defaultKmsArn,
    });
    await this.userKeyRepo.save(newKey);

    // Evict old cache and install new active version
    this.evictUser(userId);
    this.activeVersionCache.set(userId, nextVersion);

    const session: UserKeySession = {
      userId,
      keyVersion: nextVersion,
      dek: plaintextDek,
      kEnc: deriveSubkey(plaintextDek, userId, 'enc'),
      kIdx: deriveSubkey(plaintextDek, userId, 'idx'),
      cachedAt: Date.now(),
      useCount: 1,
    };
    this.keyCache.set(`${userId}:${nextVersion}`, session);
    return session;
  }

  /**
   * Active sweeper for key rotation:
   * Finds transaction rows for a user encrypted under an older key version (< activeVersion),
   * decrypts them under their stamped key version, re-encrypts under activeVersion,
   * and increments row_version.
   */
  async sweepUserKeyRotation(userId: string, batchSize = 100): Promise<{ sweptTransactions: number; sweptIncome: number }> {
    if (!this.dataSource) return { sweptTransactions: 0, sweptIncome: 0 };
    const active = await this.getActiveKey(userId);

    // 1. Transactions
    const txRows = await this.dataSource.query(
      `SELECT id, amount, merchant, note, enc_amount, enc_merchant, enc_note, row_version
       FROM finance.transactions
       WHERE user_id = $1 AND enc_amount IS NOT NULL
       LIMIT $2`,
      [userId, batchSize],
    );

    let sweptTx = 0;
    for (const r of txRows) {
      const encAmount: Buffer = r.enc_amount;
      const keyVer = encAmount.readUInt32BE(4);
      if (keyVer < active.keyVersion) {
        try {
          const expectedVer = BigInt(r.row_version ?? 1);
          const txObj = {
            id: r.id,
            encAmount: r.enc_amount,
            encMerchant: r.enc_merchant,
            encNote: r.enc_note,
            rowVersion: expectedVer,
          } as Transaction;
          const decrypted = await this.decryptTransactionFields(userId, txObj);

          const reEnc = await this.encryptTransactionFields(
            userId,
            r.id,
            { amount: decrypted.amount, merchant: decrypted.merchant, note: decrypted.note },
            expectedVer,
          );

          const res = await this.dataSource.query(
            `UPDATE finance.transactions
             SET enc_amount = $2,
                 enc_merchant = $3,
                 enc_note = $4,
                 merchant_idx = $5,
                 row_version = $6
             WHERE id = $1 AND row_version = $7 RETURNING 1`,
            [r.id, reEnc.encAmount, reEnc.encMerchant, reEnc.encNote, reEnc.merchantIdx, reEnc.rowVersion.toString(), expectedVer.toString()],
          );
          if (Array.isArray(res) && res.length > 0) sweptTx++;
        } catch (err) {
          this.logger.error(`Sweeper failed to re-encrypt transaction ${r.id}`, err);
        }
      }
    }

    // 2. Income records
    const incRows = await this.dataSource.query(
      `SELECT id, amount, source, note, enc_amount, enc_source, enc_note, row_version
       FROM finance.income_records
       WHERE user_id = $1 AND enc_amount IS NOT NULL
       LIMIT $2`,
      [userId, batchSize],
    );

    let sweptInc = 0;
    for (const r of incRows) {
      const encAmount: Buffer = r.enc_amount;
      const keyVer = encAmount.readUInt32BE(4);
      if (keyVer < active.keyVersion) {
        try {
          const expectedVer = BigInt(r.row_version ?? 1);
          const incObj = {
            id: r.id,
            encAmount: r.enc_amount,
            encSource: r.enc_source,
            encNote: r.enc_note,
            rowVersion: expectedVer,
          } as IncomeRecord;
          const decrypted = await this.decryptIncomeFields(userId, incObj);

          const reEnc = await this.encryptIncomeFields(
            userId,
            r.id,
            { amount: decrypted.amount, source: decrypted.source, note: decrypted.note },
            expectedVer,
          );

          const res = await this.dataSource.query(
            `UPDATE finance.income_records
             SET enc_amount = $2,
                 enc_source = $3,
                 enc_note = $4,
                 source_idx = $5,
                 row_version = $6
             WHERE id = $1 AND row_version = $7 RETURNING 1`,
            [r.id, reEnc.encAmount, reEnc.encSource, reEnc.encNote, reEnc.sourceIdx, reEnc.rowVersion.toString(), expectedVer.toString()],
          );
          if (Array.isArray(res) && res.length > 0) sweptInc++;
        } catch (err) {
          this.logger.error(`Sweeper failed to re-encrypt income record ${r.id}`, err);
        }
      }
    }

    // 3. Post-sweep: If no remaining rows exist under decrypt_only keys, crypto-shred them
    try {
      const retiredKeys = await this.userKeyRepo.find({
        where: { userId, status: 'decrypt_only' },
      });

      for (const rk of retiredKeys) {
        if (rk.keyVersion < active.keyVersion) {
          const [anyTx] = await this.dataSource.query(
            `SELECT 1 FROM finance.transactions 
             WHERE user_id = $1 AND enc_amount IS NOT NULL 
               AND get_byte(enc_amount, 4)*16777216 + get_byte(enc_amount, 5)*65536 + get_byte(enc_amount, 6)*256 + get_byte(enc_amount, 7) = $2
             LIMIT 1`,
            [userId, rk.keyVersion],
          );
          const [anyInc] = await this.dataSource.query(
            `SELECT 1 FROM finance.income_records 
             WHERE user_id = $1 AND enc_amount IS NOT NULL 
               AND get_byte(enc_amount, 4)*16777216 + get_byte(enc_amount, 5)*65536 + get_byte(enc_amount, 6)*256 + get_byte(enc_amount, 7) = $2
             LIMIT 1`,
            [userId, rk.keyVersion],
          );

          if (!anyTx && !anyInc) {
            await this.destroyKeyVersion(userId, rk.keyVersion);
          }
        }
      }
    } catch (err) {
      this.logger.warn(`Failed to check/shred retired keys post-sweep for user ${userId}`, err);
    }

    return { sweptTransactions: sweptTx, sweptIncome: sweptInc };
  }

  /**
   * Destroys (crypto-shreds) a key version:
   * Overwrites the stored wrapped DEK with zeros, sets status = 'destroyed',
   * and purges in-memory keys.
   */
  async destroyKeyVersion(userId: string, keyVersion: number): Promise<void> {
    const key = await this.userKeyRepo.findOne({
      where: { userId, keyVersion },
    });
    if (!key) return;
    if (key.status === 'active') {
      throw new Error(`Cannot destroy active key version ${keyVersion} for user ${userId}`);
    }

    key.status = 'destroyed';
    key.edek = Buffer.alloc(key.edek.length, 0); // Zeroize wrapped ciphertext
    await this.userKeyRepo.save(key);

    // Evict any lingering cache entry and zeroize memory
    const cacheKey = `${userId}:${keyVersion}`;
    const cached = this.keyCache.get(cacheKey);
    if (cached) {
      this.zeroizeSession(cached);
      this.keyCache.delete(cacheKey);
    }
    this.logger.log(`Crypto-shredded key version ${keyVersion} for user ${userId}`);
  }
}

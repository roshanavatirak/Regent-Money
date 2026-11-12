import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

/** Marks a user key wrapped with the secret master key (FIELD_MASTER_KEY). */
const LOCAL_WRAP_MAGIC = Buffer.from('RMK2', 'ascii');
const MIN_MASTER_KEY_CHARS = 32;

export interface IKmsService {
  unwrapDek(userId: string, wrapped: Buffer, keyArn: string): Promise<Buffer>;
  generateDataKey(userId: string, keyArn: string): Promise<{ plaintextDek: Buffer; wrappedDek: Buffer }>;
}

@Injectable()
export class KmsService implements IKmsService {
  private readonly logger = new Logger(KmsService.name);
  private kmsClient: any = null;
  /**
   * Master key from the FIELD_MASTER_KEY secret (set on the server, never in the repository or
   * the database). Used when AWS KMS is not configured. Without it, user keys fall back to the
   * old built-in wrapping, whose key can be worked out from the source code.
   */
  private readonly localMasterKey: Buffer | null = KmsService.loadLocalMasterKey();

  private static loadLocalMasterKey(): Buffer | null {
    const secret = (process.env.FIELD_MASTER_KEY || '').trim();
    if (!secret) return null;
    if (secret.length < MIN_MASTER_KEY_CHARS) {
      throw new Error(`FATAL: FIELD_MASTER_KEY must be at least ${MIN_MASTER_KEY_CHARS} characters. Refusing to boot.`);
    }
    return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'utf8'), Buffer.from('regent/master/v2'), Buffer.from('user-dek-wrap'), 32));
  }

  private static isLocalWrap(wrapped: Buffer): boolean {
    return wrapped.length > LOCAL_WRAP_MAGIC.length + 28 && wrapped.subarray(0, LOCAL_WRAP_MAGIC.length).equals(LOCAL_WRAP_MAGIC);
  }

  /** True when a stored user key still uses the old built-in wrapping and can be upgraded now. */
  needsRewrap(wrapped: Buffer): boolean {
    return !this.kmsClient && !!this.localMasterKey && !KmsService.isLocalWrap(wrapped);
  }

  /** Wraps a user key with the secret master key (only call when needsRewrap() said yes). */
  rewrapDek(userId: string, plaintextDek: Buffer): Buffer {
    this.validateUserId(userId);
    if (!this.localMasterKey) throw new Error('FIELD_MASTER_KEY is not configured');
    return this.localWrap(userId, plaintextDek);
  }

  private localWrap(userId: string, plaintext: Buffer): Buffer {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.localMasterKey!, nonce);
    cipher.setAAD(Buffer.from(`regent/kms2/${userId}`, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([LOCAL_WRAP_MAGIC, nonce, cipher.getAuthTag(), ct]);
  }

  private localUnwrap(userId: string, wrapped: Buffer): Buffer {
    if (!this.localMasterKey) {
      throw new Error('This user key needs FIELD_MASTER_KEY, which is not set on the server.');
    }
    const body = wrapped.subarray(LOCAL_WRAP_MAGIC.length);
    const decipher = createDecipheriv('aes-256-gcm', this.localMasterKey, body.subarray(0, 12));
    decipher.setAAD(Buffer.from(`regent/kms2/${userId}`, 'utf8'));
    decipher.setAuthTag(body.subarray(12, 28));
    return Buffer.concat([decipher.update(body.subarray(28)), decipher.final()]);
  }

  constructor() {
    if (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || process.env.AWS_KMS_KEY_ARN) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { KMSClient } = require('@aws-sdk/client-kms');
        this.kmsClient = new KMSClient({ region: process.env.AWS_REGION || 'ap-south-1' });
        this.logger.log('KmsService initialized with AWS KMS in ap-south-1');
      } catch {
        this.logger.warn('@aws-sdk/client-kms not installed; falling back to simulated envelope encryption');
      }
    }
    if (!this.kmsClient) {
      if (this.localMasterKey) {
        this.logger.log('User keys are protected by FIELD_MASTER_KEY.');
      } else if (process.env.NODE_ENV === 'production') {
        this.logger.error(
          'SECURITY: FIELD_MASTER_KEY is not set. User keys are wrapped with a key that can be derived from the ' +
            'source code, so the database encryption does not protect against a database leak. Set FIELD_MASTER_KEY ' +
            '(32+ random characters) on the server and keep a copy somewhere safe.',
        );
      }
    }
  }

  private validateUserId(userId: string) {
    if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
      throw new Error('KMS request rejected: user_id is required in EncryptionContext');
    }
  }

  async unwrapDek(userId: string, wrapped: Buffer, keyArn: string): Promise<Buffer> {
    this.validateUserId(userId);
    if (this.kmsClient) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { DecryptCommand } = require('@aws-sdk/client-kms');
      const res = await this.kmsClient.send(
        new DecryptCommand({
          CiphertextBlob: wrapped,
          KeyId: keyArn,
          EncryptionContext: { app: 'regent', user_id: userId, purpose: 'user-dek' },
        }),
      );
      const plaintextCopy = Buffer.from(res.Plaintext);
      // Best-effort zeroization of KMS SDK response buffer
      if (res.Plaintext instanceof Uint8Array) {
        res.Plaintext.fill(0);
      }
      return plaintextCopy;
    }

    if (KmsService.isLocalWrap(wrapped)) return this.localUnwrap(userId, wrapped);

    // Keys wrapped before FIELD_MASTER_KEY existed (upgraded on first use, see needsRewrap)
    return this.simulateKmsDecrypt(userId, wrapped, keyArn);
  }

  async generateDataKey(userId: string, keyArn: string): Promise<{ plaintextDek: Buffer; wrappedDek: Buffer }> {
    this.validateUserId(userId);
    if (this.kmsClient) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { GenerateDataKeyCommand } = require('@aws-sdk/client-kms');
      const res = await this.kmsClient.send(
        new GenerateDataKeyCommand({
          KeyId: keyArn,
          KeySpec: 'AES_256',
          EncryptionContext: { app: 'regent', user_id: userId, purpose: 'user-dek' },
        }),
      );
      const plaintextCopy = Buffer.from(res.Plaintext);
      const wrappedDek = Buffer.from(res.CiphertextBlob);
      if (res.Plaintext instanceof Uint8Array) {
        res.Plaintext.fill(0);
      }
      return {
        plaintextDek: plaintextCopy,
        wrappedDek,
      };
    }

    const plaintextDek = randomBytes(32);
    const wrappedDek = this.localMasterKey
      ? this.localWrap(userId, plaintextDek)
      : this.simulateKmsEncrypt(userId, plaintextDek, keyArn); // dev / test only
    return { plaintextDek, wrappedDek };
  }

  // --- Dev / Mock Simulation (AES-256-GCM with KeyArn master key and AAD binding) ---
  private getMasterKey(keyArn: string): Buffer {
    const hash = require('node:crypto').createHash('sha256');
    return hash.update(keyArn).digest();
  }

  private simulateKmsEncrypt(userId: string, plaintext: Buffer, keyArn: string): Buffer {
    const masterKey = this.getMasterKey(keyArn);
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', masterKey, nonce);
    cipher.setAAD(Buffer.from(`regent/kms/${userId}`, 'utf8'));
    const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([nonce, tag, ct]);
  }

  private simulateKmsDecrypt(userId: string, wrapped: Buffer, keyArn: string): Buffer {
    const masterKey = this.getMasterKey(keyArn);
    const nonce = wrapped.subarray(0, 12);
    const tag = wrapped.subarray(12, 28);
    const ct = wrapped.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', masterKey, nonce);
    decipher.setAAD(Buffer.from(`regent/kms/${userId}`, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]);
  }
}

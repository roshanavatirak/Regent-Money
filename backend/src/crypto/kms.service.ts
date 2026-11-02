import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export interface IKmsService {
  unwrapDek(userId: string, wrapped: Buffer, keyArn: string): Promise<Buffer>;
  generateDataKey(userId: string, keyArn: string): Promise<{ plaintextDek: Buffer; wrappedDek: Buffer }>;
}

@Injectable()
export class KmsService implements IKmsService {
  private readonly logger = new Logger(KmsService.name);
  private kmsClient: any = null;

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

    // Dev/Test Envelope Simulator
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

    // Dev/Test Envelope Simulator
    const plaintextDek = randomBytes(32);
    const wrappedDek = this.simulateKmsEncrypt(userId, plaintextDek, keyArn);
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

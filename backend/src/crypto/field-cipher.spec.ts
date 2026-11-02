import {
  buildHeader,
  buildAad,
  deriveSubkey,
  encodeAmount,
  decodeAmount,
  padText,
  unpadText,
  encryptField,
  encryptFieldWithRng,
  decryptField,
  blindIndex,
  normaliseSearchTerm,
  OVERHEAD_BYTES,
  FieldContext,
} from './field-cipher';

describe('FieldCipher v3 Specification Tests', () => {
  const TEST_DEK = Buffer.from(
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    'hex',
  );
  const TEST_USER_ID = '018f3a2b-c852-789a-bcde-0123456789ab';
  const FIXED_NONCE = Buffer.from('00112233445566778899aabb', 'hex');

  const kEnc = deriveSubkey(TEST_DEK, TEST_USER_ID, 'enc');
  const kIdx = deriveSubkey(TEST_DEK, TEST_USER_ID, 'idx');

  describe('1. Subkey Derivation & Blind Index', () => {
    it('derives expected 32-byte subkeys via HKDF-SHA256', () => {
      expect(kEnc.toString('hex')).toBe(
        '28677cba5ae206594d00017c796a25a39c4ebf83bf3aa83d043a2803f18b005a',
      );
      expect(kIdx.toString('hex')).toBe(
        'd33d9bef9f9637df90db0dfcc43fbb18685fe002736fb9c67679617cfe9a3e57',
      );
    });

    it('generates blind index matching Test Vector 4', () => {
      const idx = blindIndex(kIdx, '   Swiggy   ');
      expect(idx.toString('hex')).toBe(
        'cdec3149da943eee0c6fdedb1c1fc4f8c620b3d30771cef29eae22023719fb87',
      );
    });

    it('normalises search terms with NFKC, trim, internal whitespace collapse, and lowercase', () => {
      expect(normaliseSearchTerm('  SWIGGY   INDIA  ')).toBe('swiggy india');
      expect(normaliseSearchTerm('Swiggy \t\n Instamart')).toBe('swiggy instamart');

      // Full-width Unicode characters (compatibility equivalent to ASCII)
      expect(normaliseSearchTerm('Ｓｗｉｇｇｙ')).toBe('swiggy');
      expect(blindIndex(kIdx, 'Ｓｗｉｇｇｙ')).toEqual(blindIndex(kIdx, 'Swiggy'));
    });
  });

  describe('2. Deterministic Test Vectors (Cross-Language Specification)', () => {
    it('matches Vector 1 (Amount: int64 big-endian with legacy string rowId)', () => {
      const ctx: FieldContext = {
        userId: TEST_USER_ID,
        table: 'transactions',
        column: 'amount',
        rowId: 'tx_manual_1730000000_abc123',
        rowVersion: 1n,
      };

      const pt = encodeAmount(125050n); // ₹1,250.50
      expect(pt.length).toBe(8);

      const env = encryptFieldWithRng(kEnc, 1, pt, ctx, () => FIXED_NONCE);
      expect(env.length).toBe(44); // 36 bytes overhead + 8 bytes payload = 44 bytes
      expect(env.toString('hex')).toBe(
        '524d03010000000100112233445566778899aabbc2a3178c3239055e83eddd64b32e21c33c242925f1732828',
      );

      const decrypted = decryptField(() => kEnc, env, ctx);
      expect(decodeAmount(decrypted)).toBe(125050n);
    });

    it('matches Vector 2 (Merchant: padded to 32 bytes with UUID rowId)', () => {
      const ctx: FieldContext = {
        userId: TEST_USER_ID,
        table: 'transactions',
        column: 'merchant',
        rowId: '018f3a2b-c852-789a-bcde-0123456789ef',
        rowVersion: 2n,
      };

      const pt = padText('Swiggy', 32, 256);
      expect(pt.length).toBe(32);

      const env = encryptFieldWithRng(kEnc, 1, pt, ctx, () => FIXED_NONCE);
      expect(env.length).toBe(68); // 36 + 32 = 68 bytes
      expect(env.toString('hex')).toBe(
        '524d03010000000100112233445566778899aabbc2a544fb5b5f8a5df6c6ef2490de24d4cfc0511c1e22cadf4c9aae7aebf91097acab89d065b69acc1b546be7aef644f6',
      );

      const decrypted = decryptField(() => kEnc, env, ctx);
      expect(unpadText(decrypted)).toBe('Swiggy');
    });

    it('matches Vector 3 (Note: padded to 64 bytes with UUID rowId)', () => {
      const ctx: FieldContext = {
        userId: TEST_USER_ID,
        table: 'transactions',
        column: 'note',
        rowId: '018f3a2b-c852-789a-bcde-0123456789ef',
        rowVersion: 2n,
      };

      const pt = padText('Team dinner at Indiranagar', 64, 2048);
      expect(pt.length).toBe(64);

      const env = encryptFieldWithRng(kEnc, 1, pt, ctx, () => FIXED_NONCE);
      expect(env.length).toBe(100); // 36 + 64 = 100 bytes
      expect(env.toString('hex')).toBe(
        '524d03010000000100112233445566778899aabbc2b943e95355cd409fa88141e2fe45a0ef893f787750abb12dfdcf08ebf910972b4a46a1c9328d138de96ada05d82a26681828d335379dc78b87e3c76614cd3e324e4c0ceb3a7529d2b6ab4c45e906c1',
      );

      const decrypted = decryptField(() => kEnc, env, ctx);
      expect(unpadText(decrypted)).toBe('Team dinner at Indiranagar');
    });
  });

  describe('3. Production Nonce Uniqueness (No Nonce Reuse in Production Path)', () => {
    it('produces distinct 12-byte CSPRNG nonces for 10,000 successive encryptions without collision', () => {
      const ctx: FieldContext = {
        userId: TEST_USER_ID,
        table: 'transactions',
        column: 'amount',
        rowId: 'tx_perf_test',
        rowVersion: 1n,
      };
      const pt = encodeAmount(1000n);
      const seenNonces = new Set<string>();
      const iterations = 10000;

      for (let i = 0; i < iterations; i++) {
        const env = encryptField(kEnc, 1, pt, ctx);
        const nonceHex = env.subarray(8, 20).toString('hex');
        expect(seenNonces.has(nonceHex)).toBe(false);
        seenNonces.add(nonceHex);
      }

      expect(seenNonces.size).toBe(iterations);
    });
  });

  describe('4. Parser Negative Tests & Tampering Resistance', () => {
    const baseCtx: FieldContext = {
      userId: TEST_USER_ID,
      table: 'transactions',
      column: 'amount',
      rowId: 'tx_manual_1001',
      rowVersion: 5n,
    };
    const validEnv = encryptField(kEnc, 1, encodeAmount(50000n), baseCtx);

    it('rejects envelope shorter than 36 bytes (truncated)', () => {
      for (const len of [0, 1, 8, 20, 35]) {
        const truncated = validEnv.subarray(0, len);
        expect(() => decryptField(() => kEnc, truncated, baseCtx)).toThrow(
          /unsupported envelope: truncated/,
        );
      }
    });

    it('rejects unknown magic bytes', () => {
      const badMagic = Buffer.from(validEnv);
      badMagic[0] = 0x58; // 'X'
      expect(() => decryptField(() => kEnc, badMagic, baseCtx)).toThrow(
        /unsupported envelope: invalid magic/,
      );
    });

    it('rejects unknown format version', () => {
      const badFormat = Buffer.from(validEnv);
      badFormat[2] = 0x04; // version 4
      expect(() => decryptField(() => kEnc, badFormat, baseCtx)).toThrow(
        /unsupported envelope: invalid format version/,
      );
    });

    it('rejects unknown algorithm byte', () => {
      const badAlg = Buffer.from(validEnv);
      badAlg[3] = 0x02; // alg 2
      expect(() => decryptField(() => kEnc, badAlg, baseCtx)).toThrow(
        /unsupported envelope: invalid algorithm/,
      );
    });

    it('rejects changed key-version byte', () => {
      const changedKeyVer = Buffer.from(validEnv);
      changedKeyVer.writeUInt32BE(2, 4); // change keyVersion from 1 to 2
      expect(() => decryptField((v) => (v === 2 ? kEnc : null), changedKeyVer, baseCtx)).toThrow();
    });

    it('rejects key version with no DEK (missing key)', () => {
      expect(() => decryptField(() => null, validEnv, baseCtx)).toThrow(
        /missing DEK for key version 1/,
      );
      expect(() => decryptField(() => undefined, validEnv, baseCtx)).toThrow(
        /missing DEK for key version 1/,
      );
    });

    it('rejects tampered ciphertext (bit-flip)', () => {
      const tampered = Buffer.from(validEnv);
      tampered[22] ^= 0x01; // flip bit in ciphertext
      expect(() => decryptField(() => kEnc, tampered, baseCtx)).toThrow();
    });

    it('rejects tampered authentication tag', () => {
      const tampered = Buffer.from(validEnv);
      tampered[tampered.length - 1] ^= 0xff;
      expect(() => decryptField(() => kEnc, tampered, baseCtx)).toThrow();
    });

    it('detects row-swapping attack (different rowId)', () => {
      const swappedCtx = { ...baseCtx, rowId: 'tx_manual_9999' };
      expect(() => decryptField(() => kEnc, validEnv, swappedCtx)).toThrow();
    });

    it('detects column-swapping attack (amount copied to note)', () => {
      const swappedCtx = { ...baseCtx, column: 'note' };
      expect(() => decryptField(() => kEnc, validEnv, swappedCtx)).toThrow();
    });

    it('detects table-swapping attack (transactions copied to income_records)', () => {
      const swappedCtx = { ...baseCtx, table: 'income_records' };
      expect(() => decryptField(() => kEnc, validEnv, swappedCtx)).toThrow();
    });

    it('detects cross-user injection attack (different userId)', () => {
      const swappedCtx = {
        ...baseCtx,
        userId: '018f3a2b-c852-789a-bcde-999999999999',
      };
      expect(() => decryptField(() => kEnc, validEnv, swappedCtx)).toThrow();
    });

    it('detects single-field rollback (rowVersion mismatch)', () => {
      const rolledBackCtx = { ...baseCtx, rowVersion: 4n };
      expect(() => decryptField(() => kEnc, validEnv, rolledBackCtx)).toThrow();

      const futureCtx = { ...baseCtx, rowVersion: 6n };
      expect(() => decryptField(() => kEnc, validEnv, futureCtx)).toThrow();
    });
  });

  describe('5. Invariant: row_version bump requires re-encrypting all fields', () => {
    it('verifies that updating row_version invalidates all existing field ciphertexts until re-encrypted', () => {
      const ctxV1: FieldContext = {
        userId: TEST_USER_ID,
        table: 'transactions',
        column: 'amount',
        rowId: 'tx_row_1',
        rowVersion: 1n,
      };
      const ctxV2: FieldContext = {
        ...ctxV1,
        rowVersion: 2n,
      };

      const envV1 = encryptField(kEnc, 1, encodeAmount(10000n), ctxV1);

      // Successfully decrypts under rowVersion = 1
      expect(decodeAmount(decryptField(() => kEnc, envV1, ctxV1))).toBe(10000n);

      // If the row is updated (row_version bumped to 2), the old ciphertext cannot be read with ctxV2
      expect(() => decryptField(() => kEnc, envV1, ctxV2)).toThrow();

      // Must be re-encrypted under ctxV2 in the same transaction
      const envV2 = encryptField(kEnc, 1, encodeAmount(10000n), ctxV2);
      expect(decodeAmount(decryptField(() => kEnc, envV2, ctxV2))).toBe(10000n);
    });
  });
});

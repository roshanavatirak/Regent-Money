import { randomBytes, createCipheriv, createDecipheriv, createHmac, hkdfSync } from 'node:crypto';

export const FORMAT_V3 = 0x03;
export const ALG_AES256GCM = 0x01;
export const OVERHEAD_BYTES = 36; // 8 header + 12 nonce + 16 auth tag

export const MERCHANT_BLOCK = 32;
export const MERCHANT_MAX = 256;
export const NOTE_BLOCK = 64;
export const NOTE_MAX = 2048;

/**
 * Immutable AAD table identifier constants.
 * Decoupled from physical database schema/table names to preserve AAD verification across migrations.
 */
export const AAD_TABLE = {
  transactions: 'transactions',
  incomeRecords: 'income_records',
} as const;

/**
 * Immutable AAD column identifier constants.
 * Decoupled from physical column names (e.g. physical enc_note -> AAD note).
 */
export const AAD_COLUMN = {
  amount: 'amount',
  merchant: 'merchant',
  note: 'note',
  source: 'source',
} as const;

export type RandomSource = (size: number) => Buffer;

export interface FieldContext {
  userId: string;
  table: string;
  column: string;
  rowId: string;
  rowVersion: bigint;
}

export const uuidBytes = (u: string): Buffer => {
  const clean = u.replace(/-/g, '');
  if (clean.length !== 32) {
    throw new Error(`Invalid UUID: ${u}`);
  }
  return Buffer.from(clean, 'hex');
};

export const lp = (s: string): Buffer => {
  const b = Buffer.from(s, 'utf8');
  const l = Buffer.alloc(2);
  l.writeUInt16BE(b.length);
  return Buffer.concat([l, b]);
};

export function buildHeader(keyVersion: number): Buffer {
  if (keyVersion < 1 || keyVersion > 0xffffffff) {
    throw new Error(`Invalid keyVersion: ${keyVersion}`);
  }
  const h = Buffer.alloc(8);
  h[0] = 0x52; // 'R'
  h[1] = 0x4d; // 'M'
  h[2] = FORMAT_V3;
  h[3] = ALG_AES256GCM;
  h.writeUInt32BE(keyVersion, 4);
  return h;
}

export function buildAad(h: Buffer, ctx: FieldContext): Buffer {
  const rv = Buffer.alloc(8);
  rv.writeBigUInt64BE(ctx.rowVersion);
  return Buffer.concat([
    h,
    lp('regent/v3'),
    uuidBytes(ctx.userId),
    lp(ctx.table),
    lp(ctx.column),
    lp(ctx.rowId), // Length-prefixed string: handles UUIDs and legacy string IDs
    rv,
  ]);
}

/**
 * Derives purpose subkeys from the user's 32-byte DEK using HKDF-SHA256.
 * Info: "regent/v3/" + userId + "/" + purpose
 */
export function deriveSubkey(dek: Buffer, userId: string, purpose: 'enc' | 'idx' | 'db'): Buffer {
  if (dek.length !== 32) {
    throw new Error(`Invalid DEK length: expected 32 bytes, got ${dek.length}`);
  }
  const info = Buffer.from(`regent/v3/${userId}/${purpose}`, 'utf8');
  return Buffer.from(hkdfSync('sha256', dek, Buffer.alloc(0), info, 32));
}

/**
 * Normalises search terms for blind indexing:
 * 1. Unicode NFKC normalisation (maps full-width, compatibility characters to standard forms)
 * 2. Trim leading/trailing whitespace
 * 3. Collapse multiple whitespace characters into a single space
 * 4. Lowercase
 */
export function normaliseSearchTerm(s: string): string {
  return s.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Generates an HMAC-SHA256 blind index of a normalised search term using k_idx.
 */
export function blindIndex(kIdx: Buffer, term: string): Buffer {
  const normalised = normaliseSearchTerm(term);
  return createHmac('sha256', kIdx).update(normalised, 'utf8').digest();
}

/**
 * Converts a numeric or string currency amount into integer paise using exact decimal string parsing.
 * Completely avoids float multiplication pitfalls (e.g. 0.29 * 100 = 28.999999999999996).
 */
export function decimalToPaise(val: number | string | null | undefined): bigint {
  if (val == null || val === '') return 0n;
  const str = String(val).trim().replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid decimal amount format: ${val}`);
  }
  const isNegative = str.startsWith('-');
  const clean = isNegative ? str.slice(1) : str;
  const [whole, frac = ''] = clean.split('.');
  const wholeBig = BigInt(whole);
  const fracTwoDigits = (frac + '00').slice(0, 2);
  const fracBig = BigInt(fracTwoDigits);
  const total = wholeBig * 100n + fracBig;
  return isNegative ? -total : total;
}

/**
 * Converts integer paise back to rupees as a standard number.
 */
export function paiseToRupees(paise: bigint): number {
  return Number(paise) / 100;
}

/**
 * Encodes an amount in integer paise as an 8-byte big-endian int64.
 */
export function encodeAmount(paise: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigInt64BE(paise);
  return b;
}

/**
 * Decodes an 8-byte big-endian int64 into paise.
 */
export function decodeAmount(b: Buffer): bigint {
  if (b.length !== 8) {
    throw new Error(`Invalid amount buffer length: expected 8 bytes, got ${b.length}`);
  }
  return b.readBigInt64BE(0);
}

/**
 * Pads a string with a 2-byte big-endian length prefix and zero-fills to a multiple of block bytes.
 */
export function padText(s: string, block: number, max: number): Buffer {
  const b = Buffer.from(s, 'utf8');
  const size = Math.ceil((b.length + 2) / block) * block;
  if (size > max) throw new Error('field too long');
  const out = Buffer.alloc(size);
  out.writeUInt16BE(b.length, 0);
  b.copy(out, 2);
  return out;
}

/**
 * Reads the 2-byte length prefix and extracts the original unpadded string.
 */
export function unpadText(b: Buffer): string {
  if (b.length < 2) throw new Error('Invalid buffer length: too short for length prefix');
  const len = b.readUInt16BE(0);
  if (len + 2 > b.length) throw new Error('Corrupt padding: length prefix exceeds buffer size');
  return b.subarray(2, 2 + len).toString('utf8');
}

/**
 * Production encryption: Nonce is strictly generated by crypto.randomBytes(12).
 * No nonce injection is possible through this API.
 */
export function encryptField(
  kEnc: Buffer,
  keyVersion: number,
  plaintext: Buffer,
  ctx: FieldContext,
): Buffer {
  return encryptFieldWithRng(kEnc, keyVersion, plaintext, ctx, randomBytes);
}

/**
 * Internal encryption seam allowing custom RNG for deterministic test vector generation.
 * NEVER exposed for production application callers.
 */
export function encryptFieldWithRng(
  kEnc: Buffer,
  keyVersion: number,
  plaintext: Buffer,
  ctx: FieldContext,
  rng: RandomSource,
): Buffer {
  if (kEnc.length !== 32) {
    throw new Error(`Invalid encryption key length: expected 32 bytes, got ${kEnc.length}`);
  }
  const h = buildHeader(keyVersion);
  const nonce = rng(12);
  if (!Buffer.isBuffer(nonce) || nonce.length !== 12) {
    throw new Error(`RNG must produce exactly 12 bytes, got ${nonce?.length}`);
  }

  const cipher = createCipheriv('aes-256-gcm', kEnc, nonce, { authTagLength: 16 });
  cipher.setAAD(buildAad(h, ctx));
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([h, nonce, ct, tag]);
}

/**
 * Decrypts a v3 binary envelope, verifying key version, nonce, AAD and authentication tag.
 * Throws if the envelope is truncated, invalid, tampered, swapped or rolled back.
 */
export function decryptField(
  getKEnc: (keyVersion: number) => Buffer | null | undefined,
  env: Buffer,
  ctx: FieldContext,
): Buffer {
  if (env.length < OVERHEAD_BYTES) {
    throw new Error(`unsupported envelope: truncated (length ${env.length} < ${OVERHEAD_BYTES})`);
  }
  if (env[0] !== 0x52 || env[1] !== 0x4d) {
    throw new Error(`unsupported envelope: invalid magic (0x${env[0].toString(16)}, 0x${env[1].toString(16)})`);
  }
  if (env[2] !== FORMAT_V3) {
    throw new Error(`unsupported envelope: invalid format version (0x${env[2].toString(16)})`);
  }
  if (env[3] !== ALG_AES256GCM) {
    throw new Error(`unsupported envelope: invalid algorithm (0x${env[3].toString(16)})`);
  }

  const h = env.subarray(0, 8);
  const keyVersion = h.readUInt32BE(4);
  const nonce = env.subarray(8, 20);
  const ct = env.subarray(20, env.length - 16);
  const tag = env.subarray(env.length - 16);

  const kEnc = getKEnc(keyVersion);
  if (!kEnc) {
    throw new Error(`missing DEK for key version ${keyVersion}`);
  }
  if (kEnc.length !== 32) {
    throw new Error(`Invalid encryption key length for version ${keyVersion}: expected 32 bytes, got ${kEnc.length}`);
  }

  const decipher = createDecipheriv('aes-256-gcm', kEnc, nonce, { authTagLength: 16 });
  decipher.setAAD(buildAad(h, ctx));
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

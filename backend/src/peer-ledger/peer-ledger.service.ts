import { BadRequestException, ConflictException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { AAD_COLUMN, AAD_TABLE } from '../crypto/field-cipher';
import { validateLedger, type PeerLedgerDoc } from './peer-ledger.validate';

/** First returned row: Postgres gives INSERT … RETURNING as rows, UPDATE … RETURNING as [rows, count]. */
export const firstRow = (result: any): any =>
  Array.isArray(result) ? (Array.isArray(result[0]) ? result[0][0] : result[0]) : undefined;

export interface StoredLedger {
  data: PeerLedgerDoc | null;
  /** Bumped on every save; a save must name the version it was based on. */
  version: number;
  updatedAt: number | null;
}

/**
 * Borrow & Lend, kept on the server so it survives log out, reinstall and a new phone.
 * One encrypted document per user (names, phone numbers and amounts are personal), with a
 * version number: a save based on an older version is refused with the current copy, so
 * the app merges and tries again instead of overwriting another phone's changes.
 */
@Injectable()
export class PeerLedgerService implements OnModuleInit {
  private readonly logger = new Logger(PeerLedgerService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cipher: FieldCipherService,
  ) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.peer_ledgers (
          user_id     TEXT PRIMARY KEY,
          enc_data    BYTEA NOT NULL,
          version     BIGINT NOT NULL,
          updated_at  BIGINT NOT NULL
        );
      `);
    } catch (err: any) {
      this.logger.warn(`Could not verify core.peer_ledgers: ${err?.message || err}`);
    }
  }

  async get(userId: string): Promise<StoredLedger> {
    const rows = await this.dataSource.query(
      `SELECT enc_data, version, updated_at FROM core.peer_ledgers WHERE user_id = $1`,
      [userId],
    );
    if (!rows.length) return { data: null, version: 0, updatedAt: null };
    const row = rows[0];
    const text = await this.cipher.decryptText(userId, AAD_TABLE.peerLedgers, AAD_COLUMN.peerLedger, userId, row.enc_data);
    return { data: JSON.parse(text), version: Number(row.version), updatedAt: Number(row.updated_at) };
  }

  /** Saves the ledger if `baseVersion` is the current one; else 409 with the current copy. */
  async save(userId: string, body: { data?: unknown; baseVersion?: unknown }): Promise<StoredLedger> {
    const checked = validateLedger(body?.data);
    if (!checked.ok) throw new BadRequestException(checked.reason);
    const baseVersion = Number(body?.baseVersion);
    if (!Number.isInteger(baseVersion) || baseVersion < 0) throw new BadRequestException('baseVersion is required.');

    const enc = await this.cipher.encryptText(userId, AAD_TABLE.peerLedgers, AAD_COLUMN.peerLedger, userId, checked.json);
    const now = Date.now();
    const nextVersion = baseVersion + 1;

    // Insert the first copy, or replace only when nobody saved in between.
    const rows =
      baseVersion === 0
        ? await this.dataSource.query(
            `INSERT INTO core.peer_ledgers (user_id, enc_data, version, updated_at)
             VALUES ($1, $2, 1, $3)
             ON CONFLICT (user_id) DO NOTHING
             RETURNING version`,
            [userId, enc, now],
          )
        : await this.dataSource.query(
            `UPDATE core.peer_ledgers SET enc_data = $2, version = $3, updated_at = $4
             WHERE user_id = $1 AND version = $5
             RETURNING version`,
            [userId, enc, nextVersion, now, baseVersion],
          );
    const saved = firstRow(rows);
    if (!saved) {
      // Another phone saved first: hand back its copy to merge.
      throw new ConflictException({ message: 'Ledger changed on another device.', current: await this.get(userId) });
    }
    return { data: checked.doc, version: Number(saved.version), updatedAt: now };
  }
}

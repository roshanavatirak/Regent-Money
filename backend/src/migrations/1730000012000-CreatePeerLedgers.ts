import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Borrow & Lend kept on the server: one encrypted ledger per user, versioned so two devices
 * can't overwrite each other. PeerLedgerService also creates it on startup (IF NOT EXISTS);
 * this records it.
 */
export class CreatePeerLedgers1730000012000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS core.peer_ledgers (
        user_id     TEXT PRIMARY KEY,
        enc_data    BYTEA NOT NULL,
        version     BIGINT NOT NULL,
        updated_at  BIGINT NOT NULL
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS core.peer_ledgers`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Who a transaction or income record was with, so one person who shows up under different
 * names, UPI IDs or accounts can be recognised as the same person.
 *
 * - enc_counterparty: the key read from the bank SMS ("vpa:rohit.c@okaxis" or "acct:4821"),
 *   encrypted like the merchant (FieldCipherService.encryptCounterparty).
 * - counterparty_id: the person or merchant the user linked it to on the phone. An opaque id;
 *   names and keys live in the encrypted peer ledger.
 *
 * SyncService also adds these on startup (IF NOT EXISTS); this records it.
 */
export class AddCounterparty1730000013000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    for (const table of ['finance.transactions', 'finance.income_records']) {
      await q.query(`
        ALTER TABLE ${table}
          ADD COLUMN IF NOT EXISTS enc_counterparty BYTEA,
          ADD COLUMN IF NOT EXISTS counterparty_id  TEXT
      `);
    }
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_counterparty
      ON finance.transactions (user_id, counterparty_id) WHERE counterparty_id IS NOT NULL
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_income_records_user_counterparty
      ON finance.income_records (user_id, counterparty_id) WHERE counterparty_id IS NOT NULL
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS finance.idx_income_records_user_counterparty`);
    await q.query(`DROP INDEX IF EXISTS finance.idx_transactions_user_counterparty`);
    for (const table of ['finance.income_records', 'finance.transactions']) {
      await q.query(`
        ALTER TABLE ${table}
          DROP COLUMN IF EXISTS counterparty_id,
          DROP COLUMN IF EXISTS enc_counterparty
      `);
    }
  }
}

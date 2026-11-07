import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Stores which SMS created each ledger row. Without it, re-scanning the inbox could not tell
 * "this credit is already recorded" from "this is a second credit", and raised false duplicate reviews.
 * SyncService.onModuleInit applies the same statements idempotently at startup.
 */
export class AddSmsIdentityColumns1730000002000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE finance.income_records
        ADD COLUMN IF NOT EXISTS sms_id     TEXT,
        ADD COLUMN IF NOT EXISTS content_id TEXT
    `);
    await q.query(`ALTER TABLE finance.transactions ADD COLUMN IF NOT EXISTS content_id TEXT`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_income_records_user_sms_id ON finance.income_records (user_id, sms_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_income_records_user_content_id ON finance.income_records (user_id, content_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_transactions_user_content_id ON finance.transactions (user_id, content_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS finance.idx_transactions_user_content_id`);
    await q.query(`DROP INDEX IF EXISTS finance.idx_income_records_user_content_id`);
    await q.query(`DROP INDEX IF EXISTS finance.idx_income_records_user_sms_id`);
    await q.query(`ALTER TABLE finance.transactions DROP COLUMN IF EXISTS content_id`);
    await q.query(`
      ALTER TABLE finance.income_records
        DROP COLUMN IF EXISTS content_id,
        DROP COLUMN IF EXISTS sms_id
    `);
  }
}

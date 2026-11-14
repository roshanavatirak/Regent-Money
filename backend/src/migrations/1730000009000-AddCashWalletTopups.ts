import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ATM withdrawals tagged "Cash withdrawal" are added to the Cash wallet (cash-wallet-topups.ts).
 * SyncService also creates these on startup (IF NOT EXISTS); this records them.
 */
export class AddCashWalletTopups1730000009000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS cash_tracking_since BIGINT`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS finance.cash_wallet_topups (
        transaction_id TEXT PRIMARY KEY,
        user_id UUID NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        row_version BIGINT NOT NULL,
        updated_at BIGINT NOT NULL
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_cash_wallet_topups_user ON finance.cash_wallet_topups(user_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS finance.cash_wallet_topups`);
    await q.query(`ALTER TABLE core.bank_profiles DROP COLUMN IF EXISTS cash_tracking_since`);
  }
}

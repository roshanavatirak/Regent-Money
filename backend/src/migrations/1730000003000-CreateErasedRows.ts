import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * IDs of rows the 30-day purge has erased. Holds no personal data: only which table,
 * which row ID and whose. Stops an old offline edit from bringing an erased row back.
 */
export class CreateErasedRows1730000003000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS finance.erased_rows (
        table_name TEXT   NOT NULL,
        id         TEXT   NOT NULL,
        user_id    TEXT   NOT NULL,
        erased_at  BIGINT NOT NULL,
        PRIMARY KEY (table_name, id)
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_erased_rows_user ON finance.erased_rows (user_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS finance.erased_rows`);
  }
}

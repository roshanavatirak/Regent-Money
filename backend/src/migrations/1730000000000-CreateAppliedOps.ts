import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppliedOps1730000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS finance.applied_ops (
        idem_key   TEXT PRIMARY KEY,
        user_id    UUID NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_applied_ops_applied_at ON finance.applied_ops (applied_at)
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS finance.applied_ops`);
  }
}


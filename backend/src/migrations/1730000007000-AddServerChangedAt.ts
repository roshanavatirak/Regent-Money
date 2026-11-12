import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Server-stamped change time for changed-only sync. The app also installs this on startup
 * (SyncService.installChangeTracking); this migration records it and gives a way back.
 */
export class AddServerChangedAt1730000007000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION finance.stamp_server_changed_at() RETURNS trigger AS $$
      BEGIN
        NEW.server_changed_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    for (const table of ['transactions', 'income_records']) {
      await q.query(`ALTER TABLE finance.${table} ADD COLUMN IF NOT EXISTS server_changed_at BIGINT`);
      await q.query(`CREATE INDEX IF NOT EXISTS idx_${table}_user_changed ON finance.${table} (user_id, server_changed_at)`);
      await q.query(`DROP TRIGGER IF EXISTS trg_${table}_server_changed ON finance.${table}`);
      await q.query(`
        CREATE TRIGGER trg_${table}_server_changed BEFORE INSERT OR UPDATE ON finance.${table}
        FOR EACH ROW EXECUTE FUNCTION finance.stamp_server_changed_at()
      `);
    }
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const table of ['transactions', 'income_records']) {
      await q.query(`DROP TRIGGER IF EXISTS trg_${table}_server_changed ON finance.${table}`);
      await q.query(`DROP INDEX IF EXISTS finance.idx_${table}_user_changed`);
      await q.query(`ALTER TABLE finance.${table} DROP COLUMN IF EXISTS server_changed_at`);
    }
    await q.query(`DROP FUNCTION IF EXISTS finance.stamp_server_changed_at()`);
  }
}

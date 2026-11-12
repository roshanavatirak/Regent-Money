import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokens1730000006000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS core.refresh_tokens (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        family_id     TEXT NOT NULL,
        token_hash    TEXT NOT NULL,
        device_name   TEXT,
        remember      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    BIGINT NOT NULL,
        last_used_at  BIGINT,
        expires_at    BIGINT NOT NULL,
        revoked_at    BIGINT,
        replaced_by   TEXT,
        replaced_at   BIGINT
      );
    `);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON core.refresh_tokens (token_hash)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON core.refresh_tokens (user_id, revoked_at)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON core.refresh_tokens (family_id)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS core.refresh_tokens`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateFeedbackTable1730000004000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS core.feedback (
        id                TEXT PRIMARY KEY,
        user_id           TEXT,
        kind              TEXT NOT NULL,
        title             TEXT NOT NULL,
        description       TEXT NOT NULL,
        area              TEXT,
        impact            TEXT,
        priority          TEXT NOT NULL DEFAULT 'medium',
        status            TEXT NOT NULL DEFAULT 'open',
        media_urls        JSONB NOT NULL DEFAULT '[]'::jsonb,
        media_public_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
        resolved_at       BIGINT,
        media_purged      BOOLEAN NOT NULL DEFAULT FALSE,
        media_purged_at   BIGINT,
        admin_notes       TEXT,
        app_version       TEXT,
        platform          TEXT,
        os_version        TEXT,
        theme             TEXT,
        created_at        BIGINT NOT NULL,
        updated_at        BIGINT NOT NULL
      );
    `);

    await q.query(`CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON core.feedback (user_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_feedback_status ON core.feedback (status)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON core.feedback (created_at DESC)`);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_feedback_purge_candidates ON core.feedback (status, resolved_at) WHERE media_purged = FALSE`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS core.feedback`);
  }
}


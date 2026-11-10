import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateChatThreads1730000005000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS core.chat_threads (
        id               TEXT PRIMARY KEY,
        user_id          TEXT NOT NULL,
        enc_title        BYTEA,
        enc_messages     BYTEA,
        message_count    INT NOT NULL DEFAULT 0,
        pinned           BOOLEAN NOT NULL DEFAULT FALSE,
        created_at       BIGINT NOT NULL,
        updated_at       BIGINT NOT NULL,
        last_message_at  BIGINT NOT NULL,
        retention_at     BIGINT NOT NULL,
        deleted_at       BIGINT
      );
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON core.chat_threads (user_id, deleted_at)`);
    await q.query(
      `CREATE INDEX IF NOT EXISTS idx_chat_threads_retention ON core.chat_threads (pinned, retention_at) WHERE deleted_at IS NULL`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS core.chat_threads`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Editable Home carousel cards: one draft row plus immutable numbered releases.
 * HomeCardsService also creates these on startup (IF NOT EXISTS); this records them.
 */
export class CreateHomeCards1730000008000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS core.home_card_draft (
        id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        cards       jsonb NOT NULL,
        rev         int NOT NULL DEFAULT 0,
        updated_by  text,
        updated_at  timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS core.home_card_releases (
        version       int PRIMARY KEY,
        cards         jsonb NOT NULL,
        note          text,
        published_by  text,
        published_at  timestamptz NOT NULL DEFAULT now()
      )`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS core.home_card_releases`);
    await q.query(`DROP TABLE IF EXISTS core.home_card_draft`);
  }
}

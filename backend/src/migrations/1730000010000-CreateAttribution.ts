import { MigrationInterface, QueryRunner } from 'typeorm';
import { ATTRIBUTION_SCHEMA_SQL } from '../attribution/attribution.schema';

/**
 * Install attribution: invite and campaign links, one-time link opens, and one row per
 * user saying how they arrived. AttributionService also creates these on startup
 * (IF NOT EXISTS); this records them.
 */
export class CreateAttribution1730000010000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    for (const sql of ATTRIBUTION_SCHEMA_SQL) await q.query(sql);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS core.install_attributions`);
    await q.query(`DROP TABLE IF EXISTS core.link_clicks`);
    await q.query(`DROP TABLE IF EXISTS core.tracking_links`);
  }
}

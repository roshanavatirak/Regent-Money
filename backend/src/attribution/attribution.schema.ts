/** Tables for install attribution. Every statement is safe to run repeatedly. */
export const ATTRIBUTION_SCHEMA_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS core.tracking_links (
     id             TEXT PRIMARY KEY,
     code           TEXT NOT NULL UNIQUE,
     type           TEXT NOT NULL CHECK (type IN ('invite', 'campaign')),
     owner_user_id  TEXT,
     campaign_name  TEXT,
     channel        TEXT,
     is_active      BOOLEAN NOT NULL DEFAULT TRUE,
     created_by     TEXT,
     created_at     BIGINT NOT NULL
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_tracking_links_invite_owner
     ON core.tracking_links (owner_user_id) WHERE type = 'invite'`,
  `CREATE TABLE IF NOT EXISTS core.link_clicks (
     token       TEXT PRIMARY KEY,
     link_id     TEXT NOT NULL,
     created_at  BIGINT NOT NULL,
     claimed_at  BIGINT,
     claimed_by  TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON core.link_clicks (link_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_link_clicks_created ON core.link_clicks (created_at)`,
  `CREATE TABLE IF NOT EXISTS core.install_attributions (
     id                 TEXT PRIMARY KEY,
     user_id            TEXT NOT NULL UNIQUE,
     source_type        TEXT NOT NULL,
     link_id            TEXT,
     click_token        TEXT UNIQUE,
     referrer           TEXT,
     click_at           BIGINT,
     install_at         BIGINT,
     status             TEXT NOT NULL,
     reject_reason      TEXT,
     integrity_verdict  TEXT NOT NULL DEFAULT 'not_required',
     integrity_detail   TEXT,
     app_version        TEXT,
     created_at         BIGINT NOT NULL,
     updated_at         BIGINT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_install_attr_link ON core.install_attributions (link_id, status)`,
  `CREATE INDEX IF NOT EXISTS idx_install_attr_created ON core.install_attributions (created_at)`,
];

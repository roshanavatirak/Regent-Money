import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEncryptionAtRestShadowColumns1730000001000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // 1. Table for envelope encryption keys (EDEKs)
    await q.query(`
      CREATE TABLE IF NOT EXISTS core.user_keys (
        user_id      UUID NOT NULL REFERENCES core.users(id) ON DELETE CASCADE,
        key_version  INTEGER NOT NULL,
        status       VARCHAR(32) NOT NULL DEFAULT 'active',
        edek         BYTEA NOT NULL,
        kms_key_arn  TEXT NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        rotated_at   TIMESTAMPTZ,
        PRIMARY KEY (user_id, key_version)
      )
    `);

    // Partial unique index to guarantee at most one 'active' DEK per user (prevents race condition)
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_user_keys_active
      ON core.user_keys (user_id)
      WHERE status = 'active'
    `);

    // Enable RLS and revoke all permissions from public/anon/authenticated roles.
    // Zero policies are created for anon/authenticated, ensuring Supabase PostgREST completely blocks client access.
    // The backend connects via dedicated database credentials (or service role) with direct table rights.
    await q.query(`
      ALTER TABLE core.user_keys ENABLE ROW LEVEL SECURITY;
      REVOKE ALL ON core.user_keys FROM PUBLIC, anon, authenticated;
    `);

    // 2. Add shadow encrypted columns and row_version to finance.transactions
    await q.query(`
      ALTER TABLE finance.transactions
        ADD COLUMN IF NOT EXISTS enc_amount    BYTEA,
        ADD COLUMN IF NOT EXISTS enc_merchant  BYTEA,
        ADD COLUMN IF NOT EXISTS enc_note      BYTEA,
        ADD COLUMN IF NOT EXISTS merchant_idx  BYTEA,
        ADD COLUMN IF NOT EXISTS row_version   BIGINT NOT NULL DEFAULT 1
    `);

    // Per-user composite index on (user_id, merchant_idx)
    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_transactions_user_merchant_idx
      ON finance.transactions (user_id, merchant_idx)
    `);

    // 3. Add shadow encrypted columns and row_version to finance.income_records
    await q.query(`
      ALTER TABLE finance.income_records
        ADD COLUMN IF NOT EXISTS enc_amount   BYTEA,
        ADD COLUMN IF NOT EXISTS enc_source   BYTEA,
        ADD COLUMN IF NOT EXISTS enc_note     BYTEA,
        ADD COLUMN IF NOT EXISTS source_idx   BYTEA,
        ADD COLUMN IF NOT EXISTS row_version  BIGINT NOT NULL DEFAULT 1
    `);

    await q.query(`
      CREATE INDEX IF NOT EXISTS idx_income_records_user_source_idx
      ON finance.income_records (user_id, source_idx)
    `);

    // 4. Trigger function to enforce row_version integrity:
    // - On INSERT: row_version MUST be 1 (new rows are encrypted under initial version 1).
    // - On UPDATE: row_version MUST increment by exactly 1.
    // (Database must NEVER automatically bump row_version, as that would invalidate
    // the AAD that the application encrypted before issuing the UPDATE).
    await q.query(`
      CREATE OR REPLACE FUNCTION finance.enforce_row_version_rules()
      RETURNS TRIGGER AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.row_version != 1 THEN
            RAISE EXCEPTION 'New row must have row_version = 1 (got %)', NEW.row_version;
          END IF;
          RETURN NEW;
        ELSIF TG_OP = 'UPDATE' THEN
          IF NEW.row_version != OLD.row_version + 1 THEN
            RAISE EXCEPTION 'Concurrency violation: row_version must increment by exactly 1 (expected %, got %)',
              OLD.row_version + 1, NEW.row_version;
          END IF;
          RETURN NEW;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await q.query(`
      DROP TRIGGER IF EXISTS trg_transactions_row_version ON finance.transactions;
      CREATE TRIGGER trg_transactions_row_version
        BEFORE INSERT OR UPDATE ON finance.transactions
        FOR EACH ROW
        EXECUTE FUNCTION finance.enforce_row_version_rules();
    `);

    await q.query(`
      DROP TRIGGER IF EXISTS trg_income_records_row_version ON finance.income_records;
      CREATE TRIGGER trg_income_records_row_version
        BEFORE INSERT OR UPDATE ON finance.income_records
        FOR EACH ROW
        EXECUTE FUNCTION finance.enforce_row_version_rules();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER IF EXISTS trg_transactions_row_version ON finance.transactions`);
    await q.query(`DROP TRIGGER IF EXISTS trg_income_records_row_version ON finance.income_records`);
    await q.query(`DROP FUNCTION IF EXISTS finance.enforce_row_version_rules`);

    await q.query(`DROP INDEX IF EXISTS finance.idx_income_records_user_source_idx`);
    await q.query(`
      ALTER TABLE finance.income_records
        DROP COLUMN IF EXISTS enc_amount,
        DROP COLUMN IF EXISTS enc_source,
        DROP COLUMN IF EXISTS enc_note,
        DROP COLUMN IF EXISTS source_idx,
        DROP COLUMN IF EXISTS row_version
    `);

    await q.query(`DROP INDEX IF EXISTS finance.idx_transactions_user_merchant_idx`);
    await q.query(`
      ALTER TABLE finance.transactions
        DROP COLUMN IF EXISTS enc_amount,
        DROP COLUMN IF EXISTS enc_merchant,
        DROP COLUMN IF EXISTS enc_note,
        DROP COLUMN IF EXISTS merchant_idx,
        DROP COLUMN IF EXISTS row_version
    `);

    await q.query(`DROP INDEX IF EXISTS core.uq_user_keys_active`);
    await q.query(`DROP TABLE IF EXISTS core.user_keys`);
  }
}

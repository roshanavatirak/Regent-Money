// Erased-row IDs: which rows the 30-day purge removed for good. No personal data is kept.
// Kept apart from the purge service so sync code can use it without loading the scheduler.

export const ERASED_ROWS_TABLE = 'finance.erased_rows';

let erasedRowsReady = false;

/** Creates finance.erased_rows if the migration hasn't run yet. Safe to call repeatedly. */
export async function ensureErasedRowsTable(db: { query: (sql: string, params?: any[]) => Promise<any> }) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${ERASED_ROWS_TABLE} (
      table_name TEXT   NOT NULL,
      id         TEXT   NOT NULL,
      user_id    TEXT   NOT NULL,
      erased_at  BIGINT NOT NULL,
      PRIMARY KEY (table_name, id)
    )`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_erased_rows_user ON ${ERASED_ROWS_TABLE} (user_id)`);
  erasedRowsReady = true;
}

/** Test hook. */
export function setErasedRowsReady(ready: boolean) {
  erasedRowsReady = ready;
}

/**
 * True when the purge has erased this row for good, so a write for it must be dropped.
 * If the table couldn't be created, nothing that needs it has been erased, so false is correct.
 */
export async function isErasedRow(
  db: { query: (sql: string, params?: any[]) => Promise<any> },
  table: string,
  id: string | null | undefined,
): Promise<boolean> {
  if (!erasedRowsReady || !id) return false;
  const rows = await db.query(`SELECT 1 FROM ${ERASED_ROWS_TABLE} WHERE table_name = $1 AND id = $2`, [table, id]);
  return Array.isArray(rows) && rows.length > 0;
}

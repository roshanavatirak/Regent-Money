/**
 * ATM cash goes into the Cash wallet.
 *
 * A withdrawal tagged "Cash withdrawal" adds its amount to the user's Cash wallet, so the cash
 * can then be spent from the wallet (tea, auto, vegetables) and tagged there. The withdrawal
 * itself is left out of spending (see the app's nonSpendingCategories.ts), so nothing is
 * counted twice.
 *
 * How it stays correct whatever path changed the data (phone edit, offline outbox, SMS,
 * statement import, tag correction, delete): after every write, `reconcileCashTopups` compares
 * the withdrawals that should be in the wallet with the ones already added (one row per
 * withdrawal in finance.cash_wallet_topups) and moves the wallet by the difference:
 *  - newly tagged withdrawal       → amount added
 *  - amount edited                 → the difference added or taken off
 *  - untagged, deleted, or moved to the Cash account itself → amount taken back off
 * Running it again changes nothing, and a per-user lock stops two runs overlapping.
 *
 * Only withdrawals from the moment the wallet starts tracking them count
 * (bank_profiles.cash_tracking_since: set when the wallet is created, or on the first run for
 * a wallet that existed before this feature). Older ones are already in the cash balance the
 * user typed in.
 */

/** Stored category names that mean Cash withdrawal (the app's categories.ts uses the same). */
export const CASH_WITHDRAWAL_KEYS = ['cash_withdrawals', 'cash_withdrawal', 'atm', 'atm_withdrawal'];

export interface TopupEntry {
  amount: number;
  rowVersion: string;
}

export interface TopupPlan {
  /** Amount to add to the Cash wallet (negative = take off). */
  delta: number;
  upserts: Array<{ id: string } & TopupEntry>;
  deletes: string[];
}

const cents = (n: number) => Math.round(n * 100) / 100;

/**
 * Compares what should be in the wallet (`desired`) with what was already added (`applied`).
 * A withdrawal whose amount couldn't be read is passed in `unknown` and left exactly as it is.
 */
export function planCashTopups(
  desired: Map<string, TopupEntry>,
  applied: Map<string, TopupEntry>,
  unknown: Set<string> = new Set(),
): TopupPlan {
  let delta = 0;
  const upserts: TopupPlan['upserts'] = [];
  const deletes: string[] = [];

  for (const [id, want] of desired) {
    const had = applied.get(id);
    if (!had) {
      delta += want.amount;
      upserts.push({ id, ...want });
    } else if (had.amount !== want.amount || had.rowVersion !== want.rowVersion) {
      delta += want.amount - had.amount;
      upserts.push({ id, ...want });
    }
  }
  for (const [id, had] of applied) {
    if (desired.has(id) || unknown.has(id)) continue;
    delta -= had.amount;
    deletes.push(id);
  }
  return { delta: cents(delta), upserts, deletes };
}

/** The bits of a database connection this needs (a TypeORM EntityManager inside a transaction). */
export interface QueryRunnerLike {
  query(sql: string, params?: unknown[]): Promise<any[]>;
}

/** Reads a withdrawal's amount (amounts may be stored encrypted only). null = couldn't read it. */
export type ReadAmount = (row: {
  id: string;
  amount: unknown;
  enc_amount: unknown;
  enc_text: unknown;
  row_version: unknown;
}) => Promise<number | null>;

/**
 * Brings the user's Cash wallet in line with their tagged ATM withdrawals. Must run inside a
 * database transaction. Returns the amount the wallet moved by (0 when nothing changed or the
 * user has no Cash wallet).
 */
export async function reconcileCashTopups(
  m: QueryRunnerLike,
  userId: string,
  readAmount: ReadAmount,
  now: number = Date.now(),
): Promise<number> {
  // One run per user at a time; released when the transaction ends
  await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`cash_topups:${userId}`]);

  const [cash] = await m.query(
    `SELECT id, cash_tracking_since FROM core.bank_profiles
      WHERE user_id = $1 AND is_deleted = false AND (lower(account_type) = 'cash' OR id LIKE 'cash\\_%')
      ORDER BY id LIMIT 1`,
    [userId],
  );
  if (!cash) return 0;

  let since = Number(cash.cash_tracking_since) || 0;
  if (!since) {
    since = now;
    await m.query(
      `UPDATE core.bank_profiles SET cash_tracking_since = $3
        WHERE id = $1 AND user_id = $2 AND cash_tracking_since IS NULL`,
      [cash.id, userId, since],
    );
  }

  const rows = await m.query(
    `SELECT id, amount, enc_amount, enc_merchant AS enc_text, row_version
       FROM finance.transactions
      WHERE user_id = $1 AND is_deleted = false AND "timestamp" >= $2
        AND bank_profile_id IS DISTINCT FROM $3
        AND regexp_replace(lower(trim(category)), '[[:space:]-]+', '_', 'g') = ANY($4)`,
    [userId, since, cash.id, CASH_WITHDRAWAL_KEYS],
  );
  const appliedRows = await m.query(
    `SELECT transaction_id, amount, row_version FROM finance.cash_wallet_topups WHERE user_id = $1`,
    [userId],
  );

  const applied = new Map<string, TopupEntry>();
  for (const r of appliedRows) {
    applied.set(String(r.transaction_id), { amount: cents(Number(r.amount) || 0), rowVersion: String(r.row_version) });
  }

  const desired = new Map<string, TopupEntry>();
  const unknown = new Set<string>();
  for (const row of rows) {
    const id = String(row.id);
    const rowVersion = String(row.row_version ?? '1');
    const had = applied.get(id);
    // Unchanged row (same version): reuse the amount already added, no decryption needed
    if (had && had.rowVersion === rowVersion) {
      desired.set(id, had);
      continue;
    }
    const amount = await readAmount(row);
    if (amount == null || !Number.isFinite(amount)) {
      unknown.add(id);
      if (had) desired.set(id, had);
      continue;
    }
    desired.set(id, { amount: cents(Math.abs(amount)), rowVersion });
  }

  const plan = planCashTopups(desired, applied, unknown);

  for (const id of plan.deletes) {
    await m.query(`DELETE FROM finance.cash_wallet_topups WHERE transaction_id = $1 AND user_id = $2`, [id, userId]);
  }
  for (const u of plan.upserts) {
    await m.query(
      `INSERT INTO finance.cash_wallet_topups (transaction_id, user_id, amount, row_version, updated_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (transaction_id) DO UPDATE
         SET amount = EXCLUDED.amount, row_version = EXCLUDED.row_version, updated_at = EXCLUDED.updated_at
       WHERE finance.cash_wallet_topups.user_id = EXCLUDED.user_id`,
      [u.id, userId, u.amount, u.rowVersion, now],
    );
  }
  if (plan.delta !== 0) {
    await m.query(
      `UPDATE core.bank_profiles
          SET current_balance = ROUND((COALESCE(current_balance, 0) + $3)::numeric, 2),
              last_sync_timestamp = $4, updated_at = $4
        WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
      [cash.id, userId, plan.delta, now],
    );
  }
  return plan.delta;
}

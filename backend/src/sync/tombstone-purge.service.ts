import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { ERASED_ROWS_TABLE, ensureErasedRowsTable } from './erased-rows.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long a deleted row is kept before it is erased for good. */
export const TOMBSTONE_RETENTION_DAYS = 30;

/**
 * Deleted SMS rows also stop the SMS scanner from adding the same message again.
 * The phone never scans further back than 30 days (smsCatchupService, bankDiscoveryService),
 * so these rows are kept until the SMS itself is older than this, with a safety margin.
 */
export const SMS_TOMBSTONE_MIN_AGE_DAYS = 60;

/** Rows deleted per statement, so a large purge never holds long locks. */
export const PURGE_BATCH_SIZE = 2000;

export interface PurgeTarget {
  /** schema.table */
  table: string;
  /** SQL expression giving the time (ms) the row was deleted */
  deletedAt: string;
  /** Extra condition the row must also meet before it may be erased */
  extraGuard?: string;
  /** True when extraGuard uses $3 (the SMS age cutoff) */
  usesSmsCutoff?: boolean;
  /**
   * Remember erased IDs in finance.erased_rows. Needed for tables an app can write to
   * by ID (outbox upserts, create endpoints that accept a client ID), so an old offline
   * edit can't bring the row back.
   */
  rememberIds?: boolean;
}

const SMS_GUARD =
  `((sms_id IS NULL AND content_id IS NULL) OR COALESCE("timestamp", 0) < $3)`;

/**
 * Order matters: child rows go before the rows they point at.
 * Parents are only erased when no live row still points at them.
 */
export const PURGE_TARGETS: PurgeTarget[] = [
  { table: 'finance.transactions', deletedAt: 'updated_at', extraGuard: SMS_GUARD, usesSmsCutoff: true, rememberIds: true },
  { table: 'finance.income_records', deletedAt: 'updated_at', extraGuard: SMS_GUARD, usesSmsCutoff: true, rememberIds: true },
  { table: 'finance.budget_transaction_exclusions', deletedAt: 'updated_at' },
  { table: 'wealth.goal_history', deletedAt: 'updated_at' },
  { table: 'wealth.net_worth_snapshots', deletedAt: 'updated_at' },
  { table: 'core.notifications', deletedAt: 'COALESCE(updated_at, created_at)' },
  {
    table: 'wealth.savings_goals',
    deletedAt: 'updated_at',
    extraGuard: `NOT EXISTS (SELECT 1 FROM wealth.goal_history h WHERE h.goal_id = t.id AND h.is_deleted = false)`,
    rememberIds: true,
  },
  { table: 'finance.budget_declarations', deletedAt: 'updated_at', rememberIds: true },
  {
    table: 'core.bank_profiles',
    deletedAt: 'updated_at',
    extraGuard:
      `NOT EXISTS (SELECT 1 FROM finance.transactions x WHERE x.bank_profile_id = t.id AND x.is_deleted = false)` +
      ` AND NOT EXISTS (SELECT 1 FROM finance.income_records x WHERE x.bank_profile_id = t.id AND x.is_deleted = false)`,
    rememberIds: true,
  },
];

/**
 * One batched DELETE that returns how many rows it erased as [{ n }].
 * $1 = deleted-before cutoff, $2 = batch size, $3 = SMS-older-than cutoff (SMS tables only).
 * For rememberIds targets the erased IDs are written to finance.erased_rows in the same statement,
 * so a row is never gone without being remembered.
 */
export function buildPurgeSql(target: PurgeTarget): string {
  const where = [`t.is_deleted = true`, `${target.deletedAt} < $1`];
  if (target.extraGuard) where.push(target.extraGuard);
  const del =
    `DELETE FROM ${target.table} WHERE ctid IN (` +
    `SELECT t.ctid FROM ${target.table} t WHERE ${where.join(' AND ')} LIMIT $2)`;

  if (!target.rememberIds) {
    return `WITH gone AS (${del} RETURNING 1) SELECT count(*)::int AS n FROM gone`;
  }
  return (
    `WITH gone AS (${del} RETURNING id, user_id), ` +
    `saved AS (INSERT INTO ${ERASED_ROWS_TABLE} (table_name, id, user_id, erased_at) ` +
    `SELECT '${target.table}', id::text, user_id::text, (extract(epoch from now()) * 1000)::bigint FROM gone ` +
    `ON CONFLICT DO NOTHING) ` +
    `SELECT count(*)::int AS n FROM gone`
  );
}

/**
 * Permanently erases rows users deleted more than 30 days ago.
 *
 * Deleting in the app only marks a row as deleted, so a device that was offline
 * can't bring it back with an old edit. After 30 days that protection has done its
 * job and the data itself is erased.
 */
@Injectable()
export class TombstonePurgeService implements OnModuleInit {
  private readonly logger = new Logger(TombstonePurgeService.name);
  private running = false;

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.ensureTable();
  }

  private async ensureTable(): Promise<boolean> {
    try {
      await ensureErasedRowsTable(this.dataSource);
      return true;
    } catch (e: any) {
      this.logger.error(`[TombstonePurge] Could not create ${ERASED_ROWS_TABLE}: ${e?.message || e}`);
      return false;
    }
  }

  // Daily at 03:30 server time, outside the morning and evening notification jobs
  @Cron('30 3 * * *')
  async handlePurgeCron() {
    await this.purge();
  }

  async purge(now: number = Date.now()): Promise<Record<string, number>> {
    if (this.running) return {};
    this.running = true;
    const deletedBefore = now - TOMBSTONE_RETENTION_DAYS * DAY_MS;
    const smsBefore = now - SMS_TOMBSTONE_MIN_AGE_DAYS * DAY_MS;
    const counts: Record<string, number> = {};

    try {
      const canRemember = await this.ensureTable();
      for (const target of PURGE_TARGETS) {
        if (target.rememberIds && !canRemember) {
          // Never erase a row we can't remember, or an old offline edit could bring it back
          counts[target.table] = 0;
          continue;
        }
        const sql = buildPurgeSql(target);
        // Postgres rejects parameters a statement doesn't use, so $3 is sent only where it appears
        const params: any[] = [String(deletedBefore), PURGE_BATCH_SIZE];
        if (target.usesSmsCutoff) params.push(String(smsBefore));
        let total = 0;
        try {
          for (;;) {
            const res = await this.dataSource.query(sql, params);
            const n = affectedRows(res);
            total += n;
            if (n < PURGE_BATCH_SIZE) break;
          }
        } catch (e: any) {
          // One table failing must not stop the others
          this.logger.error(`[TombstonePurge] ${target.table} failed: ${e?.message || e}`);
        }
        counts[target.table] = total;
      }

      if (canRemember) {
        // Erased IDs of accounts that no longer exist aren't needed any more
        try {
          const res = await this.dataSource.query(
            `WITH gone AS (DELETE FROM ${ERASED_ROWS_TABLE} e ` +
              `WHERE NOT EXISTS (SELECT 1 FROM core.users u WHERE u.id = e.user_id) RETURNING 1) ` +
              `SELECT count(*)::int AS n FROM gone`,
          );
          counts[ERASED_ROWS_TABLE] = affectedRows(res);
        } catch (e: any) {
          this.logger.error(`[TombstonePurge] ${ERASED_ROWS_TABLE} cleanup failed: ${e?.message || e}`);
        }
      }

      const sum = Object.values(counts).reduce((a, b) => a + b, 0);
      if (sum > 0) this.logger.log(`[TombstonePurge] Erased ${sum} deleted row(s): ${JSON.stringify(counts)}`);
      return counts;
    } finally {
      this.running = false;
    }
  }
}

/** buildPurgeSql always returns a single row [{ n }]. */
function affectedRows(res: any): number {
  const n = Array.isArray(res) ? Number(res[0]?.n) : NaN;
  if (Number.isFinite(n)) return n;
  return 0;
}

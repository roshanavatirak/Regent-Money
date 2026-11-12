import { Injectable, Logger, BadRequestException, UnauthorizedException, OnModuleInit, GoneException, ConflictException, HttpException, HttpStatus } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'node:crypto';
import { istDay } from '../ai/ai.service';
import { isErasedRow } from './erased-rows.util';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In, EntityManager, Brackets } from 'typeorm';
import {
  classifySms,
  isSameSms,
  isSmsIdentity,
  LedgerRow,
  SAME_SMS_WINDOW_MS,
  SmsCandidate,
  smsContentId,
  smsReviewKeys,
} from './sms-dedupe.util';

/** One ledger entry taken from a bank SMS, by the live receiver or an inbox re-scan. */
interface SmsLedgerItem extends SmsCandidate {
  type: 'debit' | 'credit';
  merchant: string;
  category?: string;
  isSalary?: boolean;
}

/**
 * recorded: new row saved. already_recorded: this SMS was stored before (silent no-op).
 * review: a different SMS that looks like a double payment, user asked. review_pending: already asked.
 */
type SmsOutcome = 'recorded' | 'already_recorded' | 'review' | 'review_pending';
import { BankProfile } from './entities/bank-profile.entity';
import { Transaction } from './entities/transaction.entity';
import { BudgetDeclaration } from './entities/budget-declaration.entity';
import { SavingsGoal } from './entities/savings-goal.entity';
import { GoalHistory } from './entities/goal-history.entity';
import { NetWorthSnapshot } from './entities/net-worth-snapshot.entity';
import { IncomeRecord } from './entities/income-record.entity';
import { UserMerchantTag } from './entities/user-merchant-tag.entity';
import { BudgetTransactionExclusion } from './entities/budget-exclusion.entity';
import { User } from '../users/entities/user.entity';
import { OcrSyncDto } from './dto/ocr-sync.dto';
import { ManualTransactionDto } from './dto/manual-transaction.dto';
import { ConfirmDuplicateDto } from './dto/confirm-duplicate.dto';
import { PDFExtract, PDFExtractOptions } from 'pdf.js-extract';
import { AiService } from '../ai/ai.service';
import { parseSMS, detectBankFromSender, isBankSmsSender, ParsedTransaction } from './sms-parser.util';
import { DirectSmsDto } from './dto/direct-sms.dto';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FieldCipherService } from '../crypto/field-cipher.service';

// Enable BigInt serialization to JSON (prevents TypeError: Do not know how to serialize a BigInt on row_version)
if (typeof BigInt !== 'undefined' && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

export class RejectOp extends Error {}

/**
 * Changed-only sync ("delta sync").
 *  - Each pull re-sends the last 2 minutes before the phone's cursor, so a write that was still
 *    being committed during the previous pull is never missed (receiving a row twice is harmless).
 *  - A cursor older than 25 days gets the full data instead: deleted rows are erased for good
 *    after 30 days, so an older phone could miss a deletion.
 *  - Above 2,000 changed rows the full data is simpler and no slower.
 */
export const DELTA_OVERLAP_MS = 2 * 60 * 1000;
export const DELTA_MAX_AGE_MS = 25 * 24 * 60 * 60 * 1000;
export const DELTA_MAX_ROWS = 2000;

/**
 * How many months in a row (ending this month, or last month if nothing is saved yet this
 * month) the goal has at least one saving. Counts months, not the number of savings.
 */
export function savingStreakMonths(entries: any[] | null | undefined, today: string): number {
  const months = new Set<string>();
  for (const e of entries || []) {
    if (e && e.type === 'save' && typeof e.at === 'string' && Number(e.amount) > 0) months.add(e.at.slice(0, 7));
  }
  let [year, month] = today.slice(0, 7).split('-').map(Number);
  const key = () => `${year}-${String(month).padStart(2, '0')}`;
  const back = () => {
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  };
  if (!months.has(key())) back();
  let streak = 0;
  while (months.has(key())) {
    streak += 1;
    back();
  }
  return streak;
}

/** What the older (pre-outbox) endpoints tell the app when a write is refused. */
const LEGACY_REJECT_MESSAGES: Record<string, string> = {
  bad_bank_profile: 'Bank account not found.',
  bad_amount: 'Enter a valid amount (up to 2 decimal places).',
  bad_timestamp: 'Choose a valid date.',
  forbidden: 'Entry not found.',
};

export type OpResult = {
  idemKey: string;
  status: 'applied' | 'duplicate' | 'rejected' | 'retry';
  reason?: string;
};

const ENTITIES = {
  transaction: {
    table: 'finance.transactions',
    prefix: 'tx_manual_',
    textField: 'merchant',
    cols: {
      amount: 'amount',
      category: 'category',
      merchant: 'merchant',
      timestamp: 'timestamp',
      bankProfileId: 'bank_profile_id',
      status: 'status',
    },
  },
  income: {
    table: 'finance.income_records',
    prefix: 'inc_manual_',
    textField: 'source',
    cols: {
      amount: 'amount',
      category: 'category',
      source: 'source',
      timestamp: 'timestamp',
      bankProfileId: 'bank_profile_id',
    },
  },
} as const;

@Injectable()
export class SyncService implements OnModuleInit {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(BankProfile)
    private readonly bankProfileRepository: Repository<BankProfile>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(BudgetDeclaration)
    private readonly budgetDeclarationRepository: Repository<BudgetDeclaration>,
    @InjectRepository(SavingsGoal)
    private readonly savingsGoalRepository: Repository<SavingsGoal>,
    @InjectRepository(GoalHistory)
    private readonly goalHistoryRepository: Repository<GoalHistory>,
    @InjectRepository(NetWorthSnapshot)
    private readonly netWorthSnapshotRepository: Repository<NetWorthSnapshot>,
    @InjectRepository(IncomeRecord)
    private readonly incomeRecordRepository: Repository<IncomeRecord>,
    @InjectRepository(UserMerchantTag)
    private readonly userMerchantTagRepository: Repository<UserMerchantTag>,
    @InjectRepository(BudgetTransactionExclusion)
    private readonly budgetExclusionRepository: Repository<BudgetTransactionExclusion>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly aiService: AiService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
    private readonly fieldCipherService: FieldCipherService,
  ) {}

  /**
   * Every new database connection gets two safety limits:
   *  - a single query is cancelled after 20 s (DB_STATEMENT_TIMEOUT_MS) instead of holding a
   *    connection and the CPU for minutes
   *  - a transaction left open and idle for 30 s is closed by the database
   * Set with a plain SET on each connection, which works through Supabase's pooler too.
   */
  private installDbTimeouts() {
    try {
      const pool = (this.dataSource.driver as any)?.master;
      if (!pool || typeof pool.on !== 'function') return;
      const statementMs = Math.max(1000, Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 20_000);
      pool.on('connect', (client: any) => {
        client
          .query(`SET statement_timeout = ${statementMs}; SET idle_in_transaction_session_timeout = 30000;`)
          .catch((err: any) => this.logger.warn(`Could not set database timeouts: ${err?.message || err}`));
      });
    } catch (err: any) {
      this.logger.warn(`Could not install database timeouts: ${err?.message || err}`);
    }
  }

  /** True once the database stamps every changed row (see installChangeTracking). */
  private deltaSyncReady = false;

  /**
   * Makes the database itself record when a transaction or income row last changed
   * (server_changed_at, set by a trigger on every insert and update). Changed-only sync reads
   * this instead of updated_at, which is the time on the PHONE when the edit was made and can
   * be days old for an edit made offline. If any step fails, changed-only sync stays off and
   * every pull sends the full data, as before.
   */
  private async installChangeTracking() {
    try {
      await this.dataSource.query(`
        CREATE OR REPLACE FUNCTION finance.stamp_server_changed_at() RETURNS trigger AS $$
        BEGIN
          NEW.server_changed_at := (extract(epoch from clock_timestamp()) * 1000)::bigint;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      for (const table of ['transactions', 'income_records']) {
        await this.dataSource.query(`ALTER TABLE finance.${table} ADD COLUMN IF NOT EXISTS server_changed_at BIGINT;`);
        await this.dataSource.query(
          `CREATE INDEX IF NOT EXISTS idx_${table}_user_changed ON finance.${table} (user_id, server_changed_at);`,
        );
        await this.dataSource.query(`
          DO $$ BEGIN
            IF NOT EXISTS (
              SELECT 1 FROM pg_trigger WHERE tgname = 'trg_${table}_server_changed'
                 AND tgrelid = 'finance.${table}'::regclass
            ) THEN
              CREATE TRIGGER trg_${table}_server_changed BEFORE INSERT OR UPDATE ON finance.${table}
              FOR EACH ROW EXECUTE FUNCTION finance.stamp_server_changed_at();
            END IF;
          END $$;
        `);
      }
      this.deltaSyncReady = true;
      this.logger.log('Changed-only sync is on (server change tracking installed).');
    } catch (err: any) {
      this.deltaSyncReady = false;
      this.logger.warn(`Changed-only sync is OFF, full sync is used instead: ${err?.message || err}`);
    }
  }

  async onModuleInit() {
    this.installDbTimeouts();
    await this.installChangeTracking();
    this.logger.log('Initializing BankProfile schema checks...');
    try {
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS sms_sender_id TEXT;
      `);
      // Time of the bank SMS whose "available balance" the stored balance came from
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS balance_as_of BIGINT;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS upi_id TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS custom_keywords TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS statement_password TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT FALSE;
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS account_type TEXT DEFAULT 'Savings';
      `);
      await this.dataSource.query(`
        ALTER TABLE core.bank_profiles ADD COLUMN IF NOT EXISTS debit_card_suffixes TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.income_records ADD COLUMN IF NOT EXISTS category TEXT;
      `);
      // SMS identity on both ledgers, so a re-scanned SMS is recognised instead of flagged as a duplicate
      await this.dataSource.query(`
        ALTER TABLE finance.income_records ADD COLUMN IF NOT EXISTS sms_id TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.income_records ADD COLUMN IF NOT EXISTS content_id TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.transactions ADD COLUMN IF NOT EXISTS content_id TEXT;
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_income_records_user_sms_id ON finance.income_records(user_id, sms_id);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_income_records_user_content_id ON finance.income_records(user_id, content_id);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_user_content_id ON finance.transactions(user_id, content_id);
      `);
      // Savings Goal enrichments
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS category TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS monthly_contribution NUMERIC;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS expected_return_rate NUMERIC;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS priority TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS color TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS icon TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS strategy TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS streak_months INTEGER DEFAULT 0;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS cover_preset_key TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS cover_image_uri TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS linked_bank_id TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE wealth.savings_goals ADD COLUMN IF NOT EXISTS entries JSONB DEFAULT '[]';
      `);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS wealth.goal_history (
          id TEXT PRIMARY KEY,
          user_id UUID NOT NULL,
          goal_id TEXT NOT NULL,
          type TEXT NOT NULL,
          amount NUMERIC NOT NULL,
          note TEXT,
          at TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          is_deleted BOOLEAN DEFAULT FALSE
        );
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_goal_history_goal_user ON wealth.goal_history(goal_id, user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_goal_history_created ON wealth.goal_history(goal_id, created_at DESC);
      `);
      // Performance indexes for scale (millions of records per user)
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_user_timestamp_desc ON finance.transactions(user_id, is_deleted, timestamp DESC);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_user_bank ON finance.transactions(user_id, bank_profile_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_user_sms_id ON finance.transactions(user_id, sms_id);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_income_records_user_timestamp_desc ON finance.income_records(user_id, is_deleted, timestamp DESC);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_bank_profiles_user_active ON core.bank_profiles(user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_savings_goals_user_active ON wealth.savings_goals(user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_net_worth_snapshots_user_timestamp ON wealth.net_worth_snapshots(user_id, is_deleted, timestamp ASC);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_budget_declarations_user ON finance.budget_declarations(user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created_desc ON core.notifications(user_id, is_deleted, created_at DESC);
      `);
      // Indexes nothing reads any more, removed to save disk and make every write cheaper:
      //  - the two on the plain "merchant" column (merchants are stored encrypted now)
      //  - the two (user_id, is_deleted) ones, fully covered by the (user_id, is_deleted, timestamp) indexes
      for (const index of [
        'finance.idx_transactions_merchant_trgm',
        'finance.idx_transactions_merchant',
        'finance.idx_transactions_user_active',
        'finance.idx_income_records_user_active',
      ]) {
        await this.dataSource.query(`DROP INDEX IF EXISTS ${index};`).catch((err: any) =>
          this.logger.warn(`Could not drop unused index ${index}: ${err?.message || err}`),
        );
      }
      // User merchant learning table
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS finance.user_merchant_tags (
          id TEXT PRIMARY KEY,
          user_id UUID NOT NULL,
          merchant_normalized TEXT NOT NULL,
          tag TEXT NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          CONSTRAINT uq_user_merchant UNIQUE(user_id, merchant_normalized)
        );
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_user_merchant_lookup ON finance.user_merchant_tags(user_id, merchant_normalized);
      `);
      // Budget declarations column migrations
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS name TEXT;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS is_overall BOOLEAN DEFAULT FALSE;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS start_date BIGINT;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS end_date BIGINT;
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS period_type TEXT DEFAULT 'monthly';
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.budget_declarations ADD COLUMN IF NOT EXISTS fixed_obligations NUMERIC DEFAULT 0;
      `);
      // Budget transaction exclusions persistence table
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS finance.budget_transaction_exclusions (
          id TEXT PRIMARY KEY,
          user_id UUID NOT NULL,
          transaction_id TEXT NOT NULL,
          budget_id TEXT,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          is_deleted BOOLEAN DEFAULT FALSE,
          CONSTRAINT uq_budget_user_tx UNIQUE(user_id, transaction_id)
        );
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_budget_exclusions_user ON finance.budget_transaction_exclusions(user_id, is_deleted);
      `);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS finance.applied_ops (
          idem_key   TEXT PRIMARY KEY,
          user_id    UUID NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_applied_ops_applied_at ON finance.applied_ops (applied_at);
      `);

      // Encryption-at-Rest schema additions (idempotent hotfix)
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.user_keys (
          user_id      UUID NOT NULL,
          key_version  INTEGER NOT NULL,
          status       VARCHAR(32) NOT NULL DEFAULT 'active',
          edek         BYTEA NOT NULL,
          kms_key_arn  TEXT NOT NULL,
          created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
          rotated_at   TIMESTAMPTZ,
          PRIMARY KEY (user_id, key_version)
        );
      `);
      await this.dataSource.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_user_keys_active
        ON core.user_keys (user_id)
        WHERE status = 'active';
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.transactions
          ADD COLUMN IF NOT EXISTS enc_amount    BYTEA,
          ADD COLUMN IF NOT EXISTS enc_merchant  BYTEA,
          ADD COLUMN IF NOT EXISTS enc_note      BYTEA,
          ADD COLUMN IF NOT EXISTS merchant_idx  BYTEA,
          ADD COLUMN IF NOT EXISTS row_version   BIGINT NOT NULL DEFAULT 1;
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_transactions_user_merchant_idx
        ON finance.transactions (user_id, merchant_idx);
      `);
      await this.dataSource.query(`
        ALTER TABLE finance.income_records
          ADD COLUMN IF NOT EXISTS enc_amount   BYTEA,
          ADD COLUMN IF NOT EXISTS enc_source   BYTEA,
          ADD COLUMN IF NOT EXISTS enc_note     BYTEA,
          ADD COLUMN IF NOT EXISTS source_idx   BYTEA,
          ADD COLUMN IF NOT EXISTS row_version  BIGINT NOT NULL DEFAULT 1;
      `);
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_income_records_user_source_idx
        ON finance.income_records (user_id, source_idx);
      `);

      this.logger.log('BankProfile, SavingsGoal, Budget, Exclusion, AppliedOps & EncryptionAtRest schema checks completed successfully.');
    } catch (e: any) {
      this.logger.error(`Error checking/updating schema: ${e.message}`, e.stack);
    }
  }

  // In-memory mutex map to serialize sync requests per user
  private static userSyncLocks = new Map<string, Promise<any>>();

  private async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const prevLock = SyncService.userSyncLocks.get(userId) || Promise.resolve();
    let resolveLock: () => void;
    const currentLock = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    SyncService.userSyncLocks.set(userId, currentLock);

    try {
      await prevLock;
      return await fn();
    } finally {
      resolveLock!();
      if (SyncService.userSyncLocks.get(userId) === currentLock) {
        SyncService.userSyncLocks.delete(userId);
      }
    }
  }

  /**
   * Runs `fn` over rows 50 at a time instead of one by one. The first row runs alone so the
   * user's key is loaded (and cached) once, rather than 50 parallel key unwraps.
   */
  private async decryptInBatches<T>(rows: T[], fn: (row: T) => Promise<void>, batchSize = 50): Promise<void> {
    if (rows.length === 0) return;
    await fn(rows[0]);
    for (let i = 1; i < rows.length; i += batchSize) {
      await Promise.all(rows.slice(i, i + batchSize).map(fn));
    }
  }

  /**
   * Marks the user's data as changed, so the next GET /sync sends everything again instead of
   * "304 nothing changed". Called by the write paths below and, for every write request to
   * /sync, by SyncVersionInterceptor.
   */
  async invalidateUserSyncCache(userId: string) {
    await this.bumpSyncVersion(userId);
  }

  /**
   * Each user's sync version, kept in this server's memory (no Redis commands at all).
   * After a restart the map is empty, so every user gets a brand-new version and their phone
   * does one full sync, which is always correct. This relies on there being ONE server: with
   * several servers the version must move to a shared store again.
   */
  private static readonly syncVersions = new Map<string, number>();
  private static readonly MAX_TRACKED_VERSIONS = 50_000;

  /** A new version is the current time in microseconds: always above any earlier version. */
  private static freshSyncVersion(previous = 0): number {
    return Math.max(Date.now() * 1000, previous + 1);
  }

  /** Marks the user's data as changed. Never fails and never waits on the network. */
  async bumpSyncVersion(userId: string): Promise<void> {
    if (!userId) return;
    const versions = SyncService.syncVersions;
    if (versions.size >= SyncService.MAX_TRACKED_VERSIONS && !versions.has(userId)) versions.clear();
    versions.set(userId, SyncService.freshSyncVersion(versions.get(userId)));
  }

  /** The user's current sync version (created on first use). */
  async getSyncVersion(userId: string): Promise<string | null> {
    if (!userId) return null;
    const versions = SyncService.syncVersions;
    let version = versions.get(userId);
    if (version == null) {
      if (versions.size >= SyncService.MAX_TRACKED_VERSIONS) versions.clear();
      version = SyncService.freshSyncVersion();
      versions.set(userId, version);
    }
    return String(version);
  }

  /** Tests only. */
  static resetSyncVersionsForTest() {
    SyncService.syncVersions.clear();
  }

  /** The database's clock in milliseconds: the same clock that stamps server_changed_at. */
  private async dbNowMs(): Promise<number> {
    const rows = await this.dataSource.query(`SELECT (extract(epoch from clock_timestamp()) * 1000)::bigint AS now`);
    const now = Number(rows?.[0]?.now);
    if (!Number.isFinite(now) || now <= 0) throw new Error('database clock unavailable');
    return now;
  }

  /**
   * What GET /sync returns. With a valid `since` cursor the phone gets only what changed since
   * then; otherwise (old app, forced refresh, cursor too old, tracking not installed, or any
   * problem building the delta) it gets everything. Both replies carry the next cursor.
   */
  async syncForClient(userId: string, sinceRaw?: string | null) {
    if (!this.deltaSyncReady) return this.sync(userId);

    let cursor: number;
    try {
      cursor = await this.dbNowMs();
    } catch {
      return this.sync(userId);
    }

    const since = sinceRaw == null || sinceRaw === '' ? NaN : Number(sinceRaw);
    if (Number.isInteger(since) && since > cursor - DELTA_MAX_AGE_MS && since <= cursor + 60_000) {
      try {
        const delta = await this.syncDelta(userId, since, cursor);
        if (delta) return delta;
      } catch (err: any) {
        this.logger.warn(`Changed-only sync failed for user ${userId}, sending full data: ${err?.message || err}`);
      }
    }

    const full = await this.sync(userId);
    return { ...full, delta: false, cursor };
  }

  /**
   * Only the transactions and income that changed after `since` (deleted ones as ids), plus the
   * small lists in full (accounts, budgets, goals, exclusions). `totals` lets the phone check
   * that it ends up with exactly as many rows as the server holds, and ask for everything if not.
   * Returns null when the full data is the better answer.
   */
  async syncDelta(userId: string, since: number, cursor: number) {
    const from = since - DELTA_OVERLAP_MS;

    const [txRows, incRows, budgets, goals, bankProfiles, exclusions, counts] = await Promise.all([
      this.transactionRepository
        .createQueryBuilder('t')
        .where('t.userId = :userId', { userId })
        .andWhere('t.server_changed_at > :from', { from })
        .take(DELTA_MAX_ROWS + 1)
        .getMany(),
      this.incomeRecordRepository
        .createQueryBuilder('i')
        .where('i.userId = :userId', { userId })
        .andWhere('i.server_changed_at > :from', { from })
        .take(DELTA_MAX_ROWS + 1)
        .getMany(),
      this.budgetDeclarationRepository.find({ where: { userId, isDeleted: false } }),
      this.savingsGoalRepository.find({ where: { userId, isDeleted: false } }),
      this.bankProfileRepository.find({ where: { userId, isDeleted: false } }),
      this.budgetExclusionRepository.find({ where: { userId, isDeleted: false } }),
      this.dataSource.query(
        `SELECT
           (SELECT count(*) FROM finance.transactions WHERE user_id = $1 AND is_deleted = false) AS transactions,
           (SELECT count(*) FROM finance.income_records WHERE user_id = $1 AND is_deleted = false
              AND NOT (COALESCE(amount, 0) = 95000 AND id ~ '^income_[0-9]+_')) AS income`,
        [userId],
      ),
    ]);

    if (txRows.length > DELTA_MAX_ROWS || incRows.length > DELTA_MAX_ROWS) return null;

    const excludedTransactionIds = new Set((exclusions || []).map((e) => e.transactionId));

    const deletedTransactionIds = txRows.filter((t) => t.isDeleted).map((t) => t.id);
    const transactions: any[] = txRows.filter((t) => !t.isDeleted);
    for (const tx of transactions) tx.excludedFromBudget = excludedTransactionIds.has(tx.id);
    await this.decryptInBatches(
      transactions.filter((tx) => tx.encAmount != null),
      async (tx) => {
        try {
          const dec = await this.fieldCipherService.readTransactionDualRun(userId, tx);
          tx.amount = dec.amount;
          if (dec.merchant) tx.merchant = dec.merchant;
        } catch (e: any) {
          this.logger.error(`Tampering alert: Failed to decrypt transaction row ${tx.id}`, e.stack);
        }
      },
    );

    // Same legacy mock-income filter as the full sync
    const isMockIncome = (inc: IncomeRecord) => inc.amount === 95000 && /^income_\d+_/.test(inc.id);
    const deletedIncomeIds = incRows.filter((i) => i.isDeleted || isMockIncome(i)).map((i) => i.id);
    const incomeRecords = incRows.filter((i) => !i.isDeleted && !isMockIncome(i));
    await this.decryptInBatches(
      incomeRecords.filter((inc) => inc.encAmount != null),
      async (inc) => {
        try {
          const dec = await this.fieldCipherService.readIncomeDualRun(userId, inc);
          inc.amount = dec.amount;
          if (dec.source) inc.source = dec.source;
        } catch (e: any) {
          this.logger.error(`Tampering alert: Failed to decrypt income row ${inc.id}`, e.stack);
        }
      },
    );

    const now = Date.now();
    for (const bank of bankProfiles) {
      bank.lastSyncTimestamp = now;
      if (bank.accountType === 'Savings' && Number(bank.currentBalance) < 0) bank.currentBalance = 0;
    }

    return {
      delta: true,
      cursor,
      transactions,
      deletedTransactionIds,
      incomeRecords,
      deletedIncomeIds,
      totals: {
        transactions: Number(counts?.[0]?.transactions ?? -1),
        incomeRecords: Number(counts?.[0]?.income ?? -1),
      },
      body: bankProfiles,
      budgets,
      goals,
      bankProfiles,
      excludedTransactionIds: [...excludedTransactionIds],
    };
  }

  async sync(userId: string) {
    this.logger.debug(`Performing data synchronization for user: ${userId}`);

    const [rawTransactions, budgets, goals, bankProfiles, rawIncomeRecords, exclusions] = await Promise.all([
      this.transactionRepository.find({ where: { userId, isDeleted: false }, order: { timestamp: 'DESC' } }),
      this.budgetDeclarationRepository.find({ where: { userId, isDeleted: false } }),
      this.savingsGoalRepository.find({ where: { userId, isDeleted: false } }),
      this.bankProfileRepository.find({ where: { userId, isDeleted: false } }),
      this.incomeRecordRepository.find({ where: { userId, isDeleted: false }, order: { timestamp: 'DESC' } }),
      this.budgetExclusionRepository.find({ where: { userId, isDeleted: false } }),
    ]);

    // Purge any legacy synthetic mock income records
    const incomeRecords = (rawIncomeRecords || []).filter(
      (inc) => !(inc.amount === 95000 && /^income_\d+_/.test(inc.id)),
    );

    // Read and verify encrypted income records (in parallel batches, see decryptInBatches)
    await this.decryptInBatches(
      incomeRecords.filter((inc) => inc.encAmount != null),
      async (inc) => {
        try {
          const dec = await this.fieldCipherService.readIncomeDualRun(userId, inc);
          inc.amount = dec.amount;
          if (dec.source) inc.source = dec.source;
        } catch (e: any) {
          this.logger.error(`Tampering alert: Failed to decrypt income row ${inc.id}`, e.stack);
        }
      },
    );

    const excludedTransactionIds = new Set((exclusions || []).map((e) => e.transactionId));

    // Deduplicate only true duplicate records (identical reference ID, identical SMS hash, or exact-second collision)
    const seenTx = new Set<string>();
    const transactions: any[] = [];
    const duplicateIdsToDelete: string[] = [];

    for (const tx of rawTransactions) {
      let isDuplicate = false;
      if (tx.smsId && tx.smsId.startsWith('user_confirmed_')) {
        // Explicitly user-confirmed repeat transaction: NEVER drop or purge
        isDuplicate = false;
      } else if (tx.smsId && tx.smsId.startsWith('ref_')) {
        const refKey = `ref_${tx.bankProfileId}_${tx.smsId}`;
        if (seenTx.has(refKey)) {
          isDuplicate = true;
        } else {
          seenTx.add(refKey);
        }
      } else if (tx.smsId && tx.smsId.startsWith('sms_')) {
        // Rows with a content_id hold the exact sent time: identical text at another second is another payment
        const sentSecond = tx.contentId ? `_${Math.floor(Number(tx.timestamp || 0) / 1000)}` : '';
        const hashKey = `sms_${tx.bankProfileId}_${tx.smsId}${sentSecond}`;
        if (seenTx.has(hashKey)) {
          isDuplicate = true;
        } else {
          seenTx.add(hashKey);
        }
      } else {
        // Fallback: only duplicate if identical bank, amount, merchant, and exact timestamp (within 2 seconds)
        const tRounded = Math.floor(Number(tx.timestamp || 0) / 2000);
        const normMerchant = (tx.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const exactSig = `${tx.bankProfileId}_${Math.round(Number(tx.amount) * 100)}_${normMerchant}_${tRounded}`;
        if (seenTx.has(exactSig)) {
          isDuplicate = true;
        } else {
          seenTx.add(exactSig);
        }
      }

      if (isDuplicate) {
        duplicateIdsToDelete.push(tx.id);
        continue;
      }
      (tx as any).excludedFromBudget = excludedTransactionIds.has(tx.id);
      transactions.push(tx);
    }

    // Decrypt the kept rows (duplicates were skipped above, as before) in parallel batches
    await this.decryptInBatches(
      transactions.filter((tx) => tx.encAmount != null),
      async (tx) => {
        try {
          const dec = await this.fieldCipherService.readTransactionDualRun(userId, tx);
          tx.amount = dec.amount;
          if (dec.merchant) tx.merchant = dec.merchant;
        } catch (e: any) {
          this.logger.error(`Tampering alert: Failed to decrypt transaction row ${tx.id}`, e.stack);
        }
      },
    );

    if (duplicateIdsToDelete.length > 0) {
      this.logger.log(`Cleaning up ${duplicateIdsToDelete.length} duplicate transactions for user: ${userId}`);
      this.transactionRepository.update(
        { id: In(duplicateIdsToDelete), userId },
        { isDeleted: true, updatedAt: Date.now() },
      ).catch((err) => this.logger.warn(`Failed to soft-delete duplicate transactions: ${err.message}`));
    }

    const now = Date.now();
    for (const bank of bankProfiles) {
      bank.lastSyncTimestamp = now;
      if (bank.accountType === 'Savings' && Number(bank.currentBalance) < 0) {
        // Shown as 0, but the stored value is left alone and logged: a negative savings
        // balance means the tracked balance has drifted and should be looked at, not hidden.
        this.logger.warn(`Savings balance below zero for bank ${bank.id} (user ${userId}): ${bank.currentBalance}`);
        bank.currentBalance = 0;
      }
    }

    const result = {
      transactions,
      body: bankProfiles, // Keep matching controller structures if they expect specific returns
      budgets,
      goals,
      bankProfiles,
      incomeRecords,
      excludedTransactionIds: [...excludedTransactionIds],
    };

    return result;
  }

  /**
   * Ids are chosen by the phone and are unique across all users. Before saving a new row under
   * such an id, make sure the id is not already someone else's row: saving would otherwise
   * overwrite that row and hand it to the caller.
   */
  private async assertIdNotOwnedByAnother(repo: Repository<any>, id: unknown, userId: string) {
    if (id == null || id === '') return;
    if (typeof id !== 'string' || id.length > 120) throw new BadRequestException('Invalid id.');
    const row = await repo.findOne({ where: { id }, select: { id: true, userId: true } });
    if (row && row.userId !== userId) {
      throw new ConflictException('This item could not be saved. Please try again.');
    }
  }

  /** Statement and screenshot scans use the AI: each person gets a daily number of them. */
  async assertScanQuota(userId: string) {
    const quota = await this.aiService.consumeDailyQuota(userId, 'scan');
    if (!quota.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'AI_SCAN_LIMIT',
          message: `You've scanned ${quota.limit} statements or screenshots today, which is the daily limit. It resets at midnight.`,
          limit: quota.limit,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  /**
   * A row the 30-day purge erased must not come back from an old device or a stale screen.
   * New items always get new IDs, so this never blocks real new data.
   */
  private async rejectIfErased(table: string, id: string | null | undefined) {
    if (await isErasedRow(this.dataSource, table, id)) {
      throw new GoneException('This item was deleted and can no longer be changed.');
    }
  }

  async createBankProfile(
    userId: string,
    data: {
      id: string;
      bankName: string;
      accountNumberSuffix: string;
      currentBalance: number;
      accountType?: string;
      smsSenderId?: string;
      upiId?: string;
      customKeywords?: string;
      smsConsent?: boolean;
    },
  ) {
    this.logger.log(`Creating/updating bank profile for user: ${userId} (${data.id})`);
    await this.rejectIfErased('core.bank_profiles', data.id);

    let existing = await this.bankProfileRepository.findOne({
      where: [
        { id: data.id, userId, isDeleted: false },
        { userId, bankName: data.bankName, accountNumberSuffix: data.accountNumberSuffix, isDeleted: false },
      ],
    });

    if (existing) {
      existing.bankName = data.bankName;
      existing.accountNumberSuffix = data.accountNumberSuffix;
      existing.currentBalance = Math.round(Number(data.currentBalance || 0) * 100) / 100;
      existing.accountType = data.accountType || existing.accountType || 'Savings';
      existing.smsSenderId = data.smsSenderId || null;
      existing.upiId = data.upiId || null;
      existing.customKeywords = data.customKeywords || null;
      if (data.smsConsent !== undefined) {
        existing.smsConsent = data.smsConsent;
      }
      existing.updatedAt = Date.now();
      await this.invalidateUserSyncCache(userId);
      return this.bankProfileRepository.save(existing);
    }

    await this.assertIdNotOwnedByAnother(this.bankProfileRepository, data.id, userId);
    const bankProfile = this.bankProfileRepository.create({
      id: data.id,
      userId,
      bankName: data.bankName,
      accountType: data.accountType || 'Savings',
      accountNumberSuffix: data.accountNumberSuffix,
      currentBalance: Math.round(Number(data.currentBalance || 0) * 100) / 100,
      smsSenderId: data.smsSenderId || null,
      upiId: data.upiId || null,
      customKeywords: data.customKeywords || null,
      smsConsent: data.smsConsent !== undefined ? data.smsConsent : true,
      lastSyncTimestamp: Date.now(),
      updatedAt: Date.now(),
      isDeleted: false,
    });
    await this.invalidateUserSyncCache(userId);
    return this.bankProfileRepository.save(bankProfile);
  }

  async deleteBankProfile(userId: string, id: string) {
    this.logger.log(`Deleting bank profile: ${id} for user: ${userId}`);
    // Only the owner's own account: never look the id up without the user
    const bankProfile = await this.bankProfileRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!bankProfile) {
      throw new BadRequestException('Bank profile not found or already deleted.');
    }
    bankProfile.isDeleted = true;
    bankProfile.updatedAt = Date.now();
    await this.bankProfileRepository.save(bankProfile);
    await this.invalidateUserSyncCache(userId);
    return { success: true, message: 'Bank account unlinked successfully.' };
  }

  async getNetWorthSnapshots(userId: string) {
    this.logger.log(`Fetching net worth snapshots for user: ${userId}`);
    return this.netWorthSnapshotRepository.find({
      where: { userId, isDeleted: false },
      order: { timestamp: 'ASC' },
    });
  }

  async getIncomeRecords(userId: string) {
    this.logger.log(`Fetching income records for user: ${userId}`);
    const records = await this.incomeRecordRepository.find({
      where: { userId, isDeleted: false },
      order: { timestamp: 'DESC' },
    });
    const filtered = (records || []).filter(
      (inc) => !(inc.amount === 95000 && /^income_\d+_/.test(inc.id)),
    );
    for (const inc of filtered) {
      if (inc.encAmount != null) {
        try {
          const dec = await this.fieldCipherService.readIncomeDualRun(userId, inc);
          inc.amount = dec.amount;
          if (dec.source) inc.source = dec.source;
        } catch (e: any) {
          this.logger.error(`Tampering alert: Failed to decrypt income row ${inc.id}`, e.stack);
        }
      }
    }
    return filtered;
  }

  async updateTransactionCategory(
    userId: string,
    id: string,
    category: string,
    merchant?: string,
    updateMerchantRule: boolean = false,
  ) {
    const tx = await this.transactionRepository.findOne({ where: { id, userId, isDeleted: false } });
    if (!tx) {
      throw new BadRequestException('Transaction not found or deleted.');
    }
    tx.category = category;
    tx.updatedAt = Date.now();
    await this.transactionRepository.save(tx);
    await this.invalidateUserSyncCache(userId);

    const targetMerchant = merchant || tx.merchant;
    if (targetMerchant && updateMerchantRule === true) {
      await this.saveMerchantTagRule(userId, targetMerchant, category).catch(() => {});
    }

    return tx;
  }

  async saveMerchantTagRule(userId: string, merchant: string, tag: string) {
    if (!merchant || !tag) return null;
    const norm = merchant
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!norm) return null;

    let existing = await this.userMerchantTagRepository.findOne({
      where: { userId, merchantNormalized: norm },
    });

    const now = Date.now();
    if (existing) {
      existing.tag = tag;
      existing.updatedAt = now;
      await this.userMerchantTagRepository.save(existing);
      this.logger.log(`Updated merchant tag rule for user ${userId}: "${norm}" -> "${tag}"`);
      return existing;
    }

    const newRule = this.userMerchantTagRepository.create({
      id: `rule_${now}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      merchantNormalized: norm,
      tag,
      createdAt: now,
      updatedAt: now,
    });
    await this.userMerchantTagRepository.save(newRule);
    this.logger.log(`Created new merchant tag rule for user ${userId}: "${norm}" -> "${tag}"`);
    return newRule;
  }

  async deleteMerchantTagRule(userId: string, merchant: string) {
    if (!merchant) return { success: false };
    const norm = merchant
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!norm) return { success: false };

    const existing = await this.userMerchantTagRepository.findOne({
      where: { userId, merchantNormalized: norm },
    });
    if (existing) {
      await this.userMerchantTagRepository.remove(existing);
      this.logger.log(`Deleted merchant tag rule for user ${userId}: "${norm}"`);
    }
    return { success: true };
  }

  async getUserMerchantTagRules(userId: string) {
    if (!userId) return [];
    return this.userMerchantTagRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  async syncOcrTransactions(userId: string, data: OcrSyncDto) {
    // App builds before /sync/sms-catchup send inbox re-scans here. SMS rows carry a text hash;
    // statement and screenshot rows never do. Route them to SMS rules (outside the lock: it takes its own).
    if (data.transactions?.length > 0 && data.transactions.every((t) => !!t.contentId)) {
      return this.syncSmsCatchup(userId, data);
    }
    return this.withUserLock(userId, async () => {
      this.logger.log(`Syncing OCR transactions for user ${userId}, bank: ${data.bankProfileId || 'unassigned'}`);
      
      const isUnassigned = !data.bankProfileId || data.bankProfileId === 'unassigned';
      let bank: BankProfile | null = null;
      if (!isUnassigned) {
        bank = await this.bankProfileRepository.findOne({
          where: { id: data.bankProfileId, userId, isDeleted: false },
        });
        if (!bank) {
          throw new BadRequestException('Bank account profile not found.');
        }
      }

      const [existingTxs, existingIncome] = await Promise.all([
        this.transactionRepository.find({
          where: isUnassigned
            ? { userId, isDeleted: false }
            : { userId, bankProfileId: data.bankProfileId, isDeleted: false },
        }),
        this.incomeRecordRepository.find({
          where: isUnassigned
            ? { userId, isDeleted: false }
            : { userId, bankProfileId: data.bankProfileId, isDeleted: false },
        }),
      ]);

      for (const tx of existingTxs) {
        if (tx.encAmount != null) {
          try {
            const dec = await this.fieldCipherService.readTransactionDualRun(userId, tx);
            tx.amount = dec.amount;
            if (dec.merchant) tx.merchant = dec.merchant;
          } catch {}
        }
      }
      for (const inc of existingIncome) {
        if (inc.encAmount != null) {
          try {
            const dec = await this.fieldCipherService.readIncomeDualRun(userId, inc);
            inc.amount = dec.amount;
            if (dec.source) inc.source = dec.source;
          } catch {}
        }
      }

      let addedTransactionsCount = 0;
      let addedIncomeCount = 0;
      let netBalanceChange = 0;

      const newTransactions: Transaction[] = [];
      const newIncomeRecords: IncomeRecord[] = [];

      // Pre-fetch user merchant tag rules once to eliminate N+1 queries in the loop
      const preloadedRules = userId
        ? await this.userMerchantTagRepository.find({ where: { userId } }).catch(() => [])
        : [];

      // Helper to compute exact millisecond timestamp from date, time, and client timestamp
      const parseExactTimestamp = (dateStr?: string, timeStr?: string | null, clientTimestamp?: number | null, index = 0): number => {
        if (clientTimestamp && !isNaN(Number(clientTimestamp)) && Number(clientTimestamp) > 0) {
          const clientMs = Number(clientTimestamp);
          const cDate = new Date(clientMs);
          // If the timestamp came without seconds (seconds === 0 and ms === 0), add sequential second offset
          if (cDate.getSeconds() === 0 && cDate.getMilliseconds() === 0 && index > 0) {
            return clientMs + (index * 1000);
          }
          return clientMs;
        }
        if (!dateStr) return Date.now();

        const now = new Date();
        const currentYear = now.getFullYear();

        let year = currentYear;
        let month = now.getMonth();
        let day = now.getDate();

        const trimmed = dateStr.trim();
        const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
        const dmyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
        const textMatch = trimmed.match(/^(\d{1,2})\s*[-/.\s]?\s*([a-zA-Z]+)(?:\s*[-/.\s]?\s*(\d{2,4}))?$/);

        const MONTH_MAP: Record<string, number> = {
          jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
          jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        };

        if (isoMatch) {
          year = parseInt(isoMatch[1], 10);
          month = parseInt(isoMatch[2], 10) - 1;
          day = parseInt(isoMatch[3], 10);
        } else if (dmyMatch) {
          day = parseInt(dmyMatch[1], 10);
          month = parseInt(dmyMatch[2], 10) - 1;
          year = parseInt(dmyMatch[3], 10);
          if (year < 100) year += 2000;
        } else if (textMatch) {
          day = parseInt(textMatch[1], 10);
          const mStr = textMatch[2].toLowerCase().slice(0, 3);
          month = MONTH_MAP[mStr] !== undefined ? MONTH_MAP[mStr] : now.getMonth();
          if (textMatch[3]) {
            let yVal = parseInt(textMatch[3], 10);
            if (yVal < 100) yVal += 2000;
            year = yVal;
          } else {
            year = currentYear;
          }
        } else {
          const d = new Date(trimmed);
          if (!isNaN(d.getTime())) {
            year = d.getFullYear();
            month = d.getMonth();
            day = d.getDate();
          }
        }

        // Safety clamp: if older than currentYear - 1 or in future, default to currentYear
        if (year < currentYear - 1 || year > currentYear + 1) {
          year = currentYear;
        }

        let hours = 12;
        let minutes = 0;
        let seconds = 0;

        if (timeStr && timeStr.trim()) {
          const rawTime = timeStr.trim();
          const ampmMatch = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
          if (ampmMatch) {
            let h = parseInt(ampmMatch[1], 10);
            const m = parseInt(ampmMatch[2], 10);
            const s = ampmMatch[3] ? parseInt(ampmMatch[3], 10) : (index % 60);
            const ampm = ampmMatch[4]?.toLowerCase();
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            if (!isNaN(h) && !isNaN(m)) {
              hours = h;
              minutes = m;
              seconds = isNaN(s) ? (index % 60) : s;
            }
          }
        } else {
          // Statements without times: distribute by 1-second index offset to preserve exact statement sequence
          seconds = (index % 60);
          minutes = Math.floor(index / 60) % 60;
          hours = 12 + Math.floor(index / 3600);
        }

        const resDate = new Date(year, month, day, hours, minutes, seconds);
        return isNaN(resDate.getTime()) ? (Date.now() + index * 1000) : resDate.getTime();
      };

      for (let idx = 0; idx < data.transactions.length; idx++) {
        const item = data.transactions[idx];
        const amount = parseFloat(String(item.amount));
        if (isNaN(amount) || amount <= 0) continue;

        const exactTimestamp = parseExactTimestamp(item.date, item.time, item.timestamp, idx);
        const parsedDate = new Date(exactTimestamp);
        if (isNaN(parsedDate.getTime())) continue;

        const startOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 0, 0, 0, 0).getTime();
        const endOfDay = new Date(parsedDate.getFullYear(), parsedDate.getMonth(), parsedDate.getDate(), 23, 59, 59, 999).getTime();

        const itemRef = item.referenceId ? String(item.referenceId).trim() : undefined;
        const itemSmsId = item.smsId || (itemRef ? `ref_${itemRef}` : undefined);
        const normItemMerchant = (item.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const isSameSms = (storedSmsId?: string | null): boolean =>
          !!storedSmsId &&
          ((!!item.smsId && storedSmsId === item.smsId) || (!!item.contentId && storedSmsId === item.contentId));

        const itemDate = new Date(exactTimestamp);
        const hasExplicitItemTime = !!(item.time && item.time.trim());

        const isIdenticalDebit = (tx: Transaction): boolean => {
          if (isSameSms(tx.smsId)) return true;
          if (itemRef && (tx.smsId === `ref_${itemRef}` || tx.smsId === itemRef || (tx as any).referenceId === itemRef)) return true;
          return false;
        };

        const isIdenticalCredit = (inc: IncomeRecord): boolean => {
          if (isSameSms((inc as any).smsId)) return true;
          if (itemRef && ((inc as any).smsId === `ref_${itemRef}` || (inc as any).smsId === itemRef || (inc as any).referenceId === itemRef)) return true;
          return false;
        };

        if (item.type === 'debit') {
          // Exact same SMS or Reference ID already processed — silently skip as idempotent no-op!
          if (existingTxs.some(isIdenticalDebit) || newTransactions.some(isIdenticalDebit)) {
            continue;
          }

          const checkDebitDuplicate = (tx: Transaction, isBatchCheck = false): boolean => {
            if (itemRef && tx.smsId && tx.smsId.startsWith('ref_') && tx.smsId !== `ref_${itemRef}`) return false;

            // 2. Intra-statement check (Comparing against another transaction from the same upload batch):
            if (isBatchCheck) {
              // Mathematical proof: if running balances differ, they are distinct ledger entries
              if (item.balanceAfter != null && (tx as any)._balanceAfter != null) {
                if (Math.abs(item.balanceAfter - (tx as any)._balanceAfter) > 0.01) {
                  return false;
                }
              }
              // Separate rows in the same certified statement without matching reference IDs are genuine distinct payments
              return false;
            }

            // 3. Historical check against existing database transactions:
            const txTime = Number(tx.timestamp);
            const sameAmount = Math.abs(tx.amount - amount) < 0.01;
            // Strict calendar day check: different calendar days are NEVER duplicates
            const isSameDay = txTime >= startOfDay && txTime <= endOfDay;
            if (!sameAmount || !isSameDay) return false;

            const normTxMerchant = (tx.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normTxMerchant && normItemMerchant && normTxMerchant !== normItemMerchant) return false;

            // If both transactions have explicit times (to the minute) and differ by > 2 minutes, NOT a duplicate
            const txDate = new Date(txTime);
            const hasExplicitTxTime = txDate.getHours() !== 12 || txDate.getMinutes() !== 0 || txDate.getSeconds() !== 0;
            if (hasExplicitTxTime && hasExplicitItemTime) {
              const diffMinutes = Math.abs(txTime - exactTimestamp) / 60000;
              if (diffMinutes > 2) return false;
            }

            return true;
          };

          const isDuplicate = existingTxs.some((tx) => checkDebitDuplicate(tx, false)) ||
                              newTransactions.some((tx) => checkDebitDuplicate(tx, true));

          if (!isDuplicate) {
            const txId = 'tx_ocr_' + Math.random().toString(36).substr(2, 9);
            const newTx = this.transactionRepository.create({
              id: txId,
              userId,
              amount,
              category: item.category || (item.merchant ? await this.classifyCategory(item.merchant, userId, preloadedRules) : 'miscellaneous'),
              merchant: item.merchant || 'Merchant',
              timestamp: exactTimestamp,
              bankProfileId: isUnassigned ? null : data.bankProfileId,
              smsId: itemSmsId || 'ocr_extracted',
              isAnomaly: amount > 5000,
              status: 'cleared',
              updatedAt: Date.now(),
              isDeleted: false,
            });
            (newTx as any)._balanceAfter = item.balanceAfter;
            newTransactions.push(newTx);
            addedTransactionsCount++;
            netBalanceChange -= amount;
          } else {
            // Do NOT silently drop! Dispatch an interactive duplicate alert under 'To review'
            const timeStr = new Date(exactTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.notificationsService.sendNotification(userId, {
              title: `Potential Duplicate: ₹${amount}`,
              body: `We noticed another ₹${amount} at ${item.merchant || 'Merchant'} around ${timeStr} in your uploaded statement. Add this transaction?`,
              type: 'review',
              payload: {
                action: 'duplicate_transaction_review',
                source: 'upload',
                transactionData: {
                  amount,
                  type: 'debit',
                  merchant: item.merchant || 'Merchant',
                  category: item.category || 'miscellaneous',
                  timestamp: exactTimestamp,
                  bankProfileId: isUnassigned ? null : data.bankProfileId,
                  smsId: itemSmsId || 'ocr_duplicate_review',
                  referenceId: itemRef || undefined,
                  balanceAfter: item.balanceAfter != null ? item.balanceAfter : undefined,
                },
              },
            }).catch((err) => this.logger.warn(`Failed to dispatch duplicate alert: ${err.message}`));
          }
        } else if (item.type === 'credit') {
          // Exact same SMS or Reference ID already processed — silently skip as idempotent no-op!
          if (existingIncome.some(isIdenticalCredit) || newIncomeRecords.some(isIdenticalCredit)) {
            continue;
          }

          const checkCreditDuplicate = (inc: IncomeRecord, isBatchCheck = false): boolean => {
            if (itemRef && (inc as any).smsId && (inc as any).smsId.startsWith('ref_') && (inc as any).smsId !== `ref_${itemRef}`) return false;

            if (isBatchCheck) {
              if (item.balanceAfter != null && (inc as any)._balanceAfter != null) {
                if (Math.abs(item.balanceAfter - (inc as any)._balanceAfter) > 0.01) {
                  return false;
                }
              }
              return false;
            }

            const incTime = Number(inc.timestamp);
            const sameAmount = Math.abs(inc.amount - amount) < 0.01;
            // Strict calendar day check: different calendar days are NEVER duplicates
            const isSameDay = incTime >= startOfDay && incTime <= endOfDay;
            if (!sameAmount || !isSameDay) return false;

            const normIncSource = (inc.source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            if (normIncSource && normItemMerchant && normIncSource !== normItemMerchant) return false;

            const incDate = new Date(incTime);
            const hasExplicitIncTime = incDate.getHours() !== 12 || incDate.getMinutes() !== 0 || incDate.getSeconds() !== 0;
            if (hasExplicitIncTime && hasExplicitItemTime) {
              const diffMinutes = Math.abs(incTime - exactTimestamp) / 60000;
              if (diffMinutes > 2) return false;
            }

            return true;
          };

          const isDuplicate = existingIncome.some((inc) => checkCreditDuplicate(inc, false)) ||
                              newIncomeRecords.some((inc) => checkCreditDuplicate(inc, true));

          if (!isDuplicate) {
            const incId = 'income_ocr_' + Math.random().toString(36).substr(2, 9);
            const newInc = this.incomeRecordRepository.create({
              id: incId,
              userId,
              amount,
              source: item.merchant || 'Direct Credit',
              category: item.category ? item.category.toLowerCase() : 'money_received',
              timestamp: exactTimestamp,
              bankProfileId: isUnassigned ? null : data.bankProfileId,
              updatedAt: Date.now(),
              isDeleted: false,
            });
            (newInc as any)._balanceAfter = item.balanceAfter;
            newIncomeRecords.push(newInc);
            addedIncomeCount++;
            netBalanceChange += amount;
          } else {
            const timeStr = new Date(exactTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            this.notificationsService.sendNotification(userId, {
              title: `Potential Duplicate: ₹${amount}`,
              body: `We noticed another credit of ₹${amount} from ${item.merchant || 'Direct Credit'} around ${timeStr}. Add this income?`,
              type: 'review',
              payload: {
                action: 'duplicate_transaction_review',
                source: 'upload',
                transactionData: {
                  amount,
                  type: 'credit',
                  merchant: item.merchant || 'Direct Credit',
                  category: 'salary',
                  timestamp: exactTimestamp,
                  bankProfileId: isUnassigned ? null : data.bankProfileId,
                  smsId: itemSmsId || 'ocr_duplicate_review',
                  referenceId: itemRef || undefined,
                  balanceAfter: item.balanceAfter != null ? item.balanceAfter : undefined,
                },
              },
            }).catch((err) => this.logger.warn(`Failed to dispatch duplicate alert: ${err.message}`));
          }
        }
      }

    if (!isUnassigned && bank) {
      if (data.applyBalanceChange === false) {
        // User explicitly toggled off balance update -> retain current balance
        this.logger.log(`User toggled off balance update for bank ${bank.bankName}. Balance preserved at ${bank.currentBalance}`);
      } else if (data.updatedBalance !== undefined && data.updatedBalance !== null && !isNaN(Number(data.updatedBalance))) {
        // Direct authoritative or user-confirmed updated balance
        bank.currentBalance = Math.round(parseFloat(String(data.updatedBalance)) * 100) / 100;
        bank.lastSyncTimestamp = Date.now();
        bank.updatedAt = Date.now();
        await this.bankProfileRepository.save(bank);
      } else if (addedTransactionsCount > 0 || addedIncomeCount > 0) {
        // Fallback: apply net flow of imported transactions directly to balance
        let applicableChange = 0;
        for (const tx of newTransactions) {
          applicableChange -= tx.amount;
        }
        for (const inc of newIncomeRecords) {
          applicableChange += inc.amount;
        }

        if (applicableChange !== 0) {
          const updatedBal = Math.round((parseFloat(String(bank.currentBalance || 0)) + applicableChange) * 100) / 100;
          bank.currentBalance = updatedBal;
          bank.lastSyncTimestamp = Date.now();
          bank.updatedAt = Date.now();
          await this.bankProfileRepository.save(bank);
        }
      }
    }

    if (newTransactions.length > 0) {
      for (const tx of newTransactions) {
        const rawAmt = tx.amount;
        const rawMerch = tx.merchant;
        const enc = await this.fieldCipherService.encryptTransactionFields(
          userId,
          tx.id,
          { amount: rawAmt, merchant: rawMerch },
        );
        tx.encAmount = enc.encAmount;
        tx.encMerchant = enc.encMerchant;
        tx.merchantIdx = enc.merchantIdx;
        tx.rowVersion = enc.rowVersion;
        (tx as any).amount = null;
        (tx as any).merchant = null;
      }
      await this.transactionRepository.save(newTransactions);
    }
    if (newIncomeRecords.length > 0) {
      for (const inc of newIncomeRecords) {
        const rawAmt = inc.amount;
        const rawSource = inc.source;
        const enc = await this.fieldCipherService.encryptIncomeFields(
          userId,
          inc.id,
          { amount: rawAmt, source: rawSource },
        );
        inc.encAmount = enc.encAmount;
        inc.encSource = enc.encSource;
        inc.sourceIdx = enc.sourceIdx;
        inc.rowVersion = enc.rowVersion;
        (inc as any).amount = null;
        (inc as any).source = null;
      }
      await this.incomeRecordRepository.save(newIncomeRecords);
    }

    await this.invalidateUserSyncCache(userId);

    return {
      success: true,
      addedTransactionsCount,
      addedIncomeCount,
      updatedBalance: bank ? bank.currentBalance : null,
    };
    });
  }

  private async classifyCategory(
    merchantName: string,
    userId?: string,
    preloadedUserRules?: Array<{ merchantNormalized: string; tag: string }>
  ): Promise<string> {
    const name = (merchantName || '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!name) return 'miscellaneous';

    // 1. Check preloaded user rules (in-memory to eliminate N+1 database queries)
    if (preloadedUserRules && preloadedUserRules.length > 0) {
      const direct = preloadedUserRules.find((r) => r.merchantNormalized === name);
      if (direct && direct.tag) {
        return direct.tag;
      }
      const fuzzy = preloadedUserRules.find(
        (r) => name.includes(r.merchantNormalized) || r.merchantNormalized.includes(name)
      );
      if (fuzzy && fuzzy.tag) {
        return fuzzy.tag;
      }
    } else if (userId) {
      // Fallback: Check user learned memory if userId provided and no preloaded rules
      try {
        const learned = await this.userMerchantTagRepository.findOne({
          where: { userId, merchantNormalized: name },
        });
        if (learned && learned.tag) {
          return learned.tag;
        }

        const allUserRules = await this.userMerchantTagRepository.find({
          where: { userId },
        });
        for (const rule of allUserRules) {
          if (name.includes(rule.merchantNormalized) || rule.merchantNormalized.includes(name)) {
            return rule.tag;
          }
        }
      } catch (err: any) {
        this.logger.warn(`Failed to check user merchant rules: ${err.message}`);
      }
    }

    // 2. 30+ Indian merchant & category keyword rules
    if (/blinkit|zepto|instamart|bigbasket|dmart|supermarket|kirana|provision|nature basket|spencer|more retail|dairy|milk|fruits|vegetable|bakery/.test(name)) {
      return 'groceries';
    }
    if (/zomato|swiggy|starbucks|mcdonald|burger king|kfc|pizza hut|domino|haldiram|subway|barbeque|cafe|restaurant|dhaba|tea|chai|coffee|bhojanalaya|biryani|sweets|tiffin|canteen|dining/.test(name)) {
      return 'food';
    }
    if (/uber|ola|rapido|metro|chalo|fastag|toll|parking|auto|taxi|ride|cab|transit/.test(name)) {
      return 'commute';
    }
    if (/indian oil|iocl|bharat petroleum|bpcl|hindustan petroleum|hpcl|shell|petrol|diesel|cng|fuel|gas station/.test(name)) {
      return 'fuel';
    }
    if (/makemytrip|goibibo|easemytrip|irctc|yatra|indigo|air india|vistara|spicejet|akasa|hotel|flight|resort|train ticket|railways|bus|redbus/.test(name)) {
      return 'travel';
    }
    if (/amazon|flipkart|myntra|ajio|nykaa|tata cliq|meesho|zara|h&m|uniqlo|shoppers stop|lifestyle|max fashion|westside|decathlon|croma|reliance digital|mall|store|clothing|apparel/.test(name)) {
      return 'shopping';
    }
    if (/netflix|prime video|hotstar|disney|spotify|pvr|inox|cinepolis|bookmyshow|sonyliv|zee5|youtube|gaming|steam|playstation|movies/.test(name)) {
      return 'entertainment';
    }
    if (/apollo|pharmeasy|1mg|netmeds|medplus|hospital|clinic|diagnostic|doctor|pharmacy|chemist|pathology|lab|health|dental|opticals/.test(name)) {
      return 'medical';
    }
    if (/jio|airtel|vodafone|vi bill|bsnl|tatasky|tata play|dth|dish tv|broadband|act fibernet|hathway|recharge|mobile bill/.test(name)) {
      return 'bill_payments';
    }
    if (/bescom|tata power|adani electricity|bses|mahavitaran|wbsetcl|uppcl|water board|igl|indraprastha gas|mahanagar gas|piped gas|electricity|cylinder|hp gas|indane|bharat gas/.test(name)) {
      return 'utilities';
    }
    if (/nobroker|magicbricks|housing|house rent|flat rent|society maintenance|landlord|rent payment/.test(name)) {
      return 'rent';
    }
    if (/bajaj finserv|home credit|kreditbee|lazypay|simpl|loan|emi|finance emi|car loan|personal loan/.test(name)) {
      return 'emi_loans';
    }
    if (/zerodha|groww|upstox|angelone|indmoney|motilal oswal|demat|brokerage|sharekhan/.test(name)) {
      return 'financial_services';
    }
    if (/lic|hdfc ergo|icici lombard|star health|policybazaar|care health|max life|sbi life|insurance premium/.test(name)) {
      return 'insurance';
    }
    if (/mutual fund|sip|fixed deposit|recurring deposit|sgb|gold bond|nps|ppf|crypto|coin|securities/.test(name)) {
      return 'investment';
    }
    if (/school|college|university|tuition|coaching|fees|unacademy|byju|coursera|udemy/.test(name)) {
      return 'education';
    }
    if (/cult\.fit|cure\.fit|gold gym|anytime fitness|gym|fitness|yoga|crossfit|sports club|protein/.test(name)) {
      return 'fitness';
    }
    if (/salon|spa|urban company|geetanjali|enrich|barber|parlour|grooming|haircut|cosmetics/.test(name)) {
      return 'personal_care';
    }
    if (/atm|cash wdl|cash withdrawal|nfs cash/.test(name)) {
      return 'cash_withdrawals';
    }
    if (/salary|payroll|stipend|employer|batchid|wages/.test(name)) {
      return 'salary';
    }
    if (/cashback|refund|reversal|reward|promo credit/.test(name)) {
      return 'cashback';
    }
    if (/interest|savings bank interest|fd interest|int\.pd/.test(name)) {
      return 'interest';
    }

    return 'miscellaneous';
  }

  async processScreenshotUpload(userId: string, bankProfileId: string, imageBuffer: Buffer, mimeType: string) {
    this.logger.log(`Extracting screenshot data via Vision AI for user ${userId}, bank: ${bankProfileId}`);
    const bank = await this.bankProfileRepository.findOne({
      where: { id: bankProfileId, userId, isDeleted: false },
    });
    if (!bank) {
      throw new BadRequestException('Bank account profile not found.');
    }

    const ocrResult = await this.aiService.parseImageOcr(imageBuffer, mimeType || 'image/jpeg');
    if (!ocrResult.isValid || !ocrResult.transactions || ocrResult.transactions.length === 0) {
      const errorMsg = ocrResult.rejectionReason || 'No transactions could be extracted from this screenshot. Please upload a clear bank transaction screenshot.';
      this.logger.warn(`[Screenshot Validation Rejection] User: ${userId}, Reason: ${errorMsg}`);
      throw new BadRequestException(errorMsg);
    }

    const userRules = await this.userMerchantTagRepository.find({
      where: { userId },
    }).catch(() => []);

    const enrichedTransactions = await Promise.all(
      ocrResult.transactions.map(async (tx, idx) => ({
        id: `extracted_${Date.now()}_${idx}`,
        date: tx.date,
        time: tx.time ?? null,
        timestamp: tx.timestamp ?? null,
        amount: tx.amount,
        type: tx.type,
        merchant: tx.merchant,
        category: tx.category || (await this.classifyCategory(tx.merchant, userId, userRules)),
        balanceAfter: tx.balanceAfter ?? null,
        referenceId: tx.referenceId ?? null,
      }))
    );

    return {
      success: true,
      bankProfileId,
      detectedFinalBalance: ocrResult.finalDetectedBalance ?? null,
      transactions: enrichedTransactions,
    };
  }

  async syncStatementFile(userId: string, bankProfileId: string, fileBuffer: Buffer, mimeType?: string, password?: string) {
    this.logger.log(`Extracting bank statement data for user ${userId}, bank: ${bankProfileId}`);

    const bank = await this.bankProfileRepository.findOne({
      where: { id: bankProfileId, userId, isDeleted: false },
    });
    if (!bank) {
      throw new BadRequestException('Bank account profile not found.');
    }

    let transactions: any[] = [];
    let detectedFinalBalance: number | null = null;

    if (mimeType && mimeType.startsWith('image/')) {
      const ocrResult = await this.aiService.parseImageOcr(fileBuffer, mimeType);
      if (!ocrResult.isValid || !ocrResult.transactions || ocrResult.transactions.length === 0) {
        const errorMsg = ocrResult.rejectionReason || 'No transactions could be extracted from this statement image. Please upload a clear bank statement photo.';
        this.logger.warn(`[Statement Image Validation Rejection] User: ${userId}, Reason: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }
      transactions = ocrResult.transactions;
      detectedFinalBalance = ocrResult.finalDetectedBalance ?? null;
    } else {
      // Strict Data Minimization: Statement passwords (DOB/PAN/phone) are NEVER stored in the database.
      // Password is used strictly in-memory to decrypt the PDF buffer and discarded immediately.
      const passwordToUse = password || '';
      let extractedText = '';

      // Scrub legacy stored password from DB if one existed on this profile
      if (bank.statementPassword) {
        bank.statementPassword = null;
        await this.bankProfileRepository.save(bank).catch(() => {});
      }

      extractedText = await this.extractTextFromPdfBuffer(fileBuffer, passwordToUse);

      // Structure extracted PDF text using backend AI
      const statementResult = await this.aiService.parseStatementText(extractedText);
      if (!statementResult.isValid || !statementResult.transactions || statementResult.transactions.length === 0) {
        const errorMsg = statementResult.rejectionReason || 'No transactions could be structured from this statement. Please verify the PDF format.';
        this.logger.warn(`[Statement PDF Validation Rejection] User: ${userId}, Reason: ${errorMsg}`);
        throw new BadRequestException(errorMsg);
      }
      transactions = statementResult.transactions;
      detectedFinalBalance = statementResult.finalDetectedBalance ?? null;
    }

    const userRules = await this.userMerchantTagRepository.find({
      where: { userId },
    }).catch(() => []);

    const enrichedTransactions = await Promise.all(
      transactions.map(async (tx, idx) => ({
        id: `extracted_${Date.now()}_${idx}`,
        date: tx.date,
        time: tx.time ?? null,
        timestamp: tx.timestamp ?? null,
        amount: tx.amount,
        type: tx.type,
        merchant: tx.merchant,
        category: tx.category || (await this.classifyCategory(tx.merchant, userId, userRules)),
        balanceAfter: tx.balanceAfter ?? null,
        referenceId: tx.referenceId ?? null,
      }))
    );

    return {
      success: true,
      bankProfileId,
      detectedFinalBalance,
      transactions: enrichedTransactions,
    };
  }

  async syncStatementPdf(userId: string, bankProfileId: string, fileBuffer: Buffer, password?: string) {
    return this.syncStatementFile(userId, bankProfileId, fileBuffer, 'application/pdf', password);
  }

  private async extractTextFromPdfBuffer(buffer: Buffer, password?: string): Promise<string> {
    const pdfExtract = new PDFExtract();
    const options: PDFExtractOptions = { password };

    return new Promise((resolve, reject) => {
      pdfExtract.extractBuffer(buffer, options, (err, data) => {
        if (err) {
          const errMsg = err.message || '';
          if (errMsg.includes('Password') || errMsg.includes('password') || errMsg.includes('decrypt') || errMsg.includes('Exception') || errMsg.includes('Incorrect') || errMsg.includes('Invalid')) {
            const isInvalidPassword = !!password;
            return reject(new BadRequestException({
              error: isInvalidPassword ? 'INVALID_PASSWORD' : 'PASSWORD_REQUIRED',
              message: isInvalidPassword ? 'Incorrect password for this PDF statement.' : 'Password is required to decrypt this PDF statement.',
            }));
          }
          return reject(new BadRequestException(`Failed to read PDF: ${errMsg}`));
        }
        if (!data || !data.pages) {
          return reject(new Error('PDF extraction returned empty pages.'));
        }

        let text = '';
        for (const page of data.pages) {
          for (const content of page.content) {
            text += content.str + ' ';
          }
          text += '\n';
        }
        resolve(text);
      });
    });
  }

  async updateSmsConsent(userId: string, id: string, smsConsent: boolean) {
    const bank = await this.bankProfileRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!bank) {
      throw new BadRequestException('Bank profile not found.');
    }
    bank.smsConsent = smsConsent;
    bank.updatedAt = Date.now();
    await this.bankProfileRepository.save(bank);
    return {
      success: true,
      bankProfileId: bank.id,
      smsConsent: bank.smsConsent,
    };
  }

  /**
   * Runs one outbox-style write for the older endpoints below: one database transaction that
   * saves the entry (encrypted) and moves the account balance together. The caller holds the
   * user lock.
   */
  private async applyLegacyOp(userId: string, op: any): Promise<OpResult> {
    try {
      return await this.dataSource.transaction((m) => this.applyOne(m, userId, op));
    } catch (e: any) {
      if (e instanceof RejectOp) {
        throw new BadRequestException(LEGACY_REJECT_MESSAGES[e.message] || 'This entry could not be saved.');
      }
      throw e;
    }
  }

  private legacyAmount(value: unknown): number {
    const amount = Math.round(parseFloat(String(value)) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e9) {
      throw new BadRequestException('Amount must be a positive number.');
    }
    return amount;
  }

  private async balanceOfBank(userId: string, bankProfileId: string | null | undefined) {
    if (!bankProfileId) return null;
    return this.bankProfileRepository.findOne({ where: { id: bankProfileId, userId, isDeleted: false } });
  }

  /**
   * Older app versions add a manual entry here (current versions use /sync/outbox). The entry
   * and the balance change are saved together, and the same request arriving twice (a retry
   * after a slow reply) is saved only once.
   */
  async addManualTransaction(userId: string, data: ManualTransactionDto) {
    return this.withUserLock(userId, async () => {
      this.logger.log(`Adding manual ${data.type} transaction for user ${userId}, bank: ${data.bankProfileId}`);

      const bank = await this.bankProfileRepository.findOne({
        where: { id: data.bankProfileId, userId, isDeleted: false },
      });
      if (!bank) {
        throw new BadRequestException('Bank profile not found or does not belong to you.');
      }

      const amount = this.legacyAmount(data.amount);
      if (data.type !== 'debit' && data.type !== 'credit') {
        throw new BadRequestException("Transaction type must be 'debit' or 'credit'.");
      }
      const cleanCategory = (data.category || '').trim();
      if (!cleanCategory) {
        throw new BadRequestException('Category is required.');
      }

      const isDebit = data.type === 'debit';
      const category = cleanCategory.toLowerCase().slice(0, 40);
      const note = ((data.note || '').trim() || cleanCategory).slice(0, 120);
      const now = Date.now();
      const claimedTime = Math.floor(Number(data.timestamp));
      const timestamp = Number.isFinite(claimedTime) && claimedTime > 0 ? claimedTime : now;

      // The same details within the same 2 minutes are one entry: a retry gets the same id
      const fingerprint = createHash('sha256')
        .update([userId, bank.id, data.type, amount, category, note, timestamp, Math.floor(now / 120_000)].join('|'))
        .digest('hex');
      const entityId = (isDebit ? 'tx_manual_' : 'inc_manual_') + fingerprint.slice(0, 24);

      const result = await this.applyLegacyOp(userId, {
        idemKey: 'op_manual_' + fingerprint.slice(0, 40),
        entity: isDebit ? 'transaction' : 'income',
        op: 'upsert',
        entityId,
        payload: {
          amount,
          category,
          [isDebit ? 'merchant' : 'source']: note,
          timestamp,
          bankProfileId: bank.id,
          updatedAt: now,
        },
      });

      if (result.status === 'applied' && note) {
        await this.saveMerchantTagRule(userId, note, category).catch(() => {});
      }
      await this.invalidateUserSyncCache(userId);

      const freshBank = (await this.balanceOfBank(userId, bank.id)) ?? bank;
      const record: any = {
        id: entityId,
        userId,
        amount,
        category,
        timestamp,
        bankProfileId: bank.id,
        updatedAt: now,
        isDeleted: false,
      };
      if (isDebit) {
        record.merchant = note;
        record.smsId = 'manual_entry';
        record.status = 'cleared';
      } else {
        record.source = note;
      }

      return {
        success: true,
        type: data.type,
        record,
        updatedBalance: freshBank.currentBalance,
        bankProfile: freshBank,
      };
    });
  }

  /**
   * Older app versions edit an entry here. Uses the same write as the outbox, so the stored
   * (encrypted) amount is what changes and the balance moves by the difference.
   */
  async updateTransactionEntry(
    userId: string,
    data: {
      id: string;
      type: 'credit' | 'debit';
      amount: number;
      category: string;
      note?: string;
      timestamp?: number;
      bankProfileId?: string | null;
      updateMerchantRule?: boolean;
    },
  ) {
    return this.withUserLock(userId, async () => {
      this.logger.log(`Updating ${data.type} transaction entry ${data.id} for user ${userId}`);

      const amount = this.legacyAmount(data.amount);
      const cleanCategory = (data.category || '').trim();
      if (!cleanCategory) {
        throw new BadRequestException('Category is required.');
      }
      const category = cleanCategory.toLowerCase().slice(0, 40);
      const cleanNote = (data.note || '').trim().slice(0, 120);
      const isDebit = data.type === 'debit';

      const repo: Repository<any> = isDebit ? this.transactionRepository : this.incomeRecordRepository;
      const existing = await repo.findOne({ where: { id: data.id, userId, isDeleted: false } });
      if (!existing) {
        throw new BadRequestException(isDebit ? 'Debit transaction not found.' : 'Income/credit record not found.');
      }

      const payload: Record<string, any> = {
        amount,
        category,
        updatedAt: Math.max(Date.now(), Number(existing.updatedAt || 0) + 1),
      };
      if (cleanNote) payload[isDebit ? 'merchant' : 'source'] = cleanNote;
      const claimedTime = Math.floor(Number(data.timestamp));
      if (data.timestamp && Number.isFinite(claimedTime)) payload.timestamp = claimedTime;
      if (data.bankProfileId !== undefined) payload.bankProfileId = data.bankProfileId || null;

      await this.applyLegacyOp(userId, {
        idemKey: `op_edit_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        entity: isDebit ? 'transaction' : 'income',
        op: 'upsert',
        entityId: data.id,
        payload,
      });

      if (isDebit && cleanNote && data.updateMerchantRule === true) {
        await this.saveMerchantTagRule(userId, cleanNote, category).catch(() => {});
      }
      await this.invalidateUserSyncCache(userId);

      const targetBankId = data.bankProfileId !== undefined ? data.bankProfileId || null : existing.bankProfileId || null;
      const bank = await this.balanceOfBank(userId, targetBankId);
      const record: any = { ...existing, amount, category, bankProfileId: targetBankId };
      if (cleanNote) record[isDebit ? 'merchant' : 'source'] = cleanNote;
      if (payload.timestamp) record.timestamp = payload.timestamp;

      return {
        success: true,
        type: data.type === 'debit' ? 'debit' : 'credit',
        record,
        updatedBalance: bank ? bank.currentBalance : null,
      };
    });
  }

  /** Older app versions delete an entry here; the money goes back to (or comes off) the account. */
  async deleteTransactionEntry(userId: string, id: string, type: 'credit' | 'debit') {
    return this.withUserLock(userId, async () => {
      this.logger.log(`Deleting ${type} transaction entry ${id} for user ${userId}`);
      const isDebit = type === 'debit';

      const repo: Repository<any> = isDebit ? this.transactionRepository : this.incomeRecordRepository;
      const existing = await repo.findOne({ where: { id, userId, isDeleted: false } });
      if (!existing) {
        throw new BadRequestException(isDebit ? 'Debit transaction not found.' : 'Income record not found.');
      }

      await this.applyLegacyOp(userId, {
        idemKey: `op_del_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        entity: isDebit ? 'transaction' : 'income',
        op: 'delete',
        entityId: id,
        payload: { updatedAt: Math.max(Date.now(), Number(existing.updatedAt || 0) + 1) },
      });
      await this.invalidateUserSyncCache(userId);

      const bank = await this.balanceOfBank(userId, existing.bankProfileId);
      return {
        success: true,
        type: isDebit ? 'debit' : 'credit',
        deletedId: id,
        updatedBalance: bank ? bank.currentBalance : null,
      };
    });
  }

  /**
   * Create a new wealth goal
   */
  async createGoal(
    userId: string,
    dto: {
      id?: string;
      name: string;
      category?: string;
      targetAmount: number;
      currentAmount?: number;
      monthlyContribution?: number;
      expectedReturnRate?: number;
      targetDate?: number;
      priority?: string;
      color?: string;
      icon?: string;
      strategy?: string;
      linkedBankId?: string;
      entries?: any[];
    },
  ) {
    await this.rejectIfErased('wealth.savings_goals', dto.id);
    await this.assertIdNotOwnedByAnother(this.savingsGoalRepository, dto.id, userId);
    const goalId = dto.id || 'goal_' + Math.random().toString(36).substr(2, 9);
    const initialAmount = parseFloat(String(dto.currentAmount || 0));
    const goalTarget = parseFloat(String(dto.targetAmount || 0));
    if (!Number.isFinite(initialAmount) || initialAmount < 0 || !Number.isFinite(goalTarget) || goalTarget < 0) {
      throw new BadRequestException('Enter valid amounts for this goal.');
    }
    const todayStr = istDay(); // the date in India, not UTC
    const now = Date.now();

    const initialEntries = dto.entries || (initialAmount > 0 ? [{
      id: 'init_' + goalId,
      amount: initialAmount,
      at: todayStr,
      type: 'opening',
      note: 'Opening balance',
    }] : []);

    const goal = this.savingsGoalRepository.create({
      id: goalId,
      userId,
      name: dto.name,
      category: dto.category || 'custom',
      targetAmount: parseFloat(String(dto.targetAmount || 0)),
      currentAmount: initialAmount,
      monthlyContribution: parseFloat(String(dto.monthlyContribution || 0)),
      expectedReturnRate: parseFloat(String(dto.expectedReturnRate || 10)),
      targetDate: dto.targetDate || Date.now() + 365 * 24 * 60 * 60 * 1000,
      priority: dto.priority || 'medium',
      color: dto.color || '#2dba4e',
      icon: dto.icon || 'trophy',
      strategy: dto.strategy || 'equity_sip',
      linkedBankId: dto.linkedBankId || null,
      entries: initialEntries,
      streakMonths: 0,
      status: 'active',
      updatedAt: now,
      isDeleted: false,
    });

    const saved = await this.savingsGoalRepository.save(goal);

    // Record initial opening balance in history table if present
    if (initialAmount > 0) {
      try {
        const hist = this.goalHistoryRepository.create({
          id: 'init_' + goalId,
          userId,
          goalId,
          type: 'opening',
          amount: initialAmount,
          note: 'Opening balance',
          at: todayStr,
          createdAt: now,
          updatedAt: now,
          isDeleted: false,
        });
        await this.goalHistoryRepository.save(hist);
      } catch (e: any) {
        this.logger.warn(`Failed to write initial goal history: ${e.message}`);
      }
    }

    return saved;
  }

  /**
   * Update an existing wealth goal
   */
  async updateGoal(
    userId: string,
    id: string,
    dto: Partial<{
      name: string;
      category: string;
      targetAmount: number;
      currentAmount: number;
      monthlyContribution: number;
      expectedReturnRate: number;
      targetDate: number;
      priority: string;
      color: string;
      icon: string;
      strategy: string;
      status: string;
      coverPresetKey: string;
      coverImageUri: string;
      linkedBankId: string | null;
      entries: any[];
    }>,
  ) {
    const goal = await this.savingsGoalRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!goal) {
      throw new BadRequestException('Goal not found.');
    }

    if (dto.name !== undefined) goal.name = dto.name;
    if (dto.category !== undefined) goal.category = dto.category;
    if (dto.targetAmount !== undefined) goal.targetAmount = parseFloat(String(dto.targetAmount));
    if (dto.currentAmount !== undefined) goal.currentAmount = parseFloat(String(dto.currentAmount));
    if (dto.monthlyContribution !== undefined) goal.monthlyContribution = parseFloat(String(dto.monthlyContribution));
    if (dto.expectedReturnRate !== undefined) goal.expectedReturnRate = parseFloat(String(dto.expectedReturnRate));
    if (dto.targetDate !== undefined) goal.targetDate = dto.targetDate;
    if (dto.priority !== undefined) goal.priority = dto.priority;
    if (dto.color !== undefined) goal.color = dto.color;
    if (dto.icon !== undefined) goal.icon = dto.icon;
    if (dto.strategy !== undefined) goal.strategy = dto.strategy;
    if (dto.status !== undefined) goal.status = dto.status;
    if (dto.coverPresetKey !== undefined) goal.coverPresetKey = dto.coverPresetKey;
    if (dto.coverImageUri !== undefined) goal.coverImageUri = dto.coverImageUri;
    if (dto.linkedBankId !== undefined) goal.linkedBankId = dto.linkedBankId || null;
    if (dto.entries !== undefined) {
      goal.entries = dto.entries;
      goal.currentAmount = Math.max(0, goal.entries.reduce((acc: number, e: any) => {
        const val = parseFloat(String(e.amount || 0));
        return acc + (e.type === 'withdraw' ? -val : val);
      }, 0));
    }
    goal.updatedAt = Date.now();

    const saved = await this.savingsGoalRepository.save(goal);
    return saved;
  }

  /**
   * Add contribution / funds to a goal
   */
  /** One at a time per user, so two savings logged at the same moment are both kept. */
  async contributeToGoal(userId: string, id: string, amount: number, note?: string) {
    return this.withUserLock(userId, () => this.contributeToGoalLocked(userId, id, amount, note));
  }

  private async contributeToGoalLocked(userId: string, id: string, amount: number, note?: string) {
    const goal = await this.savingsGoalRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!goal) {
      throw new BadRequestException('Goal not found.');
    }

    const add = parseFloat(String(amount || 0));
    if (!Number.isFinite(add) || add <= 0) {
      throw new BadRequestException('Contribution amount must be greater than 0.');
    }

    const now = Date.now();
    const todayStr = istDay(); // the date in India, not UTC
    const entryId = `entry_${now}_${Math.random().toString(36).substr(2, 6)}`;

    const newEntry = {
      id: entryId,
      amount: add,
      at: todayStr,
      type: 'save',
      note: note || 'Logged savings',
    };

    const currentEntries = Array.isArray(goal.entries) ? goal.entries : [];
    goal.entries = [newEntry, ...currentEntries];

    // Recalculate current amount dynamically
    goal.currentAmount = Math.max(0, goal.entries.reduce((acc: number, e: any) => {
      const val = parseFloat(String(e.amount || 0));
      return acc + (e.type === 'withdraw' ? -val : val);
    }, 0));

    goal.streakMonths = savingStreakMonths(goal.entries, todayStr);
    if (goal.currentAmount >= parseFloat(String(goal.targetAmount))) {
      goal.status = 'achieved';
    }
    goal.updatedAt = now;

    // Save in history table
    try {
      const hist = this.goalHistoryRepository.create({
        id: entryId,
        userId,
        goalId: id,
        type: 'save',
        amount: add,
        note: note || 'Logged savings',
        at: todayStr,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
      await this.goalHistoryRepository.save(hist);
    } catch (e: any) {
      this.logger.warn(`Failed to save goal history entry: ${e.message}`);
    }

    const saved = await this.savingsGoalRepository.save(goal);
    return saved;
  }

  /**
   * Withdraw funds from a goal
   */
  async withdrawFromGoal(userId: string, id: string, amount: number, note?: string) {
    return this.withUserLock(userId, () => this.withdrawFromGoalLocked(userId, id, amount, note));
  }

  private async withdrawFromGoalLocked(userId: string, id: string, amount: number, note?: string) {
    try {
      this.logger.log(`[withdrawFromGoal] User: ${userId}, Goal: ${id}, Amount: ${amount}`);
      const goal = await this.savingsGoalRepository.findOne({
        where: { id, userId, isDeleted: false },
      });
      if (!goal) {
        this.logger.warn(`[withdrawFromGoal] Goal ${id} not found for user ${userId}`);
        throw new BadRequestException('Goal not found.');
      }

      const cur = parseFloat(String(goal.currentAmount || 0));
      const withdrawAmt = parseFloat(String(amount || 0));
      if (!Number.isFinite(withdrawAmt) || withdrawAmt <= 0) {
        throw new BadRequestException('Withdrawal amount must be greater than 0.');
      }
      if (withdrawAmt > cur) {
        this.logger.warn(`[withdrawFromGoal] withdrawAmt (${withdrawAmt}) > cur (${cur}) for goal ${id}`);
        throw new BadRequestException(`Withdrawal amount (₹${withdrawAmt}) exceeds available savings (₹${cur}).`);
      }

    const now = Date.now();
    const todayStr = istDay(); // the date in India, not UTC
    const entryId = `entry_${now}_${Math.random().toString(36).substr(2, 6)}`;

    const newEntry = {
      id: entryId,
      amount: withdrawAmt,
      at: todayStr,
      type: 'withdraw',
      note: note || 'Goal withdrawal',
    };

    const currentEntries = Array.isArray(goal.entries) ? goal.entries : [];
    goal.entries = [newEntry, ...currentEntries];

    // Recalculate current amount dynamically
    goal.currentAmount = Math.max(0, goal.entries.reduce((acc: number, e: any) => {
      const val = parseFloat(String(e.amount || 0));
      return acc + (e.type === 'withdraw' ? -val : val);
    }, 0));

    if (goal.currentAmount < parseFloat(String(goal.targetAmount)) && goal.status === 'achieved') {
      goal.status = 'active';
    }
    goal.updatedAt = now;

    // Save in history table
    try {
      const hist = this.goalHistoryRepository.create({
        id: entryId,
        userId,
        goalId: id,
        type: 'withdraw',
        amount: withdrawAmt,
        note: note || 'Goal withdrawal',
        at: todayStr,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
      await this.goalHistoryRepository.save(hist);
    } catch (e: any) {
      this.logger.warn(`Failed to save goal withdrawal history entry: ${e.message}`);
    }

    const saved = await this.savingsGoalRepository.save(goal);
    return saved;
  } catch (err: any) {
    this.logger.error(`[withdrawFromGoal] Error: ${err.message}`, err.stack);
    throw err;
  }
}

  /**
   * Delete an entry from a goal's history and reverse its financial effect:
   * - Deleting an added amount ('save' or 'opening') deducts that amount from current balance
   * - Deleting a withdrawal ('withdraw') restores that withdrawn amount back into current balance
   */
  async deleteGoalEntry(userId: string, goalId: string, entryId: string) {
    return this.withUserLock(userId, () => this.deleteGoalEntryLocked(userId, goalId, entryId));
  }

  private async deleteGoalEntryLocked(userId: string, goalId: string, entryId: string) {
    const goal = await this.savingsGoalRepository.findOne({
      where: { id: goalId, userId, isDeleted: false },
    });
    if (!goal) {
      throw new BadRequestException('Goal not found.');
    }

    const currentEntries = Array.isArray(goal.entries) ? goal.entries : [];
    const remainingEntries = currentEntries.filter((e: any) => e.id !== entryId);
    goal.entries = remainingEntries;

    // Recalculate current amount strictly based on remaining entries
    goal.currentAmount = Math.max(0, goal.entries.reduce((acc: number, e: any) => {
      const val = parseFloat(String(e.amount || 0));
      return acc + (e.type === 'withdraw' ? -val : val);
    }, 0));

    const target = parseFloat(String(goal.targetAmount || 0));
    if (goal.currentAmount < target && goal.status === 'achieved') {
      goal.status = 'active';
    } else if (goal.currentAmount >= target && goal.status === 'active') {
      goal.status = 'achieved';
    }
    goal.streakMonths = savingStreakMonths(goal.entries, istDay());
    goal.updatedAt = Date.now();

    // Mark as deleted in GoalHistory table
    try {
      await this.goalHistoryRepository.update(
        { id: entryId, userId, goalId },
        { isDeleted: true, updatedAt: Date.now() },
      );
    } catch (e: any) {
      this.logger.warn(`Failed to soft-delete from goalHistoryRepository: ${e.message}`);
    }

    const saved = await this.savingsGoalRepository.save(goal);
    return saved;
  }

  /**
   * Retrieve full audit history of goal transactions
   */
  async getGoalHistory(userId: string, goalId: string) {
    try {
      this.logger.log(`[getGoalHistory] Fetching history for user: ${userId}, goal: ${goalId}`);
      const history = await this.goalHistoryRepository.find({
        where: { userId, goalId, isDeleted: false },
        order: { createdAt: 'DESC' },
      });
      return history;
    } catch (err: any) {
      this.logger.error(`[getGoalHistory] Error: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Delete a wealth goal (soft delete)
   */
  async deleteGoal(userId: string, id: string) {
    const goal = await this.savingsGoalRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!goal) {
      throw new BadRequestException('Goal not found.');
    }

    goal.isDeleted = true;
    goal.updatedAt = Date.now();
    await this.savingsGoalRepository.save(goal);
    return { success: true, deletedId: id };
  }

  /**
   * Create a new custom-date or monthly budget
   */
  async createBudget(
    userId: string,
    dto: {
      id?: string;
      name?: string;
      category?: string;
      limitAmount: number;
      period?: string;
      periodType?: string;
      startDate?: number;
      endDate?: number;
      isOverall?: boolean;
      fixedObligations?: number;
      isManuallyActivated?: boolean;
      effectiveStartDate?: number;
      parentBudgetId?: string;
      isPaused?: boolean;
    },
  ) {
    await this.rejectIfErased('finance.budget_declarations', dto.id);
    await this.assertIdNotOwnedByAnother(this.budgetDeclarationRepository, dto.id, userId);
    const budget = this.budgetDeclarationRepository.create({
      id: dto.id || 'budget_' + Math.random().toString(36).substr(2, 9),
      userId,
      name: dto.name || (dto.isOverall ? 'Total Spending Budget' : dto.category || 'Custom Budget'),
      category: dto.isOverall ? 'all' : (dto.category?.toLowerCase() || 'other_expense'),
      limitAmount: parseFloat(String(dto.limitAmount || 0)),
      spentAmount: 0,
      period: dto.period || 'Current Cycle',
      periodType: dto.periodType || 'monthly',
      startDate: dto.startDate ? Number(dto.startDate) : Date.now(),
      endDate: dto.endDate ? Number(dto.endDate) : Date.now() + 30 * 24 * 60 * 60 * 1000,
      isOverall: !!dto.isOverall,
      fixedObligations: parseFloat(String(dto.fixedObligations || 0)),
      isManuallyActivated: !!dto.isManuallyActivated,
      effectiveStartDate: dto.effectiveStartDate ? Number(dto.effectiveStartDate) : null,
      parentBudgetId: dto.parentBudgetId || null,
      isPaused: !!dto.isPaused,
      updatedAt: Date.now(),
      isDeleted: false,
    });

    const saved = await this.budgetDeclarationRepository.save(budget);
    return saved;
  }

  /**
   * Update an existing budget ceiling or dates
   */
  async updateBudget(
    userId: string,
    id: string,
    dto: Partial<{
      name: string;
      category: string;
      limitAmount: number;
      spentAmount: number;
      period: string;
      periodType: string;
      startDate: number;
      endDate: number;
      isOverall: boolean;
      fixedObligations: number;
      isManuallyActivated: boolean;
      effectiveStartDate: number;
      parentBudgetId: string;
      isPaused: boolean;
    }>,
  ) {
    const budget = await this.budgetDeclarationRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!budget) {
      throw new BadRequestException('Budget not found.');
    }

    if (dto.name !== undefined) budget.name = dto.name;
    if (dto.category !== undefined) budget.category = dto.category.toLowerCase();
    if (dto.limitAmount !== undefined) budget.limitAmount = parseFloat(String(dto.limitAmount));
    if (dto.spentAmount !== undefined) budget.spentAmount = parseFloat(String(dto.spentAmount));
    if (dto.period !== undefined) budget.period = dto.period;
    if (dto.periodType !== undefined) budget.periodType = dto.periodType;
    if (dto.startDate !== undefined) budget.startDate = Number(dto.startDate);
    if (dto.endDate !== undefined) budget.endDate = Number(dto.endDate);
    if (dto.isOverall !== undefined) budget.isOverall = !!dto.isOverall;
    if (dto.fixedObligations !== undefined) budget.fixedObligations = parseFloat(String(dto.fixedObligations));
    if (dto.isManuallyActivated !== undefined) budget.isManuallyActivated = !!dto.isManuallyActivated;
    if (dto.effectiveStartDate !== undefined) budget.effectiveStartDate = dto.effectiveStartDate ? Number(dto.effectiveStartDate) : null;
    if (dto.parentBudgetId !== undefined) budget.parentBudgetId = dto.parentBudgetId || null;
    if (dto.isPaused !== undefined) budget.isPaused = !!dto.isPaused;

    budget.updatedAt = Date.now();
    return this.budgetDeclarationRepository.save(budget);
  }

  /**
   * Soft-delete a budget
   */
  async deleteBudget(userId: string, id: string) {
    const budget = await this.budgetDeclarationRepository.findOne({
      where: { id, userId, isDeleted: false },
    });
    if (!budget) {
      throw new BadRequestException('Budget not found.');
    }
    budget.isDeleted = true;
    budget.updatedAt = Date.now();
    await this.budgetDeclarationRepository.save(budget);
    return { success: true, message: 'Budget deleted successfully.' };
  }

  /**
   * Directly ingests SMS from native Android receiver without React Native overhead.
   */
  /**
   * Loads the rows an SMS batch could match: everything carrying one of its identities
   * (including deleted rows, so a deleted or dismissed transaction never comes back) and
   * everything stored around its timestamps.
   */
  private async loadSmsLedgerRows(
    userId: string,
    ledger: 'transactions' | 'income',
    items: SmsLedgerItem[],
  ): Promise<{ entities: Map<string, Transaction | IncomeRecord>; rows: LedgerRow[] }> {
    const keys = new Set<string>();
    for (const item of items) {
      for (const k of smsReviewKeys(item)) keys.add(k);
      const ref = (item.referenceId || '').trim();
      if (ref) keys.add(ref);
    }
    const times = items.map((i) => i.timestamp);
    const from = Math.min(...times) - SAME_SMS_WINDOW_MS;
    const to = Math.max(...times) + SAME_SMS_WINDOW_MS;
    const keyList = Array.from(keys);

    const repo: Repository<Transaction | IncomeRecord> =
      ledger === 'transactions' ? (this.transactionRepository as any) : (this.incomeRecordRepository as any);
    const found = await repo
      .createQueryBuilder('r')
      .where('r.userId = :userId', { userId })
      .andWhere(
        new Brackets((qb) => {
          qb.where('r.timestamp BETWEEN :from AND :to', { from: String(from), to: String(to) });
          if (keyList.length > 0) {
            qb.orWhere('r.smsId IN (:...keys)', { keys: keyList }).orWhere('r.contentId IN (:...keys)', {
              keys: keyList,
            });
          }
        }),
      )
      .getMany();

    const entities = new Map<string, Transaction | IncomeRecord>();
    const rows: LedgerRow[] = [];
    for (const entity of found) {
      let amount: number | null = entity.amount ?? null;
      let party: string | null =
        ledger === 'transactions' ? (entity as Transaction).merchant : (entity as IncomeRecord).source;
      if (entity.encAmount != null) {
        try {
          if (ledger === 'transactions') {
            const dec = await this.fieldCipherService.readTransactionDualRun(userId, entity as Transaction);
            amount = dec.amount;
            party = dec.merchant || party;
          } else {
            const dec = await this.fieldCipherService.readIncomeDualRun(userId, entity as IncomeRecord);
            amount = dec.amount;
            party = dec.source || party;
          }
        } catch {}
      }
      entities.set(entity.id, entity);
      rows.push({
        id: entity.id,
        amount,
        timestamp: Number(entity.timestamp),
        smsId: entity.smsId ?? null,
        contentId: entity.contentId ?? null,
        party,
        bankProfileId: entity.bankProfileId ?? null,
        isDeleted: !!entity.isDeleted,
      });
    }
    return { entities, rows };
  }

  /**
   * The single SMS ingestion path, shared by the live receiver and inbox re-scans.
   * - Same SMS already stored → silent no-op (and any stale review for it is closed).
   * - Row stored before SMS identities existed → claimed: the SMS identity is written onto it.
   * - A different SMS, same amount and merchant within 2 minutes → one duplicate review, asked once.
   * - Otherwise → new row.
   * Callers hold the user lock and apply balance changes for the rows returned in `inserted`.
   */
  private async ingestSmsItems(
    userId: string,
    ledger: 'transactions' | 'income',
    rawItems: SmsLedgerItem[],
    options: { status?: string; preloadedRules?: UserMerchantTag[] } = {},
  ): Promise<{ outcomes: SmsOutcome[]; inserted: (Transaction | IncomeRecord)[]; insertedTotal: number }> {
    if (rawItems.length === 0) return { outcomes: [], inserted: [], insertedTotal: 0 };

    // Oldest first, so each SMS claims its own legacy row before a later look-alike can
    const order = rawItems.map((item, idx) => ({ item, idx })).sort((a, b) => a.item.timestamp - b.item.timestamp);
    const { rows } = await this.loadSmsLedgerRows(userId, ledger, rawItems);
    const claimed = new Set<string>();
    const outcomes: SmsOutcome[] = new Array(rawItems.length);
    const inserted: (Transaction | IncomeRecord)[] = [];
    let insertedTotal = 0;
    const recordedKeys: string[] = [];
    const repo: Repository<any> = ledger === 'transactions' ? this.transactionRepository : this.incomeRecordRepository;

    for (const { item, idx } of order) {
      const match = classifySms(rows, item, claimed);

      if (match.kind === 'same' || match.kind === 'legacy') {
        claimed.add(match.row.id);
        // Write the SMS identity onto the row so future scans match it directly
        const patch: { smsId?: string; contentId?: string } = {};
        if (item.contentId && !match.row.contentId) patch.contentId = item.contentId;
        if (item.smsId && !isSmsIdentity(match.row.smsId)) patch.smsId = item.smsId;
        if (Object.keys(patch).length > 0) {
          await repo.update({ id: match.row.id, userId }, patch);
          if (patch.contentId) match.row.contentId = patch.contentId;
          if (patch.smsId) match.row.smsId = patch.smsId;
        }
        recordedKeys.push(...smsReviewKeys(item));
        outcomes[idx] = 'already_recorded';
        continue;
      }

      if (match.kind === 'duplicate') {
        const keys = smsReviewKeys(item);
        const previous = await this.notificationsService.findDuplicateReviews(userId, keys).catch(() => []);
        if (previous.length > 0) {
          outcomes[idx] = 'review_pending';
          continue;
        }
        await this.sendSmsDuplicateReview(userId, item, ledger).catch((err) =>
          this.logger.warn(`Failed to dispatch duplicate alert: ${err.message}`),
        );
        outcomes[idx] = 'review';
        continue;
      }

      const entity = await this.buildSmsLedgerEntity(userId, ledger, item, options);
      inserted.push(entity);
      insertedTotal += item.amount;
      claimed.add(entity.id);
      rows.push({
        id: entity.id,
        amount: item.amount,
        timestamp: item.timestamp,
        smsId: item.smsId ?? null,
        contentId: item.contentId ?? null,
        party: item.merchant,
        bankProfileId: item.bankProfileId ?? null,
        isDeleted: false,
      });
      outcomes[idx] = 'recorded';
    }

    if (inserted.length > 0) {
      await repo.save(inserted);
    }
    if (recordedKeys.length > 0) {
      await this.notificationsService.resolveStaleDuplicateReviews(userId, recordedKeys).catch(() => 0);
    }
    return { outcomes, inserted, insertedTotal };
  }

  /** Creates (unsaved) an encrypted ledger row for an SMS, carrying its identity. */
  private async buildSmsLedgerEntity(
    userId: string,
    ledger: 'transactions' | 'income',
    item: SmsLedgerItem,
    options: { status?: string; preloadedRules?: UserMerchantTag[]; isDeleted?: boolean; idPrefix?: string } = {},
  ): Promise<Transaction | IncomeRecord> {
    const isDeleted = !!options.isDeleted;
    if (ledger === 'transactions') {
      const txId = (options.idPrefix || 'tx_sms_') + Math.random().toString(36).substr(2, 9);
      const category =
        item.category ||
        (item.merchant ? await this.classifyCategory(item.merchant, userId, options.preloadedRules) : 'miscellaneous');
      const enc = await this.fieldCipherService.encryptTransactionFields(userId, txId, {
        amount: item.amount,
        merchant: item.merchant || 'Merchant',
      });
      const tx = this.transactionRepository.create({
        id: txId,
        userId,
        amount: null as any,
        category,
        merchant: null as any,
        encAmount: enc.encAmount,
        encMerchant: enc.encMerchant,
        merchantIdx: enc.merchantIdx,
        rowVersion: enc.rowVersion,
        timestamp: item.timestamp,
        bankProfileId: item.bankProfileId ?? null,
        smsId: item.smsId || item.contentId || undefined,
        contentId: item.contentId ?? null,
        isAnomaly: item.amount > 5000,
        status: options.status || 'cleared',
        updatedAt: Date.now(),
        isDeleted,
      });
      return tx;
    }

    const incId = (options.idPrefix || 'income_sms_') + Math.random().toString(36).substr(2, 9);
    const enc = await this.fieldCipherService.encryptIncomeFields(userId, incId, {
      amount: item.amount,
      source: item.merchant || 'Direct Credit',
    });
    return this.incomeRecordRepository.create({
      id: incId,
      userId,
      amount: null as any,
      source: null as any,
      encAmount: enc.encAmount,
      encSource: enc.encSource,
      sourceIdx: enc.sourceIdx,
      rowVersion: enc.rowVersion,
      category: item.category ? item.category.toLowerCase() : item.isSalary ? 'Salary' : 'Other Income',
      timestamp: item.timestamp,
      bankProfileId: item.bankProfileId ?? null,
      smsId: item.smsId || item.contentId || null,
      contentId: item.contentId ?? null,
      updatedAt: Date.now(),
      isDeleted,
    });
  }

  /** "Did you pay twice?" for a second, distinct SMS that matches an existing payment. */
  private async sendSmsDuplicateReview(userId: string, item: SmsLedgerItem, ledger: 'transactions' | 'income') {
    const timeStr = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isCredit = item.type === 'credit';
    await this.notificationsService.sendNotification(userId, {
      title: `Potential Duplicate: ₹${item.amount}`,
      body: isCredit
        ? `We received another ₹${item.amount} credit from ${item.merchant || 'Direct Credit'} around ${timeStr}. Add this income?`
        : `We detected another ₹${item.amount} payment to ${item.merchant || 'Merchant'} around ${timeStr}. Was this a second payment?`,
      type: 'review',
      payload: {
        action: 'duplicate_transaction_review',
        source: 'sms',
        ledger,
        transactionData: {
          amount: item.amount,
          type: item.type,
          merchant: item.merchant || (isCredit ? 'Direct Credit' : 'Merchant'),
          category: item.category,
          timestamp: item.timestamp,
          bankProfileId: item.bankProfileId ?? null,
          smsId: item.smsId || item.contentId,
          contentId: item.contentId,
          referenceId: item.referenceId || undefined,
          source: 'sms',
        },
      },
    });
  }

  /**
   * Inbox re-scan (manual 48h sync, 30-day setup, app resume). Uses SMS identity rules,
   * never statement-upload rules, so re-reading an SMS can't raise a review.
   */
  async syncSmsCatchup(userId: string, data: OcrSyncDto) {
    return this.withUserLock(userId, async () => {
      const isUnassigned = !data.bankProfileId || data.bankProfileId === 'unassigned';
      let bank: BankProfile | null = null;
      if (!isUnassigned) {
        bank = await this.bankProfileRepository.findOne({
          where: { id: data.bankProfileId, userId, isDeleted: false },
        });
        if (!bank) {
          throw new BadRequestException('Bank account profile not found.');
        }
      }
      const bankProfileId = bank ? bank.id : null;

      const toItem = (t: OcrSyncDto['transactions'][number]): SmsLedgerItem | null => {
        const amount = parseFloat(String(t.amount));
        if (isNaN(amount) || amount <= 0) return null;
        let timestamp = Number(t.timestamp);
        if (!timestamp || isNaN(timestamp)) {
          timestamp = new Date(`${t.date}T${(t.time || '12:00:00').trim()}`).getTime();
        }
        if (isNaN(timestamp)) return null;
        const ref = t.referenceId ? String(t.referenceId).trim() : undefined;
        return {
          type: t.type,
          amount,
          merchant: t.merchant || '',
          category: t.category,
          timestamp,
          referenceId: ref,
          smsId: t.smsId || (ref ? `ref_${ref}` : t.contentId),
          contentId: t.contentId,
          bankProfileId,
        };
      };
      const items = data.transactions.map(toItem).filter((i): i is SmsLedgerItem => !!i);

      const preloadedRules = await this.userMerchantTagRepository.find({ where: { userId } }).catch(() => []);
      const debits = await this.ingestSmsItems(
        userId,
        'transactions',
        items.filter((i) => i.type === 'debit'),
        { preloadedRules },
      );
      const credits = await this.ingestSmsItems(
        userId,
        'income',
        items.filter((i) => i.type === 'credit'),
        { preloadedRules },
      );

      const addedTransactionsCount = debits.inserted.length;
      const addedIncomeCount = credits.inserted.length;
      const all = [...debits.outcomes, ...credits.outcomes];

      if (bank) {
        if (data.applyBalanceChange === false) {
          // Balance left as is
        } else if (data.updatedBalance !== undefined && data.updatedBalance !== null && !isNaN(Number(data.updatedBalance))) {
          // Newest available balance stated by the bank in the scanned SMS
          bank.currentBalance = Math.round(parseFloat(String(data.updatedBalance)) * 100) / 100;
          bank.lastSyncTimestamp = Date.now();
          bank.updatedAt = Date.now();
          await this.bankProfileRepository.save(bank);
        } else if (addedTransactionsCount > 0 || addedIncomeCount > 0) {
          // Only rows actually inserted move the balance
          const change = credits.insertedTotal - debits.insertedTotal;
          if (change !== 0) {
            bank.currentBalance = Math.round((parseFloat(String(bank.currentBalance || 0)) + change) * 100) / 100;
            bank.lastSyncTimestamp = Date.now();
            bank.updatedAt = Date.now();
            await this.bankProfileRepository.save(bank);
          }
        }
      }

      await this.invalidateUserSyncCache(userId);
      return {
        success: true,
        addedTransactionsCount,
        addedIncomeCount,
        alreadyRecordedCount: all.filter((o) => o === 'already_recorded').length,
        reviewCount: all.filter((o) => o === 'review').length,
        updatedBalance: bank ? bank.currentBalance : null,
      };
    });
  }

  async ingestDirectSms(userId: string, data: DirectSmsDto) {
    return this.withUserLock(userId, async () => {
    this.logger.log(`Direct native SMS ingestion for user ${userId} from ${data.sender}`);
    const bankProfiles = await this.bankProfileRepository.find({
      where: { userId, isDeleted: false },
    });

    // Only bank alerts may be processed; personal or unknown senders are dropped unparsed
    if (!isBankSmsSender(data.sender, bankProfiles.map((b) => b.smsSenderId))) {
      this.logger.log(`Direct SMS ignored: sender is not a bank`);
      return { success: false, reason: 'not_bank_sender' };
    }

    // Current apps parse on the phone and send only the extracted fields; legacy apps send the text
    const parsed: ParsedTransaction | null = data.parsed
      ? { ...data.parsed }
      : parseSMS(data.sender, data.body || '');
    if (!parsed) {
      this.logger.log(`Direct SMS ignored: Not a financial transaction pattern`);
      return { success: false, reason: 'not_transaction_pattern' };
    }

    const parsedSuffix = (parsed.accountSuffix || '').replace(/\D/g, '').slice(-4);

    const senderBank = detectBankFromSender(data.sender) || (parsed.bankName !== 'Bank' ? parsed.bankName : null);

    const candidateBanks = bankProfiles.filter((b) => {
      const profileBankName = (b.bankName || '').toLowerCase();
      const senderMatches = this.matchesSmsSender(data.sender, b.smsSenderId);
      const bankNameMatches = senderBank && profileBankName.includes(senderBank.toLowerCase());
      return senderMatches || bankNameMatches;
    });

    let matchedBank: BankProfile | null = null;

    if (parsedSuffix && parsedSuffix !== 'XXXX') {
      matchedBank = candidateBanks.find((b) => {
        const dbSuffix = (b.accountNumberSuffix || '').replace(/\D/g, '').slice(-4);
        return dbSuffix === parsedSuffix;
      }) || null;
      // A linked debit card routes its spends to the card's account
      if (!matchedBank) {
        matchedBank = candidateBanks.find((b) => this.debitCardsOf(b).includes(parsedSuffix)) || null;
      }
      if (!matchedBank && parsed.isDebitCard) {
        const owners = bankProfiles.filter((b) => this.debitCardsOf(b).includes(parsedSuffix));
        if (owners.length === 1) matchedBank = owners[0];
      }
    } else if (candidateBanks.length === 1) {
      matchedBank = candidateBanks[0];
    }

    if (matchedBank && matchedBank.smsConsent === false) {
      this.logger.log(`SMS consent disabled for bank ${matchedBank.bankName}`);
      return { success: false, reason: 'consent_disabled' };
    }

    const txTime = data.timestamp && !isNaN(Number(data.timestamp)) ? Number(data.timestamp) : Date.now();

    const incomingRef = parsed.referenceId;
    let directSmsId: string;
    // Legacy apps send the text; current apps send the phone-computed hash (same algorithm)
    const contentId = data.contentId || (data.body ? smsContentId(data.body) : undefined);
    if (incomingRef) {
      directSmsId = `ref_${incomingRef}`;
    } else if (data.smsId) {
      directSmsId = data.smsId;
    } else {
      directSmsId = contentId || smsContentId(data.body || '');
    }

    const smsItem: SmsLedgerItem = {
      type: parsed.type,
      amount: parsed.amount,
      merchant: parsed.merchant || '',
      isSalary: parsed.isSalary,
      timestamp: txTime,
      referenceId: incomingRef,
      smsId: directSmsId,
      contentId,
      bankProfileId: matchedBank ? matchedBank.id : null,
    };

    if (!matchedBank) {
      // Review Queue (bankProfileId: null) without touching any bank balance; a retried SMS is still a no-op
      const { outcomes } = await this.ingestSmsItems(userId, 'transactions', [smsItem], { status: 'pending_review' });
      if (outcomes[0] !== 'recorded') {
        return {
          success: true,
          duplicate: true,
          idempotent: outcomes[0] === 'already_recorded',
          message: outcomes[0] === 'already_recorded' ? 'Transaction already recorded' : 'Potential duplicate queued for review',
        };
      }
      await this.invalidateUserSyncCache(userId);

      if (parsed.isDebitCard && parsed.type === 'debit' && /^\d{4}$/.test(parsedSuffix) && candidateBanks.length > 0) {
        this.promptDebitCardLink(userId, parsedSuffix, parsed, candidateBanks).catch((err) =>
          this.logger.warn(`Failed to dispatch debit card prompt: ${err.message}`),
        );
      }

      return {
        success: true,
        ingested: true,
        type: parsed.type,
        amount: parsed.amount,
        updatedBalance: null,
        bankName: 'Unassigned',
        accountSuffix: parsedSuffix || 'XXXX',
        merchant: parsed.merchant,
        isUnassigned: true,
      };
    }

    const ledger = parsed.type === 'debit' ? 'transactions' : 'income';
    const { outcomes } = await this.ingestSmsItems(userId, ledger, [smsItem]);
    const outcome = outcomes[0];

    if (outcome === 'already_recorded') {
      return {
        success: true,
        duplicate: true,
        idempotent: true,
        message: parsed.type === 'debit' ? 'Transaction already recorded' : 'Income already recorded',
      };
    }
    if (outcome === 'review' || outcome === 'review_pending') {
      return { success: true, duplicate: true, message: 'Potential duplicate queued for review' };
    }

    const ingested = true;
    const statedBalance =
      parsed.availableBalance !== undefined && !isNaN(parsed.availableBalance) && parsed.availableBalance >= 0
        ? parsed.availableBalance
        : undefined;
    const newBalance = await this.applySmsBalance(
      userId,
      matchedBank,
      Math.min(txTime, Date.now() + 5 * 60 * 1000), // a phone clock set ahead can't block later SMS
      statedBalance !== undefined ? { absolute: statedBalance } : { delta: parsed.type === 'debit' ? -parsed.amount : parsed.amount },
    );

    await this.invalidateUserSyncCache(userId);

    return {
      success: true,
      ingested,
      type: parsed.type,
      amount: parsed.amount,
      updatedBalance: newBalance,
      bankName: matchedBank.bankName,
      accountSuffix: matchedBank.accountNumberSuffix,
      merchant: parsed.merchant,
    };
    });
  }

  /**
   * Moves an account balance for a bank SMS, in one database statement.
   *  - The SMS states the balance: use it, unless a newer SMS has already stated one (bank SMS
   *    can arrive out of order; an older message must not overwrite a newer balance).
   *  - It doesn't: add or subtract the amount, unless a newer stated balance already includes it.
   * Returns the account's balance afterwards.
   */
  private async applySmsBalance(
    userId: string,
    bank: BankProfile,
    smsTime: number,
    change: { absolute?: number; delta?: number },
  ): Promise<number> {
    const now = Date.now();
    // An UPDATE ... RETURNING comes back as [rows, count] from the Postgres driver
    const rowsOf = (res: any): any[] => (Array.isArray(res?.[0]) ? res[0] : Array.isArray(res) ? res : []);
    try {
      const res =
        change.absolute !== undefined
          ? await this.dataSource.query(
              `UPDATE core.bank_profiles
                  SET current_balance = ROUND($3::numeric, 2), balance_as_of = $4, last_sync_timestamp = $5, updated_at = $5
                WHERE id = $1 AND user_id = $2 AND is_deleted = false
                  AND (balance_as_of IS NULL OR balance_as_of <= $4)
              RETURNING current_balance`,
              [bank.id, userId, change.absolute, smsTime, now],
            )
          : await this.dataSource.query(
              `UPDATE core.bank_profiles
                  SET current_balance = ROUND((COALESCE(current_balance, 0) + $3)::numeric, 2), last_sync_timestamp = $5, updated_at = $5
                WHERE id = $1 AND user_id = $2 AND is_deleted = false
                  AND (balance_as_of IS NULL OR balance_as_of < $4)
              RETURNING current_balance`,
              [bank.id, userId, change.delta ?? 0, smsTime, now],
            );
      const rows = rowsOf(res);
      if (rows.length > 0 && rows[0]?.current_balance != null) return Number(rows[0].current_balance);

      // Nothing changed: a newer SMS already set the balance. Report what is stored.
      const current = await this.dataSource.query(
        `SELECT current_balance FROM core.bank_profiles WHERE id = $1 AND user_id = $2`,
        [bank.id, userId],
      );
      const stored = current?.[0]?.current_balance;
      return stored != null ? Number(stored) : Number(bank.currentBalance || 0);
    } catch (err: any) {
      // e.g. the balance_as_of column could not be added: keep the previous behaviour
      this.logger.warn(`Atomic SMS balance update failed, using fallback: ${err?.message || err}`);
      const base = parseFloat(String(bank.currentBalance || 0));
      const next = Math.round((change.absolute !== undefined ? change.absolute : base + (change.delta ?? 0)) * 100) / 100;
      bank.currentBalance = next;
      bank.lastSyncTimestamp = now;
      bank.updatedAt = now;
      await this.bankProfileRepository.save(bank);
      return next;
    }
  }

  /** Debit card last-4s linked to a bank account. */
  private debitCardsOf(bank: BankProfile): string[] {
    return (bank.debitCardSuffixes || '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d{4}$/.test(s));
  }

  /**
   * Asks the user once a week per card whether an unrecognised debit card belongs to one of
   * their accounts at the issuing bank.
   */
  private async promptDebitCardLink(
    userId: string,
    cardSuffix: string,
    parsed: ParsedTransaction,
    candidateBanks: BankProfile[],
  ) {
    const key = `debit_card_prompt:${userId}:${cardSuffix}`;
    if (await this.redisService.get(key)) return;
    await this.redisService.set(key, '1', 7 * 24 * 60 * 60);

    const bankName = candidateBanks[0].bankName || parsed.bankName || 'your bank';
    const where = parsed.merchant && !/^(?:spends|credits)$/i.test(parsed.merchant) ? ` at ${parsed.merchant}` : '';
    await this.notificationsService.sendNotification(userId, {
      title: `New ${bankName} debit card spotted`,
      body: `₹${parsed.amount} was spent${where} with card ••${cardSuffix}. Link it to your account so card spends are tracked automatically.`,
      type: 'review',
      payload: {
        action: 'link_debit_card',
        cardSuffix,
        bankName,
        bankProfileIds: candidateBanks.map((b) => b.id),
      },
    });
  }

  /** Replaces the debit cards linked to one account. */
  async setDebitCards(userId: string, bankProfileId: string, cardSuffixes: string[]) {
    const clean = Array.from(new Set((cardSuffixes || []).map((s) => String(s).trim())));
    if (clean.some((s) => !/^\d{4}$/.test(s))) {
      throw new BadRequestException('Enter the last 4 digits of the card.');
    }
    if (clean.length > 4) {
      throw new BadRequestException('An account can have up to 4 debit cards.');
    }

    const banks = await this.bankProfileRepository.find({ where: { userId, isDeleted: false } });
    const bank = banks.find((b) => b.id === bankProfileId);
    if (!bank) {
      throw new BadRequestException('Bank account not found.');
    }
    for (const other of banks) {
      if (other.id === bank.id) continue;
      const clash = clean.find((s) => this.debitCardsOf(other).includes(s));
      if (clash) {
        throw new BadRequestException(`Card ••${clash} is already linked to ${other.bankName} ••${other.accountNumberSuffix}.`);
      }
    }

    bank.debitCardSuffixes = clean.length ? clean.join(',') : null;
    bank.updatedAt = Date.now();
    await this.bankProfileRepository.save(bank);
    await Promise.all(clean.map((s) => this.redisService.del(`debit_card_prompt:${userId}:${s}`)));
    await this.invalidateUserSyncCache(userId);
    return { success: true, bankProfile: bank };
  }

  /**
   * Helper to check if incoming SMS sender header matches any of the bank's configured tags.
   */
  private matchesSmsSender(incomingSender: string, bankSmsSenderId?: string | null): boolean {
    if (!incomingSender) return false;
    if (!bankSmsSenderId) return true;
    const tags = bankSmsSenderId
      .split(/[,;\s]+/)
      .map((t) => t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().trim())
      .filter((t) => t.length >= 3);
    if (tags.length === 0) return true;

    const cleanSender = incomingSender
      .toUpperCase()
      .replace(/^[A-Z]{2}-/i, '')
      .replace(/[^A-Z0-9]/g, '')
      .trim();

    return tags.some(
      (tag) => cleanSender === tag || cleanSender.includes(tag) || tag.includes(cleanSender),
    );
  }

  /**
   * Persistently excludes a transaction from budget calculations without deleting it from bank statements.
   */
  async excludeTransactionFromBudget(userId: string, data: { transactionId: string; budgetId?: string }) {
    if (!data.transactionId) {
      throw new BadRequestException('Transaction ID is required.');
    }
    const existing = await this.budgetExclusionRepository.findOne({
      where: { userId, transactionId: data.transactionId },
    });
    const now = Date.now();
    if (existing) {
      existing.isDeleted = false;
      existing.budgetId = data.budgetId || existing.budgetId;
      existing.updatedAt = now;
      await this.budgetExclusionRepository.save(existing);
      await this.invalidateUserSyncCache(userId);
      return { success: true, exclusion: existing };
    }
    const exclusion = this.budgetExclusionRepository.create({
      id: 'b_excl_' + Math.random().toString(36).substr(2, 9),
      userId,
      transactionId: data.transactionId,
      budgetId: data.budgetId || null,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });
    await this.budgetExclusionRepository.save(exclusion);
    await this.invalidateUserSyncCache(userId);
    return { success: true, exclusion };
  }

  /**
   * Restores a previously excluded transaction back to budget calculations.
   */
  async restoreTransactionToBudget(userId: string, data: { transactionId: string }) {
    if (!data.transactionId) {
      throw new BadRequestException('Transaction ID is required.');
    }
    const existing = await this.budgetExclusionRepository.findOne({
      where: { userId, transactionId: data.transactionId, isDeleted: false },
    });
    if (existing) {
      existing.isDeleted = true;
      existing.updatedAt = Date.now();
      await this.budgetExclusionRepository.save(existing);
    }
    await this.invalidateUserSyncCache(userId);
    return { success: true, restoredId: data.transactionId };
  }

  /**
   * Interactively resolves a potential duplicate transaction flagged during SMS, OCR, or Statement processing.
   */
  async confirmDuplicateTransaction(userId: string, dto: ConfirmDuplicateDto) {
    return this.withUserLock(userId, () => this.confirmDuplicateTransactionLocked(userId, dto));
  }

  private async confirmDuplicateTransactionLocked(userId: string, dto: ConfirmDuplicateDto) {
    this.logger.log(`User ${userId} resolving duplicate notification ${dto.notificationId} with decision: ${dto.decision}`);

    // The server's copy of the review is authoritative; a second tap on an answered review does nothing
    const stored = dto.notificationId
      ? await this.notificationsService.findNotification(userId, dto.notificationId).catch(() => null)
      : null;
    if (stored?.payload?.resolved) {
      return { success: true, decision: stored.payload.decision, message: 'This review was already answered.' };
    }
    const txData: any = { ...(dto.transactionData || {}), ...(stored?.payload?.transactionData || {}) };

    // Reviews raised from an SMS carry its identity. Storing it with the answer means the same SMS
    // is recognised on every later scan and the question is never asked again.
    const smsItem: SmsLedgerItem | null =
      txData.amount && txData.type && (isSmsIdentity(txData.smsId) || txData.contentId)
        ? {
            type: txData.type,
            amount: parseFloat(String(txData.amount)),
            merchant: txData.merchant || '',
            category: txData.category,
            timestamp: Number(txData.timestamp) || Date.now(),
            referenceId: txData.referenceId,
            smsId: isSmsIdentity(txData.smsId) ? txData.smsId : txData.contentId,
            contentId: txData.contentId,
            bankProfileId: txData.bankProfileId ?? null,
          }
        : null;
    const smsLedger = smsItem ? (smsItem.type === 'debit' ? 'transactions' : 'income') : null;
    const smsAlreadyStored = smsItem
      ? (await this.loadSmsLedgerRows(userId, smsLedger!, [smsItem])).rows.some((row) =>
          isSameSms(row, smsItem),
        )
      : false;

    if (dto.decision === 'ignore' && smsItem && !smsAlreadyStored) {
      // Dismissal is remembered as a deleted row with the SMS identity: never shown, never re-asked
      const tombstone = await this.buildSmsLedgerEntity(userId, smsLedger!, smsItem, {
        isDeleted: true,
        idPrefix: smsLedger === 'transactions' ? 'tx_dismissed_' : 'income_dismissed_',
      });
      if (smsLedger === 'transactions') {
        await this.transactionRepository.save(tombstone as Transaction);
      } else {
        await this.incomeRecordRepository.save(tombstone as IncomeRecord);
      }
    }

    if (dto.decision === 'add' && !smsAlreadyStored) {
      if (!txData || !txData.amount || !txData.type) {
        throw new BadRequestException('Transaction details are required to confirm adding this transaction.');
      }

      const amount = parseFloat(String(txData.amount));
      let txTime = txData.timestamp && !isNaN(Number(txData.timestamp)) ? Number(txData.timestamp) : Date.now();
      const uniqueConfirmedSmsId =
        smsItem?.smsId || `user_confirmed_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const confirmedContentId = smsItem?.contentId ?? null;

      let bank: BankProfile | null = null;
      if (txData.bankProfileId) {
        bank = await this.bankProfileRepository.findOne({
          where: { id: txData.bankProfileId, userId, isDeleted: false },
        });
      }

      if (txData.type === 'debit') {
        // Prevent timestamp collisions: if an existing transaction already occupies this exact millisecond,
        // offset by +1 second (1000 ms) so the confirmed duplicate sits immediately adjacent to the sister transaction.
        // An SMS keeps its exact sent time: that time is part of how a re-scan recognises it.
        let collision = smsItem ? null : await this.transactionRepository.findOne({
          where: { userId, timestamp: txTime, isDeleted: false },
        });
        while (collision) {
          txTime += 1000;
          collision = await this.transactionRepository.findOne({
            where: { userId, timestamp: txTime, isDeleted: false },
          });
        }

        const category = txData.category || (txData.merchant ? await this.classifyCategory(txData.merchant, userId) : 'miscellaneous');
        const txId = 'tx_confirmed_' + Math.random().toString(36).substr(2, 9);
        const enc = await this.fieldCipherService.encryptTransactionFields(
          userId,
          txId,
          { amount, merchant: txData.merchant || 'Merchant' },
        );
        const newTx = this.transactionRepository.create({
          id: txId,
          userId,
          amount: null as any,
          category,
          merchant: null as any,
          encAmount: enc.encAmount,
          encMerchant: enc.encMerchant,
          merchantIdx: enc.merchantIdx,
          rowVersion: enc.rowVersion,
          timestamp: txTime,
          bankProfileId: bank ? bank.id : null,
          smsId: uniqueConfirmedSmsId,
          contentId: confirmedContentId,
          isAnomaly: amount > 5000,
          status: 'cleared',
          updatedAt: Date.now(),
          isDeleted: false,
        });
        await this.transactionRepository.save(newTx);

        const shouldAdjustBalance = dto.adjustBalance !== undefined
          ? dto.adjustBalance
          : (txData.source !== 'upload');

        if (bank && shouldAdjustBalance) {
          bank.currentBalance = Math.round((parseFloat(String(bank.currentBalance || 0)) - amount) * 100) / 100;
          bank.lastSyncTimestamp = Date.now();
          bank.updatedAt = Date.now();
          await this.bankProfileRepository.save(bank);
        }
      } else {
        let incTime = txTime;
        let collision = smsItem ? null : await this.incomeRecordRepository.findOne({
          where: { userId, timestamp: incTime, isDeleted: false },
        });
        while (collision) {
          incTime += 1000;
          collision = await this.incomeRecordRepository.findOne({
            where: { userId, timestamp: incTime, isDeleted: false },
          });
        }

        const incId = 'income_confirmed_' + Math.random().toString(36).substr(2, 9);
        const enc = await this.fieldCipherService.encryptIncomeFields(
          userId,
          incId,
          { amount, source: txData.merchant || 'Direct Credit' },
        );
        const newInc = this.incomeRecordRepository.create({
          id: incId,
          userId,
          amount: null as any,
          source: null as any,
          encAmount: enc.encAmount,
          encSource: enc.encSource,
          sourceIdx: enc.sourceIdx,
          rowVersion: enc.rowVersion,
          category: txData.category ? txData.category.toLowerCase() : 'money_received',
          timestamp: incTime,
          bankProfileId: bank ? bank.id : null,
          smsId: uniqueConfirmedSmsId,
          contentId: confirmedContentId,
          updatedAt: Date.now(),
          isDeleted: false,
        });
        await this.incomeRecordRepository.save(newInc);

        const shouldAdjustBalance = dto.adjustBalance !== undefined
          ? dto.adjustBalance
          : (txData.source !== 'upload');

        if (bank && shouldAdjustBalance) {
          bank.currentBalance = Math.round((parseFloat(String(bank.currentBalance || 0)) + amount) * 100) / 100;
          bank.lastSyncTimestamp = Date.now();
          bank.updatedAt = Date.now();
          await this.bankProfileRepository.save(bank);
        }
      }

      await this.invalidateUserSyncCache(userId);
    }

    if (dto.notificationId) {
      await this.notificationsService.resolveNotification(userId, dto.notificationId, dto.decision).catch(() => {});
    }

    return {
      success: true,
      decision: dto.decision,
      message: dto.decision === 'add' ? 'Transaction added successfully!' : 'Duplicate dismissed.',
    };
  }

  /**
   * Nightly: forget "already applied" markers older than 45 days. They only exist so a retried
   * save isn't applied twice; a phone replaying an edit that old is harmless (the row already
   * exists and the edit is older than what is stored). Deleted in small batches.
   */
  @Cron('10 3 * * *')
  async purgeOldAppliedOps() {
    try {
      for (let i = 0; i < 50; i++) {
        const res = await this.dataSource.query(
          `DELETE FROM finance.applied_ops WHERE idem_key IN (
             SELECT idem_key FROM finance.applied_ops WHERE applied_at < now() - interval '45 days' LIMIT 5000
           )`,
        );
        const removed = Array.isArray(res) && typeof res[1] === 'number' ? res[1] : 0;
        if (removed < 5000) break;
      }
    } catch (err: any) {
      this.logger.warn(`[AppliedOpsPurge] failed: ${err?.message || err}`);
    }
  }

  /**
   * One at a time per user, together with SMS ingest and the other balance writers, so two
   * writes arriving at the same moment can't overwrite each other's balance change.
   */
  async applyOutbox(userId: string, ops: any[]) {
    if (!Array.isArray(ops) || ops.length > 100) throw new BadRequestException();
    return this.withUserLock(userId, () => this.applyOutboxLocked(userId, ops));
  }

  private async applyOutboxLocked(userId: string, ops: any[]) {
    const results: OpResult[] = [];
    let stopped = false;
    let touched = false;

    for (const op of ops) {
      const idemKey = typeof op?.idemKey === 'string' ? op.idemKey : '';
      if (stopped) {
        results.push({ idemKey, status: 'retry' });
        continue; // preserve order
      }
      try {
        const r = await this.dataSource.transaction((m) => this.applyOne(m, userId, op));
        if (r.status === 'applied') touched = true;
        results.push(r);
      } catch (e: any) {
        if (e instanceof RejectOp) {
          results.push({ idemKey, status: 'rejected', reason: e.message });
        } else {
          this.logger.error(`outbox op failed: ${e?.message || e}`, e?.stack);
          results.push({ idemKey, status: 'retry' });
          stopped = true;
        }
      }
    }
    if (touched) await this.invalidateUserSyncCache(userId).catch(() => undefined); // after commit, never inside
    return { results };
  }

  /** Adds `delta` to an account's balance inside the outbox transaction. */
  private async adjustBankBalance(m: EntityManager, userId: string, bankProfileId: string, delta: number) {
    if (!bankProfileId || !Number.isFinite(delta) || delta === 0) return;
    const now = Date.now();
    await m.query(
      `UPDATE core.bank_profiles
         SET current_balance = ROUND((COALESCE(current_balance, 0) + $3)::numeric, 2),
             last_sync_timestamp = $4,
             updated_at = $4
       WHERE id = $1 AND user_id = $2 AND is_deleted = false`,
      [bankProfileId, userId, delta, now],
    );
  }

  /** Plain amount of an existing outbox row (stored encrypted-only for manual entries). */
  private async outboxRowAmount(
    userId: string,
    entity: string,
    entityId: string,
    row: any,
    rowVersion: bigint,
  ): Promise<number> {
    if (row.amount != null && !isNaN(Number(row.amount))) return Math.abs(Number(row.amount));
    if (!row.enc_amount) return 0;
    try {
      if (entity === 'transaction') {
        const dec = await this.fieldCipherService.decryptTransactionFields(userId, {
          id: entityId,
          encAmount: row.enc_amount,
          encMerchant: row.enc_text,
          rowVersion,
        } as any);
        return Math.abs(Number(dec.amount) || 0);
      }
      const dec = await this.fieldCipherService.decryptIncomeFields(userId, {
        id: entityId,
        encAmount: row.enc_amount,
        encSource: row.enc_text,
        rowVersion,
      } as any);
      return Math.abs(Number(dec.amount) || 0);
    } catch {
      return 0;
    }
  }

  private async applyOne(m: EntityManager, userId: string, op: any): Promise<OpResult> {
    if (typeof op?.idemKey !== 'string' || op.idemKey.length < 8 || op.idemKey.length > 64) {
      throw new RejectOp('bad_key');
    }
    const spec = ENTITIES[op.entity as keyof typeof ENTITIES];
    if (!spec) throw new RejectOp('bad_entity');
    if (op.op !== 'upsert' && op.op !== 'delete') throw new RejectOp('bad_op');
    if (typeof op.entityId !== 'string' || op.entityId.length < 1 || op.entityId.length > 80) {
      throw new RejectOp('bad_id');
    }

    // 1. Idempotency. A concurrent duplicate blocks on the PK until the first commits, then hits DO NOTHING.
    const fresh = await m.query(
      `INSERT INTO finance.applied_ops (idem_key, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING 1`,
      [op.idemKey, userId],
    );
    if (!fresh.length) return { idemKey: op.idemKey, status: 'duplicate' };

    const textCol = op.entity === 'transaction' ? 'enc_merchant' : 'enc_source';
    const idxCol = op.entity === 'transaction' ? 'merchant_idx' : 'source_idx';

    // 2. Lock the row so two devices editing it are serialized, then check ownership.
    const [row] = await m.query(
      `SELECT user_id, updated_at, row_version, amount, ${spec.textField} as text_field, enc_amount, ${textCol} as enc_text, bank_profile_id, is_deleted FROM ${spec.table} WHERE id=$1 FOR UPDATE`,
      [op.entityId],
    );
    if (row && row.user_id !== userId) throw new RejectOp('forbidden');

    // An edit for a row the 30-day purge already erased (e.g. from a phone that was offline
    // for weeks) is dropped: "applied" so the phone clears it, the next pull removes the local copy.
    if (!row && (await isErasedRow(m, spec.table, op.entityId))) {
      return { idemKey: op.idemKey, status: 'applied' };
    }

    // 3. Clamp only the upper bound. Offline edits are legitimately old.
    const now = Date.now();
    const claimed = Number(op.payload?.updatedAt);
    const updatedAt = Number.isFinite(claimed) && claimed > 0 ? Math.min(Math.floor(claimed), now + 30_000) : now;

    // 4. Last-write-wins. A stale op is a no-op, but still "applied" so the client drops it.
    if (row && Number(row.updated_at ?? 0) > updatedAt) return { idemKey: op.idemKey, status: 'applied' };

    if (op.op === 'delete') {
      if (row) {
        // Read these before the tombstone write below.
        const wasDeleted = !!row.is_deleted;
        const rowBankProfileId: string | null = row.bank_profile_id ?? null;
        const expectedRowVersion = BigInt(row.row_version ?? 1);
        const nextRowVersion = expectedRowVersion + 1n;
        let encAmount: Buffer;
        let encText: Buffer | null = null;
        let textIdx: Buffer | null = null;

        if (op.entity === 'transaction') {
          const enc = await this.fieldCipherService.encryptTransactionFields(
            userId,
            op.entityId,
            { amount: Number(row.amount ?? 0), merchant: row.text_field },
            expectedRowVersion,
          );
          encAmount = enc.encAmount;
          encText = enc.encMerchant;
          textIdx = enc.merchantIdx;
        } else {
          const enc = await this.fieldCipherService.encryptIncomeFields(
            userId,
            op.entityId,
            { amount: Number(row.amount ?? 0), source: row.text_field },
            expectedRowVersion,
          );
          encAmount = enc.encAmount;
          encText = enc.encSource;
          textIdx = enc.sourceIdx;
        }

        const res = await m.query(
          `UPDATE ${spec.table}
           SET is_deleted=true, updated_at=$3, row_version=$4, enc_amount=$5, ${textCol}=$6, ${idxCol}=$7
           WHERE id=$1 AND user_id=$2 AND row_version=$8 RETURNING 1`,
          [op.entityId, userId, updatedAt, nextRowVersion.toString(), encAmount, encText, textIdx, expectedRowVersion.toString()],
        );
        if (Array.isArray(res) && res.length === 0) throw new Error('delete_concurrency_race');

        // Same balance effect as deleteTransactionEntry: a removed spend goes back to the
        // account, a removed income comes off it. Skipped if the row was already deleted.
        if (!wasDeleted && rowBankProfileId) {
          const amount = await this.outboxRowAmount(userId, op.entity, op.entityId, row, expectedRowVersion);
          if (amount) {
            await this.adjustBankBalance(m, userId, rowBankProfileId, op.entity === 'transaction' ? amount : -amount);
          }
        }
      }
      return { idemKey: op.idemKey, status: 'applied' }; // unknown id: nothing to tombstone
    }

    const isInsert = !row;
    if (isInsert && !op.entityId.startsWith(spec.prefix)) throw new RejectOp('bad_id_prefix'); // can't claim SMS-style IDs
    const f = this.validateOutboxPayload(spec, op.payload, isInsert, now);

    if (f.bankProfileId) {
      const ok = await m.query(
        `SELECT 1 FROM core.bank_profiles WHERE id=$1 AND user_id=$2`,
        [f.bankProfileId, userId],
      );
      if (!ok.length) throw new RejectOp('bad_bank_profile');
    }

    // Single-write encrypted-only mode: plaintext fields are NOT stored in the database
    const dbPayload = { ...f };
    delete dbPayload.amount;
    delete dbPayload[spec.textField];

    const cols = Object.keys(dbPayload); // keys come from the whitelist, never from the client
    const dbCols = cols.map((c) => (spec.cols as any)[c]);
    const vals = cols.map((c) => dbPayload[c]);

    if (isInsert) {
      let encAmount: Buffer;
      let encText: Buffer | null = null;
      let textIdx: Buffer | null = null;

      if (op.entity === 'transaction') {
        const enc = await this.fieldCipherService.encryptTransactionFields(
          userId,
          op.entityId,
          { amount: f.amount, merchant: f.merchant },
          undefined, // row_version = 1
        );
        encAmount = enc.encAmount;
        encText = enc.encMerchant;
        textIdx = enc.merchantIdx;
      } else {
        const enc = await this.fieldCipherService.encryptIncomeFields(
          userId,
          op.entityId,
          { amount: f.amount, source: f.source },
          undefined, // row_version = 1
        );
        encAmount = enc.encAmount;
        encText = enc.encSource;
        textIdx = enc.sourceIdx;
      }

      const ph = vals.map((_, i) => `$${i + 7}`).join(',');
      const ins = await m.query(
        `INSERT INTO ${spec.table} (
           id, user_id, updated_at, row_version, enc_amount, ${textCol}, ${idxCol},
           ${dbCols.join(',')}, is_deleted${op.entity === 'transaction' ? ', sms_id' : ''}
         )
         VALUES ($1,$2,$3,1,$4,$5,$6,${ph}, false${op.entity === 'transaction' ? `, 'manual_entry'` : ''})
         ON CONFLICT (id) DO NOTHING RETURNING 1`,
        [op.entityId, userId, updatedAt, encAmount, encText, textIdx, ...vals],
      );
      if (!ins.length) throw new Error('insert_race'); // another writer took the id: retry, next pass rejects as forbidden

      // Manual entries move the account balance, same as the /sync/manual-transaction path.
      if (f.bankProfileId) {
        const amount = Math.abs(Number(f.amount) || 0);
        await this.adjustBankBalance(m, userId, f.bankProfileId, op.entity === 'transaction' ? -amount : amount);
      }
    } else {
      const expectedRowVersion = BigInt(row.row_version ?? 1);
      // What this row currently takes off (or adds to) its account, read before it changes
      const oldAmount = row.is_deleted
        ? 0
        : await this.outboxRowAmount(userId, op.entity, op.entityId, row, expectedRowVersion);
      const oldBankId: string | null = row.bank_profile_id ?? null;
      let targetAmount = f.amount;
      let targetText = f[spec.textField];

      if ((targetAmount == null || targetText == null) && row.enc_amount) {
        if (op.entity === 'transaction') {
          try {
            const dec = await this.fieldCipherService.decryptTransactionFields(userId, {
              id: op.entityId,
              encAmount: row.enc_amount,
              encMerchant: row.enc_text,
              rowVersion: expectedRowVersion,
            } as any);
            if (targetAmount == null) targetAmount = dec.amount;
            if (targetText == null) targetText = dec.merchant;
          } catch {}
        } else {
          try {
            const dec = await this.fieldCipherService.decryptIncomeFields(userId, {
              id: op.entityId,
              encAmount: row.enc_amount,
              encSource: row.enc_text,
              rowVersion: expectedRowVersion,
            } as any);
            if (targetAmount == null) targetAmount = dec.amount;
            if (targetText == null) targetText = dec.source;
          } catch {}
        }
      }

      if (targetAmount == null) targetAmount = Number(row.amount ?? 0);
      if (targetText == null) targetText = row.text_field ?? '';

      let encAmount: Buffer;
      let encText: Buffer | null = null;
      let textIdx: Buffer | null = null;
      let nextRowVersion: bigint;

      if (op.entity === 'transaction') {
        const enc = await this.fieldCipherService.encryptTransactionFields(
          userId,
          op.entityId,
          { amount: targetAmount, merchant: targetText },
          expectedRowVersion,
        );
        encAmount = enc.encAmount;
        encText = enc.encMerchant;
        textIdx = enc.merchantIdx;
        nextRowVersion = enc.rowVersion;
      } else {
        const enc = await this.fieldCipherService.encryptIncomeFields(
          userId,
          op.entityId,
          { amount: targetAmount, source: targetText },
          expectedRowVersion,
        );
        encAmount = enc.encAmount;
        encText = enc.encSource;
        textIdx = enc.sourceIdx;
        nextRowVersion = enc.rowVersion;
      }

      const set = dbCols.map((c, i) => `${c}=$${i + 8}`).join(',');
      const expectedVerParam = vals.length + 8;
      const upd = await m.query(
        `UPDATE ${spec.table}
         SET ${set ? set + ',' : ''} updated_at=$3, row_version=$4, enc_amount=$5, ${textCol}=$6, ${idxCol}=$7, is_deleted=false
         WHERE id=$1 AND user_id=$2 AND row_version=$${expectedVerParam} RETURNING 1`,
        [op.entityId, userId, updatedAt, nextRowVersion.toString(), encAmount, encText, textIdx, ...vals, expectedRowVersion.toString()],
      );
      if (Array.isArray(upd) && upd.length === 0) throw new Error('update_concurrency_race');

      // An edit that changes the amount or the account moves the balance by the difference
      // (a spend takes money off the account, an income adds it). A row that was deleted had
      // its effect removed already, so only the new amount applies.
      const sign = op.entity === 'transaction' ? -1 : 1;
      const cents = (n: number) => Math.round(n * 100) / 100;
      const newBankId: string | null = 'bankProfileId' in f ? f.bankProfileId ?? null : oldBankId;
      const newAmount = Math.abs(Number(targetAmount) || 0);
      if (oldBankId === newBankId) {
        if (newBankId) await this.adjustBankBalance(m, userId, newBankId, cents(sign * (newAmount - oldAmount)));
      } else {
        if (oldBankId) await this.adjustBankBalance(m, userId, oldBankId, cents(-sign * oldAmount));
        if (newBankId) await this.adjustBankBalance(m, userId, newBankId, cents(sign * newAmount));
      }
    }
    return { idemKey: op.idemKey, status: 'applied' };
  }

  private validateOutboxPayload(
    spec: (typeof ENTITIES)[keyof typeof ENTITIES],
    p: any,
    isInsert: boolean,
    now: number,
  ) {
    if (!p || typeof p !== 'object') throw new RejectOp('bad_payload');
    const out: Record<string, any> = {};
    const str = (k: string, max: number, required: boolean) => {
      const v = p[k];
      if (v == null || v === '') {
        if (required) throw new RejectOp(`missing_${k}`);
        return;
      }
      if (typeof v !== 'string' || v.length > max) throw new RejectOp(`bad_${k}`);
      out[k] = v.trim();
    };

    if (p.amount != null || isInsert) {
      const a = p.amount;
      if (
        typeof a !== 'number' ||
        !Number.isFinite(a) ||
        Math.abs(a) > 1e9 ||
        Math.abs(a * 100 - Math.round(a * 100)) > 1e-6
      ) {
        throw new RejectOp('bad_amount');
      }
      out.amount = a;
    }
    if (p.timestamp != null || isInsert) {
      const t = Number(p.timestamp);
      if (!Number.isInteger(t) || t < 946_684_800_000 || t > now + 86_400_000) {
        throw new RejectOp('bad_timestamp');
      }
      out.timestamp = t;
    }
    str('category', 40, isInsert);
    str(spec.textField, 120, isInsert);
    if (spec.table === 'finance.transactions' && p.status != null) {
      if (!['cleared', 'pending'].includes(p.status)) throw new RejectOp('bad_status');
      out.status = p.status;
    }
    if ('bankProfileId' in p) {
      if (
        p.bankProfileId !== null &&
        (typeof p.bankProfileId !== 'string' || p.bankProfileId.length > 80)
      ) {
        throw new RejectOp('bad_bank_profile');
      }
      out.bankProfileId = p.bankProfileId;
    }
    return out;
  }
}

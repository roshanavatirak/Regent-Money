import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { gzipSync } from 'zlib';
import {
  cardsForPhones,
  HomeCard,
  LIMITS,
  validateCards,
} from './home-cards.schema';
import { DEFAULT_CARDS } from './home-cards.defaults';

export interface LiveRelease {
  version: number;
  /** Full list as published, including paused cards (for the admin and for rollback). */
  cards: HomeCard[];
  /** Pre-built response for phones. */
  body: Buffer;
  gz: Buffer;
  etag: string;
}

/** Any fixed number; serialises concurrent publishes inside Postgres. */
const PUBLISH_LOCK = 7302041;
const RETRY_LOAD_AFTER_MS = 30_000;
const MULTI_INSTANCE_CHECK_MS = 5 * 60_000;

/**
 * Home carousel cards.
 *
 * Postgres holds the truth (one draft row + immutable numbered releases). The live release
 * sits in this process's memory as ready-to-send bytes, so phones never cause a database or
 * Redis call. A release never changes once written, so there is nothing to invalidate:
 * publishing inserts version N+1 and swaps the pointer. Phones learn the number from the
 * X-Home-Cards header on responses they already get and download only when it goes up.
 */
@Injectable()
export class HomeCardsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HomeCardsService.name);
  private live: LiveRelease | null = null;
  private loading: Promise<void> | null = null;
  private loadedOnce = false;
  private lastLoadFailedAt = 0;
  private timer?: NodeJS.Timeout;

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    await this.ensureSchema();
    await this.reload();
    // One instance (today) never needs this. With several, each re-reads the version number
    // every 5 min: ~8,600 primary-key lookups a month per instance.
    if (process.env.HOME_CARDS_MULTI_INSTANCE === 'true') {
      this.timer = setInterval(
        () => void this.checkForNewer(),
        MULTI_INSTANCE_CHECK_MS,
      );
      this.timer.unref();
    }
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Live version number, 0 when nothing has been published yet. Read on every response. */
  get version(): number {
    return this.live?.version ?? 0;
  }

  get liveRelease(): LiveRelease | null {
    return this.live;
  }

  private async ensureSchema() {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.home_card_draft (
          id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
          cards       jsonb NOT NULL,
          rev         int NOT NULL DEFAULT 0,
          updated_by  text,
          updated_at  timestamptz NOT NULL DEFAULT now()
        )`);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.home_card_releases (
          version       int PRIMARY KEY,
          cards         jsonb NOT NULL,
          note          text,
          published_by  text,
          published_at  timestamptz NOT NULL DEFAULT now()
        )`);
    } catch (err: any) {
      this.logger.warn(`Could not create home card tables: ${err?.message}`);
    }
  }

  /** Loads the newest release. Concurrent callers share one query. */
  reload(): Promise<void> {
    if (!this.loading) {
      this.loading = this.loadLatest().finally(() => {
        this.loading = null;
      });
    }
    return this.loading;
  }

  private async loadLatest() {
    try {
      const rows = await this.dataSource.query(
        `SELECT version, cards FROM core.home_card_releases ORDER BY version DESC LIMIT 1`,
      );
      if (rows?.[0]) this.setLive(Number(rows[0].version), rows[0].cards);
      this.loadedOnce = true;
      this.lastLoadFailedAt = 0;
    } catch (err: any) {
      this.lastLoadFailedAt = Date.now();
      this.logger.warn(`Could not load home cards: ${err?.message}`);
    }
  }

  /** If the boot load failed (database asleep), try again, at most every 30 s. */
  async ensureLoaded() {
    if (this.loadedOnce) return;
    if (Date.now() - this.lastLoadFailedAt < RETRY_LOAD_AFTER_MS) return;
    await this.reload();
  }

  private async checkForNewer() {
    try {
      const rows = await this.dataSource.query(
        `SELECT COALESCE(MAX(version), 0) AS v FROM core.home_card_releases`,
      );
      if (Number(rows?.[0]?.v) > this.version) await this.reload();
    } catch {
      /* next tick will retry */
    }
  }

  setLive(version: number, cards: HomeCard[]) {
    const json = JSON.stringify({
      version,
      maxVisible: LIMITS.maxVisible,
      cards: cardsForPhones(cards),
    });
    const body = Buffer.from(json, 'utf8');
    this.live = {
      version,
      cards,
      body,
      gz: gzipSync(body),
      etag: `"hc-${version}"`,
    };
  }

  /* ---------------- admin ---------------- */

  private check(cards: unknown): HomeCard[] {
    const { cards: clean, errors } = validateCards(cards);
    if (errors.length)
      throw new BadRequestException({ message: errors, code: 'INVALID_CARDS' });
    return clean;
  }

  async getAdminState() {
    const [draftRows, releases] = await Promise.all([
      this.dataSource.query(
        `SELECT cards, rev, updated_by, updated_at FROM core.home_card_draft WHERE id = 1`,
      ),
      this.listReleases(),
    ]);
    const draft = draftRows?.[0];
    return {
      draft: draft?.cards ?? this.live?.cards ?? DEFAULT_CARDS,
      rev: draft ? Number(draft.rev) : 0,
      draftUpdatedAt: draft?.updated_at ?? null,
      liveVersion: this.version,
      live: this.live?.cards ?? DEFAULT_CARDS,
      releases,
      limits: LIMITS,
    };
  }

  async listReleases() {
    const rows = await this.dataSource.query(
      `SELECT version, note, published_by, published_at, jsonb_array_length(cards) AS count
         FROM core.home_card_releases ORDER BY version DESC LIMIT $1`,
      [LIMITS.keepReleases],
    );
    return rows.map((r: any) => ({
      version: Number(r.version),
      note: r.note,
      publishedBy: r.published_by,
      publishedAt: r.published_at,
      count: Number(r.count),
    }));
  }

  /** Saves the whole draft. `rev` must match, so two admins can't overwrite each other. */
  async saveDraft(adminId: string, cards: unknown, rev: number) {
    const clean = this.check(cards);
    const rows = await this.dataSource.query(
      `INSERT INTO core.home_card_draft (id, cards, rev, updated_by, updated_at)
       VALUES (1, $1::jsonb, 1, $2, now())
       ON CONFLICT (id) DO UPDATE
         SET cards = EXCLUDED.cards, rev = core.home_card_draft.rev + 1,
             updated_by = EXCLUDED.updated_by, updated_at = now()
         WHERE core.home_card_draft.rev = $3
       RETURNING rev`,
      [JSON.stringify(clean), adminId, rev],
    );
    if (!rows?.length) {
      throw new ConflictException({
        code: 'DRAFT_CHANGED',
        message: 'Another admin saved changes. Reload to see them.',
      });
    }
    return { rev: Number(rows[0].rev), cards: clean };
  }

  /**
   * Publishes `cards` as the next version. `baseVersion` is the live version the admin was
   * looking at; if someone published since, this fails instead of silently overwriting.
   */
  async publish(
    adminId: string,
    cards: unknown,
    note: string | undefined,
    baseVersion: number,
    rollbackOf?: number,
  ) {
    const clean = this.check(cards);
    const cleanNote = (note || '').trim().slice(0, 80) || null;

    const result = await this.dataSource.transaction(async (m) => {
      await m.query(`SELECT pg_advisory_xact_lock($1)`, [PUBLISH_LOCK]);
      const [{ v }] = await m.query(
        `SELECT COALESCE(MAX(version), 0) AS v FROM core.home_card_releases`,
      );
      const current = Number(v);
      if (current !== baseVersion) {
        throw new ConflictException({
          code: 'VERSION_CHANGED',
          message: `Version ${current} was published while you were editing. Reload and check it first.`,
          current,
        });
      }
      const next = current + 1;
      await m.query(
        `INSERT INTO core.home_card_releases (version, cards, note, published_by) VALUES ($1, $2::jsonb, $3, $4)`,
        [next, JSON.stringify(clean), cleanNote, adminId],
      );
      const draft = await m.query(
        `INSERT INTO core.home_card_draft (id, cards, rev, updated_by, updated_at)
         VALUES (1, $1::jsonb, 1, $2, now())
         ON CONFLICT (id) DO UPDATE SET cards = EXCLUDED.cards, rev = core.home_card_draft.rev + 1,
           updated_by = EXCLUDED.updated_by, updated_at = now()
         RETURNING rev`,
        [JSON.stringify(clean), adminId],
      );
      await m.query(`DELETE FROM core.home_card_releases WHERE version <= $1`, [
        next - LIMITS.keepReleases,
      ]);
      await m.query(
        `INSERT INTO core.admin_audit_logs (admin_id, target_user_id, target_email_hmac, action, reason, metadata, created_at)
         VALUES ($1, 'home-cards', NULL, $2, $3, $4, $5)`,
        [
          adminId,
          rollbackOf ? 'HOME_CARDS_ROLLED_BACK' : 'HOME_CARDS_PUBLISHED',
          cleanNote || `Home cards v${next}`,
          JSON.stringify({
            version: next,
            rollbackOf: rollbackOf ?? null,
            cardIds: clean.map((c) => c.id),
          }),
          Date.now(),
        ],
      );
      return { version: next, rev: Number(draft[0].rev) };
    });

    // Only after the commit: phones start seeing the new number on their next response.
    this.setLive(result.version, clean);
    this.logger.log(`Home cards v${result.version} published by ${adminId}`);
    return { version: result.version, rev: result.rev, cards: clean };
  }

  /** Republishes an old release as a new version, so phones holding the old number update. */
  async rollback(adminId: string, version: number, baseVersion: number) {
    const rows = await this.dataSource.query(
      `SELECT cards FROM core.home_card_releases WHERE version = $1`,
      [version],
    );
    if (!rows?.length)
      throw new NotFoundException(`Version ${version} is no longer kept.`);
    return this.publish(
      adminId,
      rows[0].cards,
      `Rollback to v${version}`,
      baseVersion,
      version,
    );
  }
}

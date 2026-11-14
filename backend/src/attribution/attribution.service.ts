import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RedisService } from '../redis/redis.service';
import { PlayIntegrityService } from './play-integrity.service';
import { ATTRIBUTION_SCHEMA_SQL } from './attribution.schema';
import { CLICK_TTL_MS, decideClaim, IntegrityResult } from './claim-rules';
import {
  buildReferrer,
  generateClickToken,
  generateInviteCode,
  integrityPayload,
  isValidCode,
  LinkType,
  normalizeCode,
  parseReferrer,
  playStoreUrl,
} from './referrer';

const DAY_MS = 24 * 60 * 60 * 1000;
const NONCE_TTL_SECONDS = 600;

export interface ClaimInput {
  referrer?: unknown;
  installAt?: unknown;
  clickAt?: unknown;
  integrityToken?: unknown;
  appVersion?: unknown;
}

/**
 * Rows from a raw INSERT/UPDATE ... RETURNING. Depending on the statement the driver gives
 * either the rows or [rows, rowCount]; this always returns the rows.
 */
const rowsOf = (result: any): any[] => (Array.isArray(result) ? (Array.isArray(result[0]) ? result[0] : result) : []);

const seconds = (value: unknown): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 && n < 4_102_444_800 ? n : 0;
};

@Injectable()
export class AttributionService implements OnModuleInit {
  private readonly logger = new Logger(AttributionService.name);

  constructor(
    private readonly db: DataSource,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    private readonly integrity: PlayIntegrityService,
  ) {}

  async onModuleInit() {
    try {
      for (const sql of ATTRIBUTION_SCHEMA_SQL) await this.db.query(sql);
    } catch (err: any) {
      this.logger.error(`Could not prepare attribution tables: ${err?.message}`);
    }
    if (!this.integrity.isConfigured) {
      this.logger.warn('Play Integrity is not configured: invite and campaign installs are held as unverified and not counted.');
    }
  }

  /* ------------------------------------------------------------------ */
  /* Links                                                               */
  /* ------------------------------------------------------------------ */

  /** Where invite links point. Must be a public HTTPS address that serves this backend. */
  private get linkBase(): string {
    const base = this.config.get<string>('INVITE_LINK_BASE_URL') || this.config.get<string>('BACKEND_URL') || '';
    return base.trim().replace(/\/+$/, '');
  }

  /** Null when no public HTTPS address is configured (the app then says links aren't ready). */
  linkUrl(code: string): string | null {
    const base = this.linkBase;
    if (!base) return null;
    if (process.env.NODE_ENV === 'production' && !/^https:\/\//i.test(base)) return null;
    return `${base}/r/${code}`;
  }

  /** A user's one permanent invite link, created the first time they open the invite screen. */
  private async inviteLinkFor(userId: string): Promise<{ id: string; code: string }> {
    const find = () =>
      this.db.query(`SELECT id, code FROM core.tracking_links WHERE owner_user_id = $1 AND type = 'invite'`, [userId]);

    const existing = await find();
    if (existing[0]) return existing[0];

    for (let attempt = 0; attempt < 5; attempt++) {
      const inserted = rowsOf(
        await this.db.query(
          `INSERT INTO core.tracking_links (id, code, type, owner_user_id, created_by, created_at)
           VALUES ($1, $2, 'invite', $3, $3, $4)
           ON CONFLICT DO NOTHING
           RETURNING id, code`,
          [randomUUID(), generateInviteCode(), userId, Date.now()],
        ),
      );
      if (inserted[0]) return inserted[0];
      // Either the random code collided, or a parallel request created this user's link.
      const again = await find();
      if (again[0]) return again[0];
    }
    throw new ConflictException('Couldn’t create your invite link. Try again.');
  }

  /**
   * Someone opened a link. Returns the Play Store address to send them to.
   * A real open gets a one-time click token inside the referrer; nothing about the visitor
   * (IP address, device, browser) is stored.
   */
  async openLink(rawCode: string, mintToken: boolean): Promise<string> {
    const code = normalizeCode(rawCode);
    if (!isValidCode(code)) return playStoreUrl();

    const rows = await this.db.query(
      `SELECT id, type FROM core.tracking_links WHERE code = $1 AND is_active = TRUE`,
      [code],
    );
    const link = rows[0];
    if (!link) return playStoreUrl();
    if (!mintToken) return playStoreUrl(`utm_source=regent&utm_medium=${link.type}`);

    const token = generateClickToken();
    await this.db.query(`INSERT INTO core.link_clicks (token, link_id, created_at) VALUES ($1, $2, $3)`, [
      token,
      link.id,
      Date.now(),
    ]);
    return playStoreUrl(buildReferrer(code, token, link.type as LinkType));
  }

  /* ------------------------------------------------------------------ */
  /* Claim                                                               */
  /* ------------------------------------------------------------------ */

  private nonceKey(userId: string) {
    return `attr:nonce:${userId}`;
  }

  /** Step 1 of a link claim: a single-use nonce the app must bake into its Play Integrity token. */
  async challenge(userId: string) {
    const nonce = randomBytes(24).toString('hex');
    await this.redis.set(this.nonceKey(userId), nonce, NONCE_TTL_SECONDS);
    return {
      userId,
      nonce,
      cloudProjectNumber: this.integrity.cloudProjectNumber,
      integrityRequired: this.integrity.mode === 'enforce',
    };
  }

  /**
   * Records how this account's install arrived. Called once by the app after sign-in.
   * The answer is deliberately bare ({ done }) so it tells an attacker nothing about why
   * a claim was or wasn't counted.
   */
  async claim(userId: string, input: ClaimInput): Promise<{ done: boolean }> {
    const existing = await this.db.query(`SELECT status FROM core.install_attributions WHERE user_id = $1`, [userId]);
    if (existing[0] && existing[0].status !== 'unverified') return { done: true };

    const users = await this.db.query(`SELECT created_at FROM core.users WHERE id = $1 AND is_deleted = FALSE`, [userId]);
    if (!users[0]) throw new NotFoundException('Account not found.');

    const now = Date.now();
    const rawReferrer = typeof input.referrer === 'string' ? input.referrer.slice(0, 1024) : '';
    const installAtSeconds = seconds(input.installAt);
    const clickAtSeconds = seconds(input.clickAt);
    const parsed = parseReferrer(rawReferrer);

    let link: any = null;
    let click: any = null;
    let integrity: IntegrityResult = 'not_required';
    let integrityDetail: string | null = null;
    let inviterAcceptedToday = 0;

    if (parsed.kind === 'link') {
      const links = await this.db.query(
        `SELECT id, type, owner_user_id, is_active FROM core.tracking_links WHERE code = $1`,
        [parsed.code],
      );
      link = links[0] || null;

      if (link) {
        const clicks = await this.db.query(
          `SELECT created_at, claimed_by FROM core.link_clicks WHERE token = $1 AND link_id = $2`,
          [parsed.clickToken, link.id],
        );
        click = clicks[0] || null;

        const counts = await this.db.query(
          `SELECT COUNT(*)::int AS n FROM core.install_attributions
           WHERE link_id = $1 AND status = 'accepted' AND created_at > $2`,
          [link.id, now - DAY_MS],
        );
        inviterAcceptedToday = counts[0]?.n ?? 0;
      }

      // The nonce is single use: read it and delete it before asking Google anything.
      const nonce = await this.redis.get(this.nonceKey(userId)).catch(() => null);
      await this.redis.del(this.nonceKey(userId)).catch(() => false);
      if (!nonce) {
        integrity = 'unavailable';
        integrityDetail = 'no_challenge';
      } else {
        const expectedHash = createHash('sha256')
          .update(integrityPayload(userId, nonce, rawReferrer, installAtSeconds, clickAtSeconds), 'utf8')
          .digest('hex');
        const checked = await this.integrity.verify(input.integrityToken, expectedHash);
        integrity = checked.result;
        integrityDetail = checked.detail;
      }
    }

    const decision = decideClaim({
      parsed,
      userId,
      userCreatedAt: Number(users[0].created_at) || now,
      now,
      installAt: installAtSeconds * 1000,
      link: link
        ? { id: link.id, type: link.type, ownerUserId: link.owner_user_id, isActive: link.is_active }
        : null,
      click: click ? { createdAt: Number(click.created_at), claimedBy: click.claimed_by } : null,
      integrity,
      integrityMode: this.integrity.mode,
      inviterAcceptedToday,
    });

    const appVersion = typeof input.appVersion === 'string' ? input.appVersion.replace(/[^0-9A-Za-z.\-]/g, '').slice(0, 20) : null;

    await this.db.transaction(async (m) => {
      let status = decision.status;
      let reason = decision.reason;
      let clickToken: string | null = null;

      if (decision.consumeClick && parsed.kind === 'link') {
        // One conditional UPDATE: of two accounts racing for the same click, only one wins.
        const won = rowsOf(
          await m.query(
            `UPDATE core.link_clicks SET claimed_by = $1, claimed_at = $2
             WHERE token = $3 AND (claimed_by IS NULL OR claimed_by = $1)
             RETURNING token`,
            [userId, now, parsed.clickToken],
          ),
        );
        if (won.length === 1) {
          clickToken = parsed.clickToken;
        } else {
          status = 'rejected';
          reason = 'click_reused';
        }
      }

      await m.query(
        `INSERT INTO core.install_attributions
           (id, user_id, source_type, link_id, click_token, referrer, click_at, install_at,
            status, reject_reason, integrity_verdict, integrity_detail, app_version, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $14)
         ON CONFLICT (user_id) DO UPDATE SET
           source_type = EXCLUDED.source_type, link_id = EXCLUDED.link_id, click_token = EXCLUDED.click_token,
           referrer = EXCLUDED.referrer, click_at = EXCLUDED.click_at, install_at = EXCLUDED.install_at,
           status = EXCLUDED.status, reject_reason = EXCLUDED.reject_reason,
           integrity_verdict = EXCLUDED.integrity_verdict, integrity_detail = EXCLUDED.integrity_detail,
           app_version = EXCLUDED.app_version, updated_at = EXCLUDED.updated_at
         WHERE core.install_attributions.status = 'unverified'`,
        [
          randomUUID(),
          userId,
          decision.sourceType,
          decision.linkId,
          clickToken,
          parsed.sanitized || null,
          clickAtSeconds ? clickAtSeconds * 1000 : null,
          installAtSeconds ? installAtSeconds * 1000 : null,
          status,
          reason,
          integrity,
          integrityDetail,
          appVersion,
          now,
        ],
      );

      decision.status = status;
    });

    return { done: decision.status !== 'unverified' };
  }

  /* ------------------------------------------------------------------ */
  /* What a user sees: their link and totals, never names                */
  /* ------------------------------------------------------------------ */

  async myInvite(userId: string) {
    const link = await this.inviteLinkFor(userId);
    const [joined] = await this.db.query(
      `SELECT COUNT(*)::int AS n
       FROM core.install_attributions a
       JOIN core.users u ON u.id = a.user_id
       WHERE a.link_id = $1 AND a.status = 'accepted'
         AND u.is_verified = TRUE AND u.is_deleted = FALSE AND u.is_banned = FALSE`,
      [link.id],
    );
    const [opens] = await this.db.query(`SELECT COUNT(*)::int AS n FROM core.link_clicks WHERE link_id = $1`, [link.id]);
    return { code: link.code, link: this.linkUrl(link.code), opens: opens?.n ?? 0, joined: joined?.n ?? 0 };
  }

  /* ------------------------------------------------------------------ */
  /* Admin                                                               */
  /* ------------------------------------------------------------------ */

  async adminOverview(days: number) {
    const since = days > 0 ? Date.now() - days * DAY_MS : 0;
    const liveUser = `u.is_deleted = FALSE AND u.is_banned = FALSE`;

    const sources = await this.db.query(
      `SELECT a.source_type AS "sourceType", COUNT(*)::int AS users
       FROM core.install_attributions a JOIN core.users u ON u.id = a.user_id
       WHERE a.status = 'accepted' AND a.created_at >= $1 AND ${liveUser}
       GROUP BY a.source_type ORDER BY users DESC`,
      [since],
    );

    const [funnel] = await this.db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM core.link_clicks c JOIN core.tracking_links l ON l.id = c.link_id
           WHERE l.type = 'invite' AND c.created_at >= $1) AS opens,
         COUNT(*) FILTER (WHERE a.status = 'accepted')::int   AS joined,
         COUNT(*) FILTER (WHERE a.status = 'review')::int     AS review,
         COUNT(*) FILTER (WHERE a.status = 'unverified')::int AS unverified,
         COUNT(*) FILTER (WHERE a.status = 'rejected')::int   AS rejected
       FROM core.install_attributions a
       JOIN core.tracking_links l ON l.id = a.link_id AND l.type = 'invite'
       WHERE a.created_at >= $1`,
      [since],
    );

    const inviters = await this.db.query(
      `SELECT l.owner_user_id AS "userId", u.name, u.email, l.code,
         COUNT(*) FILTER (WHERE a.status = 'accepted')::int AS joined,
         COUNT(*) FILTER (WHERE a.status = 'review')::int   AS review,
         COUNT(*) FILTER (WHERE a.status = 'rejected')::int AS rejected
       FROM core.install_attributions a
       JOIN core.tracking_links l ON l.id = a.link_id AND l.type = 'invite'
       JOIN core.users u ON u.id = l.owner_user_id
       WHERE a.created_at >= $1 AND ${liveUser}
       GROUP BY l.owner_user_id, u.name, u.email, l.code
       HAVING COUNT(*) FILTER (WHERE a.status IN ('accepted', 'review')) > 0
       ORDER BY joined DESC, review DESC
       LIMIT 50`,
      [since],
    );

    const campaigns = await this.db.query(
      `SELECT l.id, l.code, l.campaign_name AS name, l.channel, l.is_active AS "isActive", l.created_at AS "createdAt",
         (SELECT COUNT(*)::int FROM core.link_clicks c WHERE c.link_id = l.id AND c.created_at >= $1) AS opens,
         (SELECT COUNT(*)::int FROM core.install_attributions a
           WHERE a.link_id = l.id AND a.status = 'accepted' AND a.created_at >= $1) AS joined
       FROM core.tracking_links l
       WHERE l.type = 'campaign'
       ORDER BY l.created_at DESC
       LIMIT 100`,
      [since],
    );

    return {
      days,
      integrityConfigured: this.integrity.isConfigured,
      integrityMode: this.integrity.mode,
      sources,
      funnel: funnel || { opens: 0, joined: 0, review: 0, unverified: 0, rejected: 0 },
      inviters,
      campaigns: campaigns.map((c: any) => ({ ...c, createdAt: Number(c.createdAt), link: this.linkUrl(c.code) })),
    };
  }

  async createCampaign(adminId: string, input: { name?: unknown; channel?: unknown; code?: unknown }) {
    const name = String(input.name ?? '').trim().slice(0, 80);
    const channel = String(input.channel ?? '').trim().slice(0, 40) || null;
    const code = normalizeCode(input.code);
    if (name.length < 3) throw new BadRequestException('Give the campaign a name (at least 3 characters).');
    if (!isValidCode(code)) {
      throw new BadRequestException('Link code must be 3 to 40 characters: letters, numbers and hyphens.');
    }

    const inserted = rowsOf(
      await this.db.query(
        `INSERT INTO core.tracking_links (id, code, type, campaign_name, channel, created_by, created_at)
         VALUES ($1, $2, 'campaign', $3, $4, $5, $6)
         ON CONFLICT (code) DO NOTHING
         RETURNING id`,
        [randomUUID(), code, name, channel, adminId, Date.now()],
      ),
    );
    if (!inserted[0]) throw new ConflictException('That link code is already taken. Try another.');
    return { id: inserted[0].id, code, name, channel, link: this.linkUrl(code) };
  }

  async setCampaignActive(id: string, isActive: boolean) {
    const updated = rowsOf(
      await this.db.query(
        `UPDATE core.tracking_links SET is_active = $2 WHERE id = $1 AND type = 'campaign' RETURNING id`,
        [id, !!isActive],
      ),
    );
    if (!updated.length) throw new NotFoundException('Campaign not found.');
    return { id, isActive: !!isActive };
  }

  /** Approve or reject every invite held for review under one inviter. Written to the audit log. */
  async resolveReview(adminId: string, inviterUserId: string, approve: boolean) {
    const status = approve ? 'accepted' : 'rejected';
    const now = Date.now();
    let changed = 0;

    await this.db.transaction(async (m) => {
      const rows = rowsOf(
        await m.query(
          `UPDATE core.install_attributions a
           SET status = $1, reject_reason = CASE WHEN $1 = 'rejected' THEN 'admin_rejected' ELSE NULL END, updated_at = $2
           FROM core.tracking_links l
           WHERE l.id = a.link_id AND l.type = 'invite' AND l.owner_user_id = $3 AND a.status = 'review'
           RETURNING a.id`,
          [status, now, inviterUserId],
        ),
      );
      changed = rows.length;
      await m.query(
        `INSERT INTO core.admin_audit_logs (admin_id, target_user_id, action, reason, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [adminId, inviterUserId, approve ? 'APPROVE_INVITES' : 'REJECT_INVITES', `${changed} invites held for review`, now],
      );
    });

    return { changed, status };
  }

  /** Unused click tokens are useless once Google Play has forgotten the referrer (90 days). */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeExpiredClicks() {
    try {
      await this.db.query(`DELETE FROM core.link_clicks WHERE claimed_by IS NULL AND created_at < $1`, [
        Date.now() - CLICK_TTL_MS,
      ]);
    } catch (err: any) {
      this.logger.warn(`Click cleanup failed: ${err?.message}`);
    }
  }
}

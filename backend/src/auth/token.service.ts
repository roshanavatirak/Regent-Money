import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { IsNull, LessThan, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { RefreshToken } from './entities/refresh-token.entity';
import { RedisService } from '../redis/redis.service';

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

/** Access tokens: short, checked by signature only. */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Refresh tokens slide: each refresh gives a fresh window. */
export const REFRESH_TTL_REMEMBER_MS = 30 * DAY;
export const REFRESH_TTL_SESSION_MS = 1 * DAY;
/** A just-replaced refresh token still works this long (dropped network, app killed mid-refresh). */
export const REFRESH_GRACE_MS = 30 * 1000;
/** Background SMS token: only accepted by /sync/direct-sms, and only while its session is alive. */
export const INGEST_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
/** A blacklisted user's older access tokens are refused for at least as long as they could live. */
const USER_DENY_MS = ACCESS_TOKEN_TTL_SECONDS * 1000 + 5 * MINUTE;

export type TokenUser = { id: string; email?: string | null; role?: string | null };

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Long-lived token the Android background SMS worker uses (only /sync/direct-sms accepts it). */
  ingestToken: string;
}

export class SessionError extends UnauthorizedException {
  constructor(code: 'SESSION_INVALID' | 'SESSION_EXPIRED' | 'SESSION_REVOKED', message: string) {
    super({ statusCode: 401, error: 'Unauthorized', code, message });
  }
}

export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

/**
 * Issues and rotates tokens, and keeps the blacklist that makes log-out and bans immediate.
 * The blacklist lives in this server's memory (checked on every request, no Redis read) and is
 * copied to Redis only so it survives a restart.
 */
@Injectable()
export class TokenService implements OnModuleInit {
  private readonly logger = new Logger(TokenService.name);
  /** userId -> access tokens issued before this (seconds) are refused; value expires at `until`. */
  private readonly deniedUsers = new Map<string, { since: number; until: number }>();
  /** jti -> when that access token expires (ms). */
  private readonly deniedJtis = new Map<string, number>();

  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    try {
      await this.repo.query(`
        CREATE TABLE IF NOT EXISTS core.refresh_tokens (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, family_id TEXT NOT NULL, token_hash TEXT NOT NULL,
          device_name TEXT, remember BOOLEAN NOT NULL DEFAULT TRUE, created_at BIGINT NOT NULL,
          last_used_at BIGINT, expires_at BIGINT NOT NULL, revoked_at BIGINT, replaced_by TEXT, replaced_at BIGINT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON core.refresh_tokens (token_hash);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON core.refresh_tokens (user_id, revoked_at);
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON core.refresh_tokens (family_id);
      `);
    } catch (err: any) {
      this.logger.warn(`Could not verify core.refresh_tokens: ${err?.message || err}`);
    }
    await this.loadDenylist();
  }

  /* ------------------------------------------------------------------ */
  /* Issuing                                                             */
  /* ------------------------------------------------------------------ */

  private signAccess(user: TokenUser, familyId: string) {
    return this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role || 'user', typ: 'access', jti: randomUUID(), fid: familyId },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
  }

  private signIngest(user: TokenUser, familyId: string) {
    return this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role || 'user', typ: 'ingest', fid: familyId },
      { expiresIn: INGEST_TOKEN_TTL_SECONDS },
    );
  }

  private async createRefreshRow(userId: string, familyId: string, remember: boolean, deviceName: string | null) {
    const raw = randomBytes(32).toString('base64url');
    const now = Date.now();
    const row = this.repo.create({
      id: randomUUID(),
      userId,
      familyId,
      tokenHash: hashToken(raw),
      deviceName: deviceName ? deviceName.slice(0, 80) : null,
      remember,
      createdAt: now,
      lastUsedAt: null,
      expiresAt: now + (remember ? REFRESH_TTL_REMEMBER_MS : REFRESH_TTL_SESSION_MS),
      revokedAt: null,
      replacedBy: null,
      replacedAt: null,
    });
    await this.repo.save(row);
    return { raw, row };
  }

  /** New session for a login: a new device family. */
  async issuePair(user: TokenUser, opts: { remember?: boolean; deviceName?: string | null } = {}): Promise<TokenPair> {
    const familyId = randomUUID();
    const { raw } = await this.createRefreshRow(user.id, familyId, opts.remember !== false, opts.deviceName ?? null);
    return {
      accessToken: this.signAccess(user, familyId),
      refreshToken: raw,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      ingestToken: this.signIngest(user, familyId),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Refreshing                                                          */
  /* ------------------------------------------------------------------ */

  /**
   * Swaps a refresh token for a new pair. Rules:
   *  - unknown token -> SESSION_INVALID
   *  - cancelled family, or expired -> SESSION_REVOKED / SESSION_EXPIRED
   *  - replaced less than 30 s ago -> allowed again (lost reply, app killed mid-refresh)
   *  - replaced longer ago -> someone kept a copy: cancel the whole family (SESSION_REVOKED)
   *  - account banned, deleted or "logged out everywhere" since -> family cancelled
   */
  async refresh(rawToken: string): Promise<TokenPair> {
    if (!rawToken || typeof rawToken !== 'string') {
      throw new SessionError('SESSION_INVALID', 'Your session ended. Log in again.');
    }
    const now = Date.now();
    const row = await this.repo.findOne({ where: { tokenHash: hashToken(rawToken) } });
    if (!row) throw new SessionError('SESSION_INVALID', 'Your session ended. Log in again.');
    if (row.revokedAt) throw new SessionError('SESSION_REVOKED', 'You were logged out. Log in again.');
    if (row.expiresAt <= now) throw new SessionError('SESSION_EXPIRED', 'Your session expired. Log in again.');

    if (row.replacedBy && row.replacedAt && now - row.replacedAt > REFRESH_GRACE_MS) {
      this.logger.warn(`[Auth] Reused refresh token for user ${row.userId}; cancelling device session ${row.familyId}`);
      await this.revokeFamily(row.familyId);
      throw new SessionError('SESSION_REVOKED', 'For your security you were logged out. Log in again.');
    }

    const users = await this.repo.query(
      `SELECT id, email, role, is_banned, is_deleted, tokens_valid_after FROM core.users WHERE id = $1`,
      [row.userId],
    );
    const user = users?.[0];
    const validAfterMs = Number(user?.tokens_valid_after || 0) * 1000;
    if (!user || user.is_deleted || user.is_banned || (validAfterMs && row.createdAt < validAfterMs)) {
      await this.revokeFamily(row.familyId);
      throw new SessionError('SESSION_REVOKED', 'You were logged out. Log in again.');
    }

    const { raw, row: next } = await this.createRefreshRow(row.userId, row.familyId, row.remember, row.deviceName);
    // Only the first replacement is recorded; a retry within the grace period adds a sibling.
    if (!row.replacedBy) {
      row.replacedBy = next.id;
      row.replacedAt = now;
    }
    row.lastUsedAt = now;
    await this.repo.save(row);

    const tokenUser = { id: user.id, email: user.email, role: user.role };
    return {
      accessToken: this.signAccess(tokenUser, row.familyId),
      refreshToken: raw,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      ingestToken: this.signIngest(tokenUser, row.familyId),
    };
  }

  /* ------------------------------------------------------------------ */
  /* Logging out and blacklisting                                        */
  /* ------------------------------------------------------------------ */

  async revokeFamily(familyId: string) {
    await this.repo.update({ familyId, revokedAt: IsNull() }, { revokedAt: Date.now() });
  }

  /** "Log out" on one device: cancels its refresh tokens and its current access token. */
  async logoutDevice(opts: { refreshToken?: string; familyId?: string; jti?: string; accessExp?: number }) {
    let familyId = opts.familyId;
    if (!familyId && opts.refreshToken) {
      const row = await this.repo.findOne({ where: { tokenHash: hashToken(opts.refreshToken) } });
      familyId = row?.familyId;
    }
    if (familyId) await this.revokeFamily(familyId);
    if (opts.jti && opts.accessExp) await this.denyJti(opts.jti, opts.accessExp * 1000);
  }

  /** Ban, account deletion or "log out everywhere": every session of the user stops now. */
  async revokeAllForUser(userId: string) {
    await this.repo.update({ userId, revokedAt: IsNull() }, { revokedAt: Date.now() });
    await this.denyUser(userId);
  }

  async denyUser(userId: string, sinceSeconds = Math.floor(Date.now() / 1000)) {
    const until = Date.now() + USER_DENY_MS;
    this.deniedUsers.set(userId, { since: sinceSeconds, until });
    await this.redis
      .executeCommand(['SET', `auth:deny:user:${userId}`, String(sinceSeconds), 'EX', Math.ceil(USER_DENY_MS / 1000)])
      .catch(() => null);
  }

  async denyJti(jti: string, expiresAtMs: number) {
    const ttlMs = expiresAtMs - Date.now();
    if (ttlMs <= 0) return;
    this.deniedJtis.set(jti, expiresAtMs);
    await this.redis.executeCommand(['SET', `auth:deny:jti:${jti}`, '1', 'EX', Math.ceil(ttlMs / 1000)]).catch(() => null);
  }

  /** Checked on every request with an access token. Memory only: no Redis, no database. */
  isAccessDenied(payload: { sub: string; jti?: string; iat?: number }): boolean {
    const now = Date.now();
    if (payload.jti) {
      const until = this.deniedJtis.get(payload.jti);
      if (until && until > now) return true;
      if (until) this.deniedJtis.delete(payload.jti);
    }
    const user = this.deniedUsers.get(payload.sub);
    if (user) {
      if (user.until <= now) this.deniedUsers.delete(payload.sub);
      else if (typeof payload.iat !== 'number' || payload.iat <= user.since) return true;
    }
    return false;
  }

  /**
   * The background SMS token is only valid while its device session is alive and the account is
   * active. Checked against the database: these requests are rare (one per batch of SMS).
   */
  async isIngestSessionAlive(userId: string, familyId?: string): Promise<boolean> {
    if (!familyId) return false;
    const rows = await this.repo.query(
      `SELECT 1 FROM core.refresh_tokens rt
         JOIN core.users u ON u.id = rt.user_id
        WHERE rt.family_id = $1 AND rt.user_id = $2 AND rt.revoked_at IS NULL AND rt.expires_at > $3
          AND COALESCE(u.is_banned, false) = false AND COALESCE(u.is_deleted, false) = false
        LIMIT 1`,
      [familyId, userId, Date.now()],
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  /** Restores the blacklist from Redis after a restart. */
  private async loadDenylist() {
    try {
      let cursor = '0';
      for (let i = 0; i < 50; i++) {
        const res = await this.redis.executeCommand(['SCAN', cursor, 'MATCH', 'auth:deny:*', 'COUNT', 200]);
        if (!Array.isArray(res)) return;
        cursor = String(res[0]);
        for (const key of (res[1] as string[]) || []) {
          const ttl = Number(await this.redis.executeCommand(['PTTL', key]));
          if (!(ttl > 0)) continue;
          if (key.startsWith('auth:deny:jti:')) {
            this.deniedJtis.set(key.slice('auth:deny:jti:'.length), Date.now() + ttl);
          } else if (key.startsWith('auth:deny:user:')) {
            const since = Number(await this.redis.executeCommand(['GET', key]));
            if (since) this.deniedUsers.set(key.slice('auth:deny:user:'.length), { since, until: Date.now() + ttl });
          }
        }
        if (cursor === '0') return;
      }
    } catch (err: any) {
      this.logger.warn(`Could not load the token blacklist from Redis: ${err?.message || err}`);
    }
  }

  /** Nightly: remove expired refresh tokens and old cancelled ones. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async purgeOldTokens(now = Date.now()) {
    try {
      await this.repo.delete({ expiresAt: LessThan(now - DAY) });
      await this.repo
        .createQueryBuilder()
        .delete()
        .from(RefreshToken)
        .where('revoked_at IS NOT NULL AND revoked_at < :cutoff', { cutoff: now - 7 * DAY })
        .execute();
    } catch (err: any) {
      this.logger.warn(`[TokenCleanup] failed: ${err?.message || err}`);
    }
  }
}

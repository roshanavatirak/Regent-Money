import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service';
import { TokenService } from './token.service';
import { ALLOW_INGEST_TOKEN } from './allow-ingest-token.decorator';

/**
 * How long this server remembers an account's status in its own memory. Matches the 60 s
 * Redis TTL, so an active user costs ~1 Redis read a minute instead of ~6. Bans, deletion and
 * sign-out write the key through RedisService on this same server, which updates memory at once.
 */
const STATUS_MEMORY_MS = 60_000;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly tokenService: TokenService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token is required.');
    }

    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch (err) {
      if (err instanceof TokenExpiredError) {
        // The app refreshes silently and retries when it sees this code
        throw new UnauthorizedException({
          statusCode: 401,
          error: 'Unauthorized',
          code: 'TOKEN_EXPIRED',
          message: 'Your session needs refreshing.',
        });
      }
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new UnauthorizedException('Malformed token payload.');
    }

    // 15-minute access tokens: signature + in-memory blacklist only (no Redis, no database).
    // Bans and "log out everywhere" are added to the blacklist, so they apply immediately.
    if (payload.typ === 'access') {
      if (this.tokenService.isAccessDenied(payload)) {
        throw new UnauthorizedException({
          statusCode: 401,
          error: 'Unauthorized',
          code: 'SESSION_REVOKED',
          message: 'You have been signed out. Please sign in again.',
        });
      }
      this.attachUser(request, payload);
      return true;
    }

    // Background SMS token: only on routes marked @AllowIngestToken(), only while its device
    // session is alive (checked in the database; these requests are rare).
    if (payload.typ === 'ingest') {
      const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_INGEST_TOKEN, [
        context.getHandler(),
        context.getClass(),
      ]);
      if (!allowed) {
        throw new UnauthorizedException('This token can only be used for background SMS sync.');
      }
      if (this.tokenService.isAccessDenied({ sub: userId, iat: payload.iat })) {
        throw new UnauthorizedException({ statusCode: 401, error: 'Unauthorized', code: 'SESSION_REVOKED', message: 'Signed out.' });
      }
      const alive = await this.tokenService.isIngestSessionAlive(userId, payload.fid);
      if (!alive) {
        throw new UnauthorizedException({ statusCode: 401, error: 'Unauthorized', code: 'SESSION_REVOKED', message: 'Signed out.' });
      }
      this.attachUser(request, payload);
      return true;
    }

    // Older 30-day tokens (issued before refresh tokens) keep the account status check below
    // until they expire.

    const cacheKey = `user:status:${userId}`;

    // 1. Fast Redis Status Check ('active[:<tokensValidAfter>]' | 'banned' | 'deleted')
    let status: 'active' | 'banned' | 'deleted' | null = null;
    let tokensValidAfter = 0;
    try {
      const cached = await this.redisService.get(cacheKey, { l1TtlMs: STATUS_MEMORY_MS });
      if (cached) {
        const [cachedStatus, validAfter] = cached.split(':');
        status = cachedStatus as any;
        tokensValidAfter = Number(validAfter) || 0;
      }
    } catch {
      status = null; // On Redis failure, fall through to database
    }

    // 2. Database Fallback on Cache Miss / Redis Failure
    if (!status) {
      const rows = await this.dataSource.query(
        `SELECT id, is_banned, is_deleted, tokens_valid_after FROM core.users WHERE id = $1`,
        [userId],
      );

      if (!rows || rows.length === 0 || rows[0].is_deleted) {
        status = 'deleted';
        // Tombstone in Redis for 30 days (matching JWT max lifetime)
        await this.redisService.set(cacheKey, 'deleted', 30 * 86400).catch(() => {});
      } else if (rows[0].is_banned) {
        status = 'banned';
        // 1-hour self-healing TTL so any stale ban can re-verify with DB
        await this.redisService.set(cacheKey, 'banned', 3600).catch(() => {});
      } else {
        status = 'active';
        tokensValidAfter = Number(rows[0].tokens_valid_after) || 0;
        // Cache active status (with the sign-out cutoff) for 60s
        await this.redisService.set(cacheKey, `active:${tokensValidAfter}`, 60, { l1TtlMs: STATUS_MEMORY_MS }).catch(() => {});
      }
    }

    // 3. Enforce User Status
    if (status === 'banned') {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'USER_BANNED',
        message: 'Your account has been suspended by an administrator.',
      });
    }

    if (status === 'deleted') {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'ACCOUNT_DELETED',
        message: 'This account no longer exists.',
      });
    }

    // Tokens issued before the user's last sign-out are revoked
    if (tokensValidAfter && (typeof payload.iat !== 'number' || payload.iat < tokensValidAfter)) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: 'Unauthorized',
        code: 'SESSION_REVOKED',
        message: 'You have been signed out. Please sign in again.',
      });
    }

    this.attachUser(request, payload);
    return true;
  }

  private attachUser(request: Request, payload: any) {
    (request as any)['user'] = {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      tokenType: payload.typ || 'legacy',
      jti: payload.jti,
      familyId: payload.fid,
      exp: payload.exp,
    };
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

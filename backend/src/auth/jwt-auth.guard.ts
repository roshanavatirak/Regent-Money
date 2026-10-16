import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
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
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }

    const userId = payload.sub;
    if (!userId) {
      throw new UnauthorizedException('Malformed token payload.');
    }

    const cacheKey = `user:status:${userId}`;

    // 1. Fast Redis Status Check ('active' | 'banned' | 'deleted')
    let status: 'active' | 'banned' | 'deleted' | null = null;
    try {
      status = (await this.redisService.get(cacheKey)) as any;
    } catch {
      status = null; // On Redis failure, fall through to database
    }

    // 2. Database Fallback on Cache Miss / Redis Failure
    if (!status) {
      const rows = await this.dataSource.query(
        `SELECT id, is_banned, is_deleted FROM core.users WHERE id = $1`,
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
        // Cache active status for 60s
        await this.redisService.set(cacheKey, 'active', 60).catch(() => {});
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

    // Attach user payload to request context
    (request as any)['user'] = {
      id: userId,
      email: payload.email,
      role: payload.role,
    };

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

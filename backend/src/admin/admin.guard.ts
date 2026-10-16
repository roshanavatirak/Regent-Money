import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Admin access required.');
    }

    const cacheKey = `user:role:${userId}`;
    let role: string | null = null;
    try {
      role = await this.redisService.get(cacheKey);
    } catch {
      role = null;
    }

    if (!role) {
      const rows = await this.dataSource.query(
        `SELECT id, role, is_banned, is_deleted FROM core.users WHERE id = $1`,
        [userId],
      );

      if (!rows || rows.length === 0 || rows[0].is_deleted || rows[0].is_banned) {
        throw new ForbiddenException('You do not have administrative privileges.');
      }

      const resolvedRole: string = rows[0].role || 'user';
      role = resolvedRole;
      // Cache role for 60 seconds
      await this.redisService.set(cacheKey, resolvedRole, 60).catch(() => {});
    }

    if (role !== 'admin' && role !== 'superadmin') {
      throw new ForbiddenException('You do not have administrative privileges.');
    }

    request.user.role = role;
    return true;
  }
}

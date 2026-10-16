import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { User } from '../users/entities/user.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { RedisService } from '../redis/redis.service';

export const CASCADE_DELETE_TABLES = [
  { schema: 'core', table: 'notifications', column: 'user_id' },
  { schema: 'core', table: 'bank_profiles', column: 'user_id' },
  { schema: 'finance', table: 'budget_declarations', column: 'user_id' },
  { schema: 'finance', table: 'budget_transaction_exclusions', column: 'user_id' },
  { schema: 'finance', table: 'income_records', column: 'user_id' },
  { schema: 'finance', table: 'salary_history', column: 'user_id' },
  { schema: 'finance', table: 'salary_model', column: 'user_id' },
  { schema: 'finance', table: 'subscription_tracking', column: 'user_id' },
  { schema: 'finance', table: 'transactions', column: 'user_id' },
  { schema: 'finance', table: 'user_merchant_tags', column: 'user_id' },
  { schema: 'wealth', table: 'assets', column: 'user_id' },
  { schema: 'wealth', table: 'goal_contributions', column: 'user_id' },
  { schema: 'wealth', table: 'goal_history', column: 'user_id' },
  { schema: 'wealth', table: 'liabilities', column: 'user_id' },
  { schema: 'wealth', table: 'net_worth_snapshots', column: 'user_id' },
  { schema: 'wealth', table: 'savings_goals', column: 'user_id' },
  { schema: 'wealth', table: 'scenario_simulations', column: 'user_id' },
  { schema: 'core', table: 'users', column: 'id' },
] as const;

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(AdminAuditLog)
    private readonly auditRepo: Repository<AdminAuditLog>,
  ) {}

  private getHmac(email: string): string {
    const secret =
      this.configService.get<string>('AUDIT_HMAC_SECRET') ||
      this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('FATAL: Neither AUDIT_HMAC_SECRET nor JWT_SECRET is configured.');
    }
    return crypto
      .createHmac('sha256', secret)
      .update(email.toLowerCase().trim())
      .digest('hex');
  }

  async getStats() {
    const [total, banned] = await Promise.all([
      this.userRepo.count({ where: { isDeleted: false } }),
      this.userRepo.count({ where: { isDeleted: false, isBanned: true } }),
    ]);

    return {
      totalUsers: total,
      activeUsers: Math.max(0, total - banned),
      bannedUsers: banned,
    };
  }

  async getUsers(page = 1, limit = 25, search?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const qb = this.userRepo
      .createQueryBuilder('u')
      .select([
        'u.id',
        'u.name',
        'u.email',
        'u.phone',
        'u.role',
        'u.isBanned',
        'u.bannedAt',
        'u.banReason',
        'u.isVerified',
        'u.authProvider',
        'u.createdAt',
        'u.avatarUrl',
      ])
      .where('u.isDeleted = false');

    if (search && search.trim()) {
      // Escape backslashes first, then LIKE wildcards % and _
      const sanitized = search
        .trim()
        .toLowerCase()
        .replace(/\\/g, '\\\\')
        .replace(/[%_]/g, '\\$&');

      // Uses exact expression from trigram GIN index
      qb.andWhere(
        "(COALESCE(u.name, '') || ' ' || COALESCE(u.email, '') || ' ' || COALESCE(u.phone, '')) ILIKE :s",
        { s: `%${sanitized}%` },
      );
    }

    qb.orderBy('u.createdAt', 'DESC')
      .skip((safePage - 1) * safeLimit)
      .take(safeLimit);

    const [users, total] = await qb.getManyAndCount();
    return {
      users,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async getAuditLogs(page = 1, limit = 25) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(Math.max(1, limit), 100);

    const [logs, total] = await this.auditRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      logs,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async banUser(adminId: string, adminRole: string, targetUserId: string, reason: string) {
    if (adminId === targetUserId) {
      throw new BadRequestException('Security Violation: You cannot ban your own account.');
    }

    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('User not found.');
    }

    if (
      (target.role === 'admin' || target.role === 'superadmin') &&
      adminRole !== 'superadmin'
    ) {
      throw new ForbiddenException('Cannot ban another administrator account.');
    }

    const finalReason = reason?.trim() || 'Administrative suspension';
    const now = Date.now();
    const hmac = target.email ? this.getHmac(target.email) : null;

    // Execute atomic PostgreSQL transaction
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE core.users 
        SET is_banned = TRUE, banned_at = $1, ban_reason = $2, updated_at = $1
        WHERE id = $3
      `,
        [now, finalReason, targetUserId],
      );

      await manager.query(
        `
        INSERT INTO core.admin_audit_logs (admin_id, target_user_id, target_email_hmac, action, reason, created_at)
        VALUES ($1, $2, $3, 'BAN_USER', $4, $5)
      `,
        [adminId, targetUserId, hmac, finalReason, now],
      );
    });

    // Post-Commit Redis Operations (allSettled ensures one failure doesn't block the rest)
    const redisResults = await Promise.allSettled([
      this.redisService.set(`user:status:${targetUserId}`, 'banned', 3600), // 1h self-healing TTL
      this.redisService.del(`user:role:${targetUserId}`),
      this.redisService.del(`auth:lock:u:${targetUserId}`),
      this.redisService.del(`auth:refresh:${targetUserId}`),
      this.redisService.del(`auth:session:${targetUserId}`),
    ]);

    redisResults.forEach((res, i) => {
      if (res.status === 'rejected') {
        this.logger.warn(`[Redis post-commit ban error] op ${i}: ${res.reason?.message}`);
      }
    });

    return { success: true, message: 'User suspended successfully.' };
  }

  async unbanUser(adminId: string, adminRole: string, targetUserId: string) {
    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('User not found.');
    }

    if (
      (target.role === 'admin' || target.role === 'superadmin') &&
      adminRole !== 'superadmin'
    ) {
      throw new ForbiddenException('Cannot unban an administrator without superadmin privileges.');
    }

    const now = Date.now();
    const hmac = target.email ? this.getHmac(target.email) : null;

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `
        UPDATE core.users 
        SET is_banned = FALSE, banned_at = NULL, ban_reason = NULL, updated_at = $1
        WHERE id = $2
      `,
        [now, targetUserId],
      );

      await manager.query(
        `
        INSERT INTO core.admin_audit_logs (admin_id, target_user_id, target_email_hmac, action, reason, created_at)
        VALUES ($1, $2, $3, 'UNBAN_USER', 'Administrative reinstatement', $4)
      `,
        [adminId, targetUserId, hmac, now],
      );
    });

    // Post-commit: evict ban key and role cache
    const redisResults = await Promise.allSettled([
      this.redisService.del(`user:status:${targetUserId}`),
      this.redisService.del(`user:role:${targetUserId}`),
    ]);

    redisResults.forEach((res, i) => {
      if (res.status === 'rejected') {
        this.logger.warn(`[Redis post-commit unban error] op ${i}: ${res.reason?.message}`);
      }
    });

    return { success: true, message: 'User unbanned successfully.' };
  }

  async hardDeleteUser(
    adminId: string,
    adminRole: string,
    targetUserId: string,
    confirmEmail: string,
    reason: string,
  ) {
    if (adminId === targetUserId) {
      throw new BadRequestException('Security Violation: You cannot delete your own account.');
    }

    const target = await this.userRepo.findOne({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('User not found.');
    }

    if (
      (target.role === 'admin' || target.role === 'superadmin') &&
      adminRole !== 'superadmin'
    ) {
      throw new ForbiddenException('Cannot delete an administrator account.');
    }

    // Server-Side Email Match Confirmation
    if (
      !confirmEmail ||
      target.email?.toLowerCase().trim() !== confirmEmail.toLowerCase().trim()
    ) {
      throw new BadRequestException('Confirmation email does not match the target user email.');
    }

    const now = Date.now();
    const hmac = target.email ? this.getHmac(target.email) : null;
    const finalReason = reason?.trim() || 'Permanent account purge';
    const avatarUrl = target.avatarUrl;

    // Execute atomic PostgreSQL transaction over all registered cascade tables
    await this.dataSource.transaction(async (manager) => {
      // 1. Audit log with HMAC (zero raw PII)
      await manager.query(
        `
        INSERT INTO core.admin_audit_logs (admin_id, target_user_id, target_email_hmac, action, reason, created_at)
        VALUES ($1, $2, $3, 'DELETE_USER', $4, $5)
      `,
        [adminId, targetUserId, hmac, finalReason, now],
      );

      // 2. Cascade delete records in all child & parent tables
      for (const entry of CASCADE_DELETE_TABLES) {
        await manager.query(
          `DELETE FROM ${entry.schema}.${entry.table} WHERE ${entry.column} = $1`,
          [targetUserId],
        );
      }
    });

    // Post-Commit Tombstone (30 days) & Cache Evictions
    const redisResults = await Promise.allSettled([
      this.redisService.set(`user:status:${targetUserId}`, 'deleted', 30 * 86400),
      this.redisService.del(`user:role:${targetUserId}`),
      this.redisService.del(`auth:lock:u:${targetUserId}`),
      this.redisService.del(`auth:refresh:${targetUserId}`),
      this.redisService.del(`auth:session:${targetUserId}`),
    ]);

    redisResults.forEach((res, i) => {
      if (res.status === 'rejected') {
        this.logger.warn(`[Redis post-commit delete error] op ${i}: ${res.reason?.message}`);
      }
    });

    // Clean Cloudinary asset if present
    if (avatarUrl && avatarUrl.includes('res.cloudinary.com')) {
      this.deleteCloudinaryAsset(avatarUrl).catch((err) =>
        this.logger.warn(
          `[Cloudinary Cleanup] Failed to destroy avatar for user ${targetUserId}: ${err.message}`,
        ),
      );
    }

    return { success: true, message: 'User and all associated data permanently deleted.' };
  }

  private async deleteCloudinaryAsset(avatarUrl: string) {
    // Extract public_id safely from Cloudinary URL structure
    const match = avatarUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
    if (match && match[1]) {
      await cloudinary.uploader.destroy(match[1]);
    }
  }
}

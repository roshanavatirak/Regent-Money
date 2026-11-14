import { TokenService } from '../auth/token.service';
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThanOrEqual } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { User } from '../users/entities/user.entity';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { RedisService } from '../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { EmailBroadcastService } from '../mail/email-broadcast.service';
import { MailService } from '../mail/mail.service';
import { WelcomeEmailService } from '../mail/welcome-email.service';
import { EmailAccountsService, PRIMARY_RESERVE } from '../mail/email-accounts.service';
import { EmailDraftDto } from './dto/email-draft.dto';
import { CreateEmailBroadcastDto } from './dto/create-email-broadcast.dto';

export const CASCADE_DELETE_TABLES = [
  { schema: 'core', table: 'notifications', column: 'user_id' },
  { schema: 'core', table: 'notification_log', column: 'user_id' },
  { schema: 'core', table: 'user_signals', column: 'user_id' },
  { schema: 'core', table: 'user_keys', column: 'user_id' },
  { schema: 'core', table: 'bank_profiles', column: 'user_id' },
  { schema: 'finance', table: 'applied_ops', column: 'user_id' },
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
  { schema: 'core', table: 'chat_threads', column: 'user_id' },
  { schema: 'core', table: 'refresh_tokens', column: 'user_id' },
  { schema: 'core', table: 'feedback', column: 'user_id' },
  // Install attribution: the user's own row, their invite link, and link opens they used.
  // Rows of friends they invited keep only the (now deleted) link's id, which names no one.
  { schema: 'core', table: 'install_attributions', column: 'user_id' },
  { schema: 'core', table: 'link_clicks', column: 'claimed_by' },
  { schema: 'core', table: 'tracking_links', column: 'owner_user_id' },
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
    private readonly tokenService: TokenService,
    private readonly notificationsService: NotificationsService,
    private readonly emailBroadcastService: EmailBroadcastService,
    private readonly mailService: MailService,
    private readonly emailAccounts: EmailAccountsService,
    private readonly welcomeEmails: WelcomeEmailService,
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

      // Uses exact expression from trigram GIN index or matches user ID directly
      qb.andWhere(
        "((COALESCE(u.name, '') || ' ' || COALESCE(u.email, '') || ' ' || COALESCE(u.phone, '')) ILIKE :s OR u.id ILIKE :s)",
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
      this.tokenService.revokeAllForUser(targetUserId),
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
      this.tokenService.revokeAllForUser(targetUserId),
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

  /**
   * Automated cron running every hour to permanently purge accounts
   * whose 7-day scheduled deletion grace period has expired.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredScheduledAccounts() {
    const now = Date.now();
    try {
      const expiredUsers = await this.userRepo.find({
        where: {
          isScheduledForDeletion: true,
          deletionDeadline: LessThanOrEqual(now),
        },
      });

      if (!expiredUsers || expiredUsers.length === 0) return;

      this.logger.log(`[AccountPurgeCron] Purging ${expiredUsers.length} account(s) past 7-day grace period.`);

      for (const target of expiredUsers) {
        try {
          const targetUserId = target.id;
          const hmac = target.email ? this.getHmac(target.email) : null;
          const finalReason = 'Automated 7-day expiration hard purge';
          const avatarUrl = target.avatarUrl;

          // Atomic purge across all database cascade tables
          await this.dataSource.transaction(async (manager) => {
            // 1. Audit log
            await manager.query(
              `INSERT INTO core.admin_audit_logs (admin_id, target_user_id, target_email_hmac, action, reason, created_at)
               VALUES ($1, $2, $3, 'PURGE_EXPIRED_ACCOUNT', $4, $5)`,
              ['SYSTEM_CRON', targetUserId, hmac, finalReason, now],
            );

            // 2. Cascade delete records in all child & parent tables
            for (const entry of CASCADE_DELETE_TABLES) {
              await manager.query(
                `DELETE FROM ${entry.schema}.${entry.table} WHERE ${entry.column} = $1`,
                [targetUserId],
              );
            }
          });

          // Post-commit Redis cleanup
          await Promise.allSettled([
            this.redisService.set(`user:status:${targetUserId}`, 'deleted', 30 * 86400),
            this.redisService.del(`user:role:${targetUserId}`),
            this.redisService.del(`auth:lock:u:${targetUserId}`),
            this.redisService.del(`auth:refresh:${targetUserId}`),
            this.redisService.del(`auth:session:${targetUserId}`),
      this.tokenService.revokeAllForUser(targetUserId),
          ]);

          if (avatarUrl && avatarUrl.includes('res.cloudinary.com')) {
            this.deleteCloudinaryAsset(avatarUrl).catch(() => {});
          }

          this.logger.log(`[AccountPurgeCron] Successfully purged expired account: ${targetUserId}`);
        } catch (err: any) {
          this.logger.error(`[AccountPurgeCron] Error purging user ${target.id}:`, err?.message || err);
        }
      }
    } catch (e: any) {
      this.logger.error('[AccountPurgeCron] Failed to run purge cron:', e?.message || e);
    }
  }

  /**
   * A broadcast tap can either open an in-app screen (`deepLink: regent://...`)
   * or open the app's Play Store listing (`action: open_url`). Anything else is dropped,
   * so a broadcast can never carry an arbitrary external link.
   */
  private sanitizeBroadcastPayload(payload: any): Record<string, string> {
    if (!payload || typeof payload !== 'object') return {};
    if (payload.action === 'open_url') {
      const url = typeof payload.url === 'string' ? payload.url.trim() : '';
      if (!/^https:\/\/play\.google\.com\/store\/apps\/details\?id=[\w.]+(&[\w=.%-]*)*$/.test(url) || url.length > 300) {
        throw new BadRequestException('Tap link must be a Play Store app listing (play.google.com/store/apps/details?id=...).');
      }
      return { action: 'open_url', url };
    }
    if (typeof payload.deepLink === 'string' && /^regent:\/\/[a-z_/-]{1,40}$/.test(payload.deepLink)) {
      return { deepLink: payload.deepLink };
    }
    return {};
  }

  async getAudienceEstimate() {
    return this.notificationsService.getAudienceEstimate();
  }

  async sendBroadcast(adminId: string, adminRole: string, dto: CreateBroadcastDto) {
    if (adminRole !== 'admin' && adminRole !== 'superadmin') {
      throw new ForbiddenException('Only administrators can send live broadcasts.');
    }

    const broadcast = await this.notificationsService.createBroadcast({
      title: dto.title,
      body: dto.body,
      type: dto.type || 'announcement',
      payload: this.sanitizeBroadcastPayload(dto.payload),
      idempotencyKey: dto.idempotencyKey,
      createdBy: adminId,
    });

    // Record audit log entry
    try {
      await this.dataSource.query(
        `INSERT INTO core.admin_audit_logs (admin_id, target_user_id, target_email_hmac, action, reason, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminId,
          'broadcast:all',
          null,
          'ADMIN_BROADCAST_SENT',
          dto.title,
          JSON.stringify({
            broadcastId: broadcast.id,
            totalTargeted: broadcast.totalTargeted,
            type: broadcast.type,
          }),
          Date.now(),
        ],
      );
    } catch (auditErr: any) {
      this.logger.warn(`Could not log broadcast audit trail: ${auditErr.message}`);
    }

    return {
      success: true,
      broadcast,
    };
  }

  async listBroadcasts(page = 1, limit = 20) {
    return this.notificationsService.listBroadcasts(page, limit);
  }

  async getEmailBroadcastQuota() {
    return this.emailBroadcastService.getDailyQuotaStats();
  }

  async getEmailAudienceEstimate() {
    return this.emailBroadcastService.getAudienceEstimate();
  }

  async createEmailBroadcast(adminId: string, adminRole: string, dto: CreateEmailBroadcastDto) {
    if (adminRole !== 'admin' && adminRole !== 'superadmin') {
      throw new ForbiddenException('Only administrators can send live email broadcasts.');
    }

    const broadcast = await this.emailBroadcastService.createBroadcast(adminId, dto);

    // Audit log
    try {
      await this.dataSource.query(
        `INSERT INTO core.admin_audit_logs (admin_id, target_user_id, target_email_hmac, action, reason, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminId,
          dto.targetUserId || 'broadcast:email_all',
          null,
          'ADMIN_EMAIL_BROADCAST_SENT',
          dto.subject,
          JSON.stringify({
            broadcastId: broadcast.id,
            totalRecipients: broadcast.totalRecipients,
            category: broadcast.category,
          }),
          Date.now(),
        ],
      );
    } catch (auditErr: any) {
      this.logger.warn(`Could not log email broadcast audit: ${auditErr.message}`);
    }

    return {
      success: true,
      broadcast,
    };
  }

  async listEmailBroadcasts(page = 1, limit = 20) {
    return this.emailBroadcastService.listBroadcasts(page, limit);
  }

  async cancelEmailBroadcast(adminId: string, adminRole: string, broadcastId: string) {
    if (adminRole !== 'admin' && adminRole !== 'superadmin') {
      throw new ForbiddenException('Only administrators can cancel email broadcasts.');
    }

    const broadcast = await this.emailBroadcastService.cancelBroadcast(broadcastId, adminId);

    try {
      await this.dataSource.query(
        `INSERT INTO core.admin_audit_logs (admin_id, target_user_id, target_email_hmac, action, reason, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminId,
          'broadcast:email:' + broadcastId,
          null,
          'ADMIN_EMAIL_BROADCAST_CANCELLED',
          'Admin cancelled active broadcast',
          JSON.stringify({ broadcastId }),
          Date.now(),
        ],
      );
    } catch {}

    return {
      success: true,
      broadcast,
    };
  }

  async getEmailSystemOverview() {
    const [primary, broadcast, welcome, fallbackEnabled] = await Promise.all([
      this.mailService.getPrimaryEmailStats(),
      this.emailBroadcastService.getDailyQuotaStats(),
      this.welcomeEmails.getStats(),
      this.emailAccounts.isFallbackEnabled(),
    ]);

    return {
      primary,
      broadcast,
      welcome,
      fallback: {
        enabled: fallbackEnabled,
        // Both accounts must exist (and differ) for one to cover the other.
        available: this.emailAccounts.canFallBack(),
        signInReserve: PRIMARY_RESERVE,
      },
    };
  }

  async previewEmailDraft(adminRole: string, dto: EmailDraftDto) {
    if (adminRole !== 'admin' && adminRole !== 'superadmin') {
      throw new ForbiddenException('Only administrators can preview emails.');
    }
    return { html: await this.emailBroadcastService.renderDraftPreview(dto) };
  }

  async sendEmailDraftTest(adminId: string, adminRole: string, dto: EmailDraftDto) {
    if (adminRole !== 'admin' && adminRole !== 'superadmin') {
      throw new ForbiddenException('Only administrators can send test emails.');
    }
    const admin = await this.userRepo.findOne({ where: { id: adminId }, select: { email: true, name: true } });
    if (!admin?.email) {
      throw new BadRequestException('Your admin account has no email address.');
    }
    return this.emailBroadcastService.sendDraftTest(admin.email, admin.name || 'there', dto);
  }

  async setEmailFallback(adminId: string, adminRole: string, enabled: boolean) {
    if (adminRole !== 'admin' && adminRole !== 'superadmin') {
      throw new ForbiddenException('Only administrators can change email settings.');
    }
    if (typeof enabled !== 'boolean') {
      throw new BadRequestException('enabled must be true or false.');
    }
    const value = await this.emailAccounts.setFallbackEnabled(enabled, adminId);
    try {
      await this.dataSource.query(
        `INSERT INTO core.admin_audit_logs (admin_id, target_user_id, target_email_hmac, action, reason, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          adminId,
          'system:email',
          null,
          value ? 'ADMIN_EMAIL_FALLBACK_ON' : 'ADMIN_EMAIL_FALLBACK_OFF',
          value ? 'Email fallback turned on' : 'Email fallback turned off',
          JSON.stringify({ enabled: value }),
          Date.now(),
        ],
      );
    } catch (auditErr: any) {
      this.logger.warn(`Could not log email fallback change: ${auditErr.message}`);
    }
    return { enabled: value };
  }

  async sendTestEmail(adminId: string, adminRole: string, type: 'primary' | 'broadcast', targetEmail?: string) {
    if (adminRole !== 'admin' && adminRole !== 'superadmin') {
      throw new ForbiddenException('Only administrators can send test emails.');
    }

    let toEmail = targetEmail?.trim();
    if (!toEmail) {
      const adminUser = await this.userRepo.findOne({ where: { id: adminId }, select: { email: true } });
      toEmail = adminUser?.email || '';
    }

    if (!toEmail) {
      throw new BadRequestException('Recipient email address is required.');
    }

    if (type === 'primary') {
      return this.mailService.sendTestPrimaryEmail(toEmail);
    } else {
      return this.emailBroadcastService.sendTestBroadcastEmail(toEmail);
    }
  }
}

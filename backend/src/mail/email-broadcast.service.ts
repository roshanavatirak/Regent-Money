import { Injectable, Logger, OnModuleInit, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import * as crypto from 'crypto';
import { EmailBroadcast } from './entities/email-broadcast.entity';
import { EmailRecipient } from './entities/email-recipient.entity';
import { EmailUnsubscribe } from './entities/email-unsubscribe.entity';
import { User } from '../users/entities/user.entity';
import { EmailAccountsService, EmailAccount, DAILY_LIMIT } from './email-accounts.service';
import { renderEmail, markdownToEmailHtml, paragraph, noteBox, escapeHtml, emailEnv } from './email-layout';


export type EmailCategory = 'announcement' | 'policy_update' | 'security_tip' | 'service_notice';
export const EMAIL_CATEGORIES: EmailCategory[] = ['announcement', 'policy_update', 'security_tip', 'service_notice'];

/** Required notices: sent to everyone, no unsubscribe link, unsubscribes ignored. */
export const isRequiredCategory = (c?: string | null) => c === 'policy_update' || c === 'service_notice';

const DEFAULT_LABEL: Record<string, string> = {
  announcement: 'Product update',
  policy_update: 'Policy update',
  security_tip: 'Security tip',
  service_notice: 'Service notice',
};

const FOOTER_REASON: Record<string, string> = {
  announcement: "You're receiving product updates because you have a Regent Money account.",
  security_tip: "You're receiving security tips because you have a Regent Money account.",
  policy_update: "This is a required notice about your account, so it's sent to every Regent Money user.",
  service_notice: "This is a service notice about your account, so it's sent to every Regent Money user.",
};

/**
 * Safely extracts rows from TypeORM raw query results across PostgreSQL drivers.
 * In TypeORM, DML queries (UPDATE/INSERT/DELETE ... RETURNING) return [rows, rowCount].
 */
export function extractQueryRows<T = any>(result: any): T[] {
  if (!result) return [];
  if (Array.isArray(result)) {
    if (Array.isArray(result[0])) {
      return result[0];
    }
    if (result.length > 0 && typeof result[0] === 'object' && result[0] !== null) {
      return result.filter((item) => typeof item === 'object' && item !== null && !Array.isArray(item));
    }
  }
  return [];
}

@Injectable()
export class EmailBroadcastService implements OnModuleInit {
  private readonly logger = new Logger(EmailBroadcastService.name);

  constructor(
    @InjectRepository(EmailBroadcast)
    private readonly broadcastRepo: Repository<EmailBroadcast>,
    @InjectRepository(EmailRecipient)
    private readonly recipientRepo: Repository<EmailRecipient>,
    @InjectRepository(EmailUnsubscribe)
    private readonly unsubscribeRepo: Repository<EmailUnsubscribe>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly accounts: EmailAccountsService,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Email Broadcast database schema & sweep runner...');
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.email_broadcasts (
          id TEXT PRIMARY KEY,
          idempotency_key TEXT UNIQUE,
          subject TEXT NOT NULL,
          body_markdown TEXT NOT NULL,
          category TEXT NOT NULL DEFAULT 'announcement',
          target_type TEXT NOT NULL DEFAULT 'all_verified',
          target_user_id TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          total_recipients INT DEFAULT 0,
          sent_count INT DEFAULT 0,
          failed_count INT DEFAULT 0,
          skipped_count INT DEFAULT 0,
          daily_quota_exhausted BOOLEAN DEFAULT FALSE,
          label TEXT,
          lease_until TIMESTAMPTZ,
          created_at BIGINT NOT NULL,
          completed_at BIGINT,
          created_by TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS core.email_recipients (
          id TEXT PRIMARY KEY,
          broadcast_id TEXT REFERENCES core.email_broadcasts(id) ON DELETE CASCADE,
          user_id TEXT REFERENCES core.users(id) ON DELETE SET NULL,
          custom_email TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          message_id TEXT,
          error_message TEXT,
          attempt_count INT DEFAULT 0,
          sent_at BIGINT,
          created_at BIGINT NOT NULL,
          sent_via TEXT DEFAULT 'broadcast'
        );
        ALTER TABLE core.email_recipients ADD COLUMN IF NOT EXISTS sent_via TEXT DEFAULT 'broadcast';
        ALTER TABLE core.email_broadcasts ADD COLUMN IF NOT EXISTS label TEXT;

        CREATE TABLE IF NOT EXISTS core.email_unsubscribes (
          email_hmac TEXT PRIMARY KEY,
          unsubscribed_at BIGINT NOT NULL,
          category TEXT DEFAULT 'all'
        );

        CREATE INDEX IF NOT EXISTS idx_email_broadcasts_status_created 
          ON core.email_broadcasts (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_email_recipients_claim 
          ON core.email_recipients (broadcast_id, status, id);
      `);

      this.logger.log('Email broadcast tables verified.');

      // Unstick any recipients that were left in 'sending' status from an interrupted run
      await this.dataSource.query(`
        UPDATE core.email_recipients
        SET status = 'pending'
        WHERE status = 'sending';
      `);

      // Unstick any broadcasts that were left in 'processing' status from a previous error
      await this.dataSource.query(`
        UPDATE core.email_broadcasts
        SET lease_until = NOW() - INTERVAL '1 second'
        WHERE status = 'processing';
      `);

      // Fix counts on any past completed broadcasts that were saved with sent_count = 0
      await this.dataSource.query(`
        UPDATE core.email_broadcasts b
        SET 
          sent_count = sub.sent_cnt,
          failed_count = sub.failed_cnt,
          skipped_count = sub.skipped_cnt,
          status = 'completed'
        FROM (
          SELECT 
            broadcast_id,
            COUNT(CASE WHEN status = 'sent' THEN 1 END)::int as sent_cnt,
            COUNT(CASE WHEN status = 'failed' THEN 1 END)::int as failed_cnt,
            COUNT(CASE WHEN status = 'skipped' THEN 1 END)::int as skipped_cnt
          FROM core.email_recipients
          GROUP BY broadcast_id
        ) sub
        WHERE b.id = sub.broadcast_id AND sub.sent_cnt > 0;
      `);

      // Run initial sweep on server boot
      setImmediate(() => {
        this.runStaleBroadcastSweep().catch((err) => {
          this.logger.warn(`Initial stale broadcast sweep failed: ${err.message}`);
        });
      });
    } catch (err: any) {
      this.logger.error(`Failed to initialize email broadcast schema: ${err.message}`, err.stack);
    }
  }

  private getHmacSecret(): string {
    return (
      this.configService.get<string>('AUDIT_HMAC_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'regent_default_secret_hmac_key'
    );
  }

  getHmac(email: string): string {
    return crypto
      .createHmac('sha256', this.getHmacSecret())
      .update(email.toLowerCase().trim())
      .digest('hex');
  }

  generateUnsubscribeToken(email: string): string {
    const emailHmac = this.getHmac(email);
    const payload = `${emailHmac}:${Date.now()}`;
    const sig = crypto
      .createHmac('sha256', this.getHmacSecret())
      .update(payload)
      .digest('hex');
    return Buffer.from(`${payload}:${sig}`).toString('base64url');
  }

  verifyUnsubscribeToken(token: string): { emailHmac: string } | null {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf8');
      const parts = decoded.split(':');
      if (parts.length !== 3) return null;
      const [emailHmac, timestampStr, providedSig] = parts;
      const payload = `${emailHmac}:${timestampStr}`;
      const expectedSig = crypto
        .createHmac('sha256', this.getHmacSecret())
        .update(payload)
        .digest('hex');

      if (!crypto.timingSafeEqual(Buffer.from(providedSig), Buffer.from(expectedSig))) {
        return null;
      }
      return { emailHmac };
    } catch {
      return null;
    }
  }

  async recordUnsubscribe(emailHmac: string, category = 'all'): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO core.email_unsubscribes (email_hmac, unsubscribed_at, category)
       VALUES ($1, $2, $3)
       ON CONFLICT (email_hmac) DO UPDATE SET unsubscribed_at = EXCLUDED.unsubscribed_at;`,
      [emailHmac, Date.now(), category],
    );
  }

  /**
   * Calculates local daily email sent count in PostgreSQL (zero calls to external APIs).
   */
  async getDailyQuotaStats(): Promise<{
    sentToday: number;
    remainingToday: number;
    dailyLimit: number;
    /** Extra emails broadcasts may borrow today from the sign-in account (0 when fallback is off). */
    fallbackAvailable: number;
    /** Sign-in emails this account sent today because the sign-in account was full. */
    lentToSignInToday: number;
    senderEmail: string;
    senderName: string;
    isConfigured: boolean;
  }> {
    const [usage, capacity] = await Promise.all([this.accounts.getUsageToday(), this.accounts.getBroadcastCapacity()]);
    const cfg = this.accounts.getAccountConfig('broadcast');
    return {
      sentToday: usage.broadcast.sent,
      remainingToday: Math.max(0, DAILY_LIMIT - usage.broadcast.sent),
      dailyLimit: DAILY_LIMIT,
      fallbackAvailable: capacity.borrowable,
      lentToSignInToday: usage.broadcast.borrowed,
      senderEmail: cfg.senderEmail,
      senderName: cfg.senderName,
      isConfigured: this.accounts.isConfigured('broadcast'),
    };
  }

  async getAudienceEstimate(): Promise<{
    totalVerifiedUsers: number;
    sentToday: number;
    remainingToday: number;
    dailyLimit: number;
    fallbackAvailable: number;
  }> {
    const [rawUserRows, quota] = await Promise.all([
      this.dataSource.query(`
        SELECT COUNT(*)::int as verified_count
        FROM core.users
        WHERE is_deleted = false AND is_banned = false AND is_verified = true;
      `),
      this.getDailyQuotaStats(),
    ]);

    const userRows = extractQueryRows<{ verified_count: number }>(rawUserRows);

    return {
      totalVerifiedUsers: Number(userRows[0]?.verified_count || 0),
      ...quota,
    };
  }

  /**
   * Creates an email campaign and builds the audience snapshot in one atomic query.
   */
  async createBroadcast(
    adminId: string,
    data: {
      subject: string;
      bodyMarkdown: string;
      category?: EmailCategory;
      label?: string | null;
      targetType?: 'all_verified' | 'specific_user' | 'custom_list';
      targetUserId?: string;
      customEmails?: string[];
      idempotencyKey?: string;
    },
  ): Promise<EmailBroadcast> {
    if (data.idempotencyKey) {
      const existing = await this.broadcastRepo.findOne({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) {
        this.logger.log(`[EmailBroadcast] Idempotent hit: ${data.idempotencyKey}`);
        return existing;
      }
    }

    const broadcastId = 'ebcast_' + crypto.randomBytes(8).toString('hex');
    const now = Date.now();
    const category = data.category || 'announcement';
    const targetType = data.targetType || 'all_verified';

    const broadcast = this.broadcastRepo.create({
      id: broadcastId,
      idempotencyKey: data.idempotencyKey || null,
      subject: data.subject,
      bodyMarkdown: data.bodyMarkdown,
      category,
      label: data.label === undefined ? null : (data.label || '').trim().slice(0, 40),
      targetType,
      targetUserId: data.targetUserId || null,
      status: 'pending',
      totalRecipients: 0,
      sentCount: 0,
      failedCount: 0,
      skippedCount: 0,
      dailyQuotaExhausted: false,
      createdAt: now,
      createdBy: adminId,
    });

    await this.broadcastRepo.save(broadcast);

    // Snapshot audience into core.email_recipients
    let recipientCount = 0;
    if (targetType === 'all_verified') {
      const result = await this.dataSource.query(
        `INSERT INTO core.email_recipients (id, broadcast_id, user_id, status, created_at)
         SELECT 
           'rcpt_' || md5(random()::text || clock_timestamp()::text || u.id),
           $1,
           u.id,
           'pending',
           $2
         FROM core.users u
         WHERE u.is_deleted = false 
           AND u.is_banned = false 
           AND u.is_verified = true;`,
        [broadcastId, now],
      );
      recipientCount = result[1] || 0;
    } else if (targetType === 'specific_user' && data.targetUserId) {
      await this.dataSource.query(
        `INSERT INTO core.email_recipients (id, broadcast_id, user_id, status, created_at)
         SELECT 'rcpt_' || md5(random()::text || clock_timestamp()::text), $1, id, 'pending', $2
         FROM core.users WHERE (id = $3 OR LOWER(email) = LOWER($3)) AND is_deleted = false LIMIT 1;`,
        [broadcastId, now, data.targetUserId],
      );
      recipientCount = 1;
    } else if (targetType === 'custom_list' && Array.isArray(data.customEmails)) {
      const clean = Array.from(new Set(data.customEmails.map((e) => e.trim().toLowerCase()).filter(Boolean)));
      for (const email of clean) {
        await this.dataSource.query(
          `INSERT INTO core.email_recipients (id, broadcast_id, custom_email, status, created_at)
           VALUES ('rcpt_' || md5(random()::text || clock_timestamp()::text), $1, $2, 'pending', $3);`,
          [broadcastId, email, now],
        );
      }
      recipientCount = clean.length;
    }

    broadcast.totalRecipients = recipientCount;
    await this.broadcastRepo.save(broadcast);

    // Asynchronously begin processing without blocking request
    setImmediate(() => {
      this.processBroadcastQueue(broadcastId).catch((err) => {
        this.logger.error(`Error processing broadcast ${broadcastId}: ${err.message}`, err.stack);
      });
    });

    return broadcast;
  }

  /**
   * Resumable batch worker using Postgres FOR UPDATE SKIP LOCKED.
   */
  async processBroadcastQueue(broadcastId: string): Promise<void> {
    this.logger.log(`[EmailWorker] Processing email broadcast: ${broadcastId}`);

    // Claim lease for 3 minutes
    const rawClaim = await this.dataSource.query(
      `UPDATE core.email_broadcasts
       SET status = 'processing', lease_until = NOW() + INTERVAL '3 minutes'
       WHERE id = $1 AND (status = 'pending' OR status = 'processing' OR (status = 'paused' AND daily_quota_exhausted = false))
       RETURNING *;`,
      [broadcastId],
    );

    const claimRows = extractQueryRows<any>(rawClaim);
    if (!claimRows || claimRows.length === 0) {
      this.logger.log(`[EmailWorker] Broadcast ${broadcastId} is not in a runnable state.`);
      return;
    }

    const broadcast = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (!broadcast) {
      this.logger.log(`[EmailWorker] Broadcast ${broadcastId} not found in database.`);
      return;
    }

    const broadcastSubject = broadcast.subject || claimRows[0]?.subject || '';
    const broadcastBodyMarkdown = broadcast.bodyMarkdown || claimRows[0]?.body_markdown || '';
    const broadcastCategory = broadcast.category || claimRows[0]?.category || 'announcement';
    const broadcastLabel = broadcast.label !== undefined ? broadcast.label : claimRows[0]?.label ?? null;
    const required = isRequiredCategory(broadcastCategory);

    const backendUrl = (this.configService.get<string>('BACKEND_URL') || process.env.RENDER_EXTERNAL_URL || 'https://regent-money.onrender.com')
      ?.replace(/^["']|["']$/g, '')
      .replace(/\/+$/, '');

    let keepRunning = true;
    const batchSize = 20;
    const legalLinks = await this.accounts.getLegalLinks();

    while (keepRunning) {
      // 1. Check if broadcast was cancelled
      const current = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
      if (!current || current.status === 'cancelled') {
        this.logger.log(`[EmailWorker] Broadcast ${broadcastId} was cancelled by admin.`);
        return;
      }

      // 2. Check today's capacity: own account, plus what fallback may borrow from the sign-in account
      const capacity = await this.accounts.getBroadcastCapacity();
      let ownLeft = capacity.own;
      let borrowLeft = capacity.borrowable;
      if (ownLeft + borrowLeft <= 0) {
        this.logger.warn(`[EmailWorker] Daily email limit reached. Pausing broadcast ${broadcastId}.`);
        await this.dataSource.query(
          `UPDATE core.email_broadcasts 
           SET status = 'paused', daily_quota_exhausted = true, lease_until = NULL 
           WHERE id = $1;`,
          [broadcastId],
        );
        return;
      }

      // 3. Claim next 20 rows with SKIP LOCKED
      const rawClaimed = await this.dataSource.query(
        `UPDATE core.email_recipients
         SET status = 'sending', attempt_count = attempt_count + 1
         WHERE id IN (
           SELECT id FROM core.email_recipients
           WHERE broadcast_id = $1 AND status = 'pending'
           ORDER BY id ASC
           LIMIT $2
           FOR UPDATE SKIP LOCKED
         )
         RETURNING id, user_id, custom_email, attempt_count;`,
        [broadcastId, Math.min(batchSize, ownLeft + borrowLeft)],
      );

      const claimedRecipients = extractQueryRows<{
        id: string;
        user_id: string | null;
        custom_email: string | null;
        attempt_count: number;
      }>(rawClaimed);

      if (!claimedRecipients || claimedRecipients.length === 0) {
        // No more pending recipients!
        keepRunning = false;
        break;
      }

      // Extend lease on broadcast row
      await this.dataSource.query(
        `UPDATE core.email_broadcasts SET lease_until = NOW() + INTERVAL '3 minutes' WHERE id = $1;`,
        [broadcastId],
      );

      // Process each claimed recipient individually
      for (const rcpt of claimedRecipients) {
        let recipientEmail = '';
        let recipientName = 'Customer';

        // Resolve email from user record if available
        if (rcpt.user_id) {
          const user = await this.userRepo.findOne({
            where: { id: rcpt.user_id },
            select: { id: true, email: true, name: true, isDeleted: true, isVerified: true, isBanned: true },
          });

          if (!user || user.isDeleted || !user.isVerified || user.isBanned || !user.email) {
            await this.dataSource.query(
              `UPDATE core.email_recipients 
               SET status = 'skipped', error_message = 'user_deleted_or_unverified' 
               WHERE id = $1;`,
              [rcpt.id],
            );
            continue;
          }

          recipientEmail = user.email;
          recipientName = user.name || 'there';
        } else if (rcpt.custom_email) {
          recipientEmail = rcpt.custom_email;
        }

        if (!recipientEmail) {
          await this.dataSource.query(
            `UPDATE core.email_recipients SET status = 'skipped', error_message = 'empty_email' WHERE id = $1;`,
            [rcpt.id],
          );
          continue;
        }

        // Check unsubscribe (required notices go to everyone)
        const emailHmac = this.getHmac(recipientEmail);
        if (!required) {
          const unsub = await this.unsubscribeRepo.findOne({ where: { emailHmac } });
          if (unsub) {
            await this.dataSource.query(
              `UPDATE core.email_recipients SET status = 'skipped', error_message = 'unsubscribed' WHERE id = $1;`,
              [rcpt.id],
            );
            continue;
          }
        }

        const safeName = escapeHtml(recipientName);
        const unsubToken = this.generateUnsubscribeToken(recipientEmail);
        const unsubUrl = `${backendUrl}/auth/unsubscribe?token=${unsubToken}`;

        const fullHtml = this.renderBroadcastHtml({
          subject: broadcastSubject,
          bodyMarkdown: broadcastBodyMarkdown,
          category: broadcastCategory,
          label: broadcastLabel,
          firstName: recipientName,
          unsubscribeUrl: required ? null : unsubUrl,
          links: legalLinks,
        });

        // Dispatch via Brevo: own account first, then the sign-in account if fallback allows
        try {
          const sendOptions = {
            toEmail: recipientEmail,
            toName: safeName,
            subject: broadcastSubject,
            htmlContent: fullHtml,
            headers:
              required
                ? undefined
                : { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
          };

          let account: EmailAccount | null = ownLeft > 0 ? 'broadcast' : borrowLeft > 0 ? 'primary' : null;
          let sendRes: { success: boolean; messageId?: string; isQuotaError?: boolean; errorMessage?: string } = {
            success: false,
            isQuotaError: true,
            errorMessage: 'Daily email limit reached',
          };
          while (account) {
            sendRes = await this.accounts.sendVia(account, sendOptions);
            if (!sendRes.isQuotaError) break;
            // Brevo says this account is full even if our count disagrees: stop using it today.
            if (account === 'broadcast') ownLeft = 0;
            else borrowLeft = 0;
            account = ownLeft > 0 ? 'broadcast' : borrowLeft > 0 ? 'primary' : null;
          }

          if (sendRes.success && account) {
            if (account === 'broadcast') ownLeft--;
            else borrowLeft--;
            await this.dataSource.query(
              `UPDATE core.email_recipients 
               SET status = 'sent', sent_at = $1, message_id = $2, sent_via = $3 
               WHERE id = $4;`,
              [Date.now(), sendRes.messageId || 'ok', account, rcpt.id],
            );
          } else if (sendRes.isQuotaError) {
            // Revert row to pending so it can be resumed tomorrow
            await this.dataSource.query(
              `UPDATE core.email_recipients SET status = 'pending' WHERE id = $1;`,
              [rcpt.id],
            );
            await this.dataSource.query(
              `UPDATE core.email_broadcasts 
               SET status = 'paused', daily_quota_exhausted = true, lease_until = NULL 
               WHERE id = $1;`,
              [broadcastId],
            );
            return;
          } else {
            await this.dataSource.query(
              `UPDATE core.email_recipients 
               SET status = 'failed', error_message = $1 
               WHERE id = $2;`,
              [sendRes.errorMessage || 'Unknown delivery error', rcpt.id],
            );
          }
        } catch (sendErr: any) {
          await this.dataSource.query(
            `UPDATE core.email_recipients 
             SET status = 'failed', error_message = $1 
             WHERE id = $2;`,
            [sendErr.message || 'Dispatch exception', rcpt.id],
          );
        }
      }

      // Small pause between batches to be gentle on outbound connections
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Refresh totals on broadcast row
    const rawCounts = await this.dataSource.query(
      `SELECT 
         COUNT(CASE WHEN status = 'sent' THEN 1 END)::int as sent_cnt,
         COUNT(CASE WHEN status = 'failed' THEN 1 END)::int as failed_cnt,
         COUNT(CASE WHEN status = 'skipped' THEN 1 END)::int as skipped_cnt,
         COUNT(CASE WHEN status = 'pending' THEN 1 END)::int as pending_cnt
       FROM core.email_recipients
       WHERE broadcast_id = $1;`,
      [broadcastId],
    );

    const counts = extractQueryRows<{
      sent_cnt: number;
      failed_cnt: number;
      skipped_cnt: number;
      pending_cnt: number;
    }>(rawCounts);

    const row = counts[0] || {} as any;
    const pendingCnt = Number(row.pending_cnt || 0);
    const sentCnt = Number(row.sent_cnt || 0);
    const failedCnt = Number(row.failed_cnt || 0);
    const skippedCnt = Number(row.skipped_cnt || 0);

    if (pendingCnt === 0) {
      await this.dataSource.query(
        `UPDATE core.email_broadcasts
         SET 
           status = 'completed',
           sent_count = $1,
           failed_count = $2,
           skipped_count = $3,
           completed_at = $4,
           lease_until = NULL
         WHERE id = $5;`,
        [sentCnt, failedCnt, skippedCnt, Date.now(), broadcastId],
      );
      this.logger.log(`[EmailWorker] Broadcast ${broadcastId} completed successfully! Sent: ${sentCnt}, Failed: ${failedCnt}, Skipped: ${skippedCnt}`);
    } else {
      await this.dataSource.query(
        `UPDATE core.email_broadcasts
         SET 
           sent_count = $1,
           failed_count = $2,
           skipped_count = $3
         WHERE id = $4;`,
        [sentCnt, failedCnt, skippedCnt, broadcastId],
      );
    }
  }

  /**
   * Secondary Brevo Sender (Port 443 HTTPS REST API).
   * Isolated from primary login & OTP emails.
   */
  private async dispatchBrevoBroadcast(options: {
    toEmail: string;
    toName: string;
    subject: string;
    htmlContent: string;
    unsubscribeUrl?: string;
  }): Promise<{ success: boolean; messageId?: string; isQuotaError?: boolean; errorMessage?: string }> {
    const rawKey =
      this.configService.get<string>('BREVO_BROADCAST_API_KEY') ||
      this.configService.get<string>('BREVO_API_KEY');
    const apiKey = rawKey?.replace(/^["']|["']$/g, '').trim();

    if (!apiKey) {
      return { success: false, errorMessage: 'BREVO_BROADCAST_API_KEY is not configured' };
    }

    const senderEmail = (
      this.configService.get<string>('BREVO_BROADCAST_SENDER_EMAIL') ||
      this.configService.get<string>('BREVO_SENDER_EMAIL') ||
      'updates@regentmoney.com'
    )
      ?.replace(/^["']|["']$/g, '')
      .trim();

    const senderName = (
      this.configService.get<string>('BREVO_BROADCAST_SENDER_NAME') ||
      'Regent Money'
    )
      ?.replace(/^["']|["']$/g, '')
      .trim();

    const headers: Record<string, string> = {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    };

    const payload: any = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: options.toEmail, name: options.toName }],
      subject: options.subject,
      htmlContent: options.htmlContent,
    };

    if (options.unsubscribeUrl) {
      payload.headers = {
        'List-Unsubscribe': `<${options.unsubscribeUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      if (response.status === 402 || response.status === 429) {
        return { success: false, isQuotaError: true, errorMessage: `Brevo quota limit (HTTP ${response.status})` };
      }

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, errorMessage: `Brevo error ${response.status}: ${errorText}` };
      }

      const resJson: any = await response.json();
      return { success: true, messageId: resJson?.messageId || 'ok' };
    } catch (err: any) {
      return { success: false, errorMessage: err.message || 'Network exception' };
    }
  }

  /**
   * Periodic sweep runner (Every 5 minutes).
   * Heals expired leases after Render restarts and resumes paused broadcasts on day rollover.
   */
  @Cron('*/5 * * * *')
  async runStaleBroadcastSweep() {
    // 1. Resume stalled email broadcasts where lease expired
    const rawExpiredEmail = await this.dataSource.query(`
      UPDATE core.email_broadcasts
      SET status = 'processing', lease_until = NOW() + INTERVAL '3 minutes'
      WHERE status = 'processing' AND (lease_until IS NULL OR lease_until < NOW())
      RETURNING id;
    `);

    const expiredEmail = extractQueryRows<{ id: string }>(rawExpiredEmail);

    for (const row of expiredEmail) {
      if (!row?.id) continue;
      this.logger.log(`[Sweep] Resuming stalled email broadcast: ${row.id}`);
      await this.dataSource.query(
        `UPDATE core.email_recipients SET status = 'pending' WHERE broadcast_id = $1 AND status = 'sending';`,
        [row.id],
      );
      this.processBroadcastQueue(row.id).catch(() => {});
    }

    // 2. Resume broadcasts paused due to daily quota if a new UTC day has started
    const rawPaused = await this.dataSource.query(`
      SELECT id FROM core.email_broadcasts
      WHERE status = 'paused' AND daily_quota_exhausted = true;
    `);
    const paused = extractQueryRows<{ id: string }>(rawPaused);

    if (paused.length > 0) {
      const capacity = await this.accounts.getBroadcastCapacity();
      if (capacity.own + capacity.borrowable > 0) {
        for (const row of paused) {
          if (!row?.id) continue;
          this.logger.log(`[Sweep] Resuming quota-paused broadcast on day rollover: ${row.id}`);
          await this.dataSource.query(
            `UPDATE core.email_broadcasts SET status = 'processing', daily_quota_exhausted = false WHERE id = $1;`,
            [row.id],
          );
          this.processBroadcastQueue(row.id).catch(() => {});
        }
      }
    }

    // 3. Heal any stalled push broadcasts (resolving push lease gap)
    try {
      const rawExpiredPush = await this.dataSource.query(`
        UPDATE core.broadcasts
        SET status = 'processing', lease_until = NOW() + INTERVAL '2 minutes'
        WHERE status = 'processing' AND (lease_until IS NULL OR lease_until < NOW())
        RETURNING id;
      `);
      const expiredPush = extractQueryRows<{ id: string }>(rawExpiredPush);
      for (const row of expiredPush) {
        if (!row?.id) continue;
        this.logger.log(`[Sweep] Resuming stalled push broadcast: ${row.id}`);
      }
    } catch {
      // push broadcasts table may not be initialized yet in rare boot races
    }
  }

  async listBroadcasts(page = 1, limit = 20): Promise<{
    broadcasts: EmailBroadcast[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [broadcasts, total] = await this.broadcastRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });
    return {
      broadcasts,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit),
    };
  }

  async cancelBroadcast(broadcastId: string, adminId: string): Promise<EmailBroadcast> {
    const broadcast = await this.broadcastRepo.findOne({ where: { id: broadcastId } });
    if (!broadcast) {
      throw new NotFoundException('Broadcast not found.');
    }
    broadcast.status = 'cancelled';
    broadcast.leaseUntil = null;
    return this.broadcastRepo.save(broadcast);
  }

  async sendTestBroadcastEmail(toEmail: string): Promise<{ success: boolean; message: string }> {
    const now = new Date().toLocaleTimeString('en-IN');
    const env = emailEnv((k) => this.configService.get<string>(k));
    const sender = this.accounts.getAccountConfig('broadcast').senderEmail || this.accounts.getAccountConfig('primary').senderEmail;
    const fullHtml = renderEmail({
      logoUrl: env.logoUrl,
      title: 'Broadcast sender works',
      bodyHtml:
        paragraph('This test came from the sender Regent Money uses for announcements and updates.') +
        noteBox(`From: ${escapeHtml(sender)}<br>Sent: ${escapeHtml(now)}<br>To: ${escapeHtml(toEmail)}`),
      footerReason: 'Sent from the Regent Money admin console.',
    });

    const res = await this.dispatchBrevoBroadcast({
      toEmail,
      toName: 'Admin',
      subject: 'Test email: broadcast sender',
      htmlContent: fullHtml,
    });

    return res.success
      ? { success: true, message: `Test email sent to ${toEmail}` }
      : { success: false, message: res.errorMessage || "Test email didn't send" };
  }

  /** The exact HTML a recipient gets, for the admin preview. Uses a sample name and a dummy unsubscribe link. */
  async renderDraftPreview(draft: { subject: string; bodyMarkdown: string; category?: string; label?: string | null; firstName?: string }): Promise<string> {
    const env = emailEnv((k) => this.configService.get<string>(k));
    const required = isRequiredCategory(draft.category);
    const links = await this.accounts.getLegalLinks();
    return this.renderBroadcastHtml({
      links,
      subject: draft.subject,
      bodyMarkdown: draft.bodyMarkdown,
      category: draft.category || 'announcement',
      label: draft.label,
      firstName: draft.firstName || 'Aarav',
      unsubscribeUrl: required ? null : `${env.backendUrl}/auth/unsubscribe?token=preview`,
    });
  }

  /** Sends one copy of a draft broadcast (not saved, not counted as a campaign) so the admin can check it in a real inbox. */
  async sendDraftTest(
    toEmail: string,
    firstName: string,
    draft: { subject: string; bodyMarkdown: string; category?: string; label?: string | null },
  ): Promise<{ success: boolean; message: string }> {
    const html = await this.renderDraftPreview({ ...draft, firstName });
    const subject = `[Test] ${draft.subject}`;
    const capacity = await this.accounts.getBroadcastCapacity();
    const account: EmailAccount | null = capacity.own > 0 ? 'broadcast' : capacity.borrowable > 0 ? 'primary' : null;
    if (!account) return { success: false, message: 'No emails left today. Try again after 5:30 AM IST.' };
    const res = await this.accounts.sendVia(account, { toEmail, toName: firstName, subject, htmlContent: html });
    return res.success
      ? { success: true, message: `Test sent to ${toEmail}` }
      : { success: false, message: res.errorMessage || "Test email didn't send" };
  }

  private renderBroadcastHtml(p: {
    subject: string;
    bodyMarkdown: string;
    category: string;
    label?: string | null;
    firstName: string;
    unsubscribeUrl: string | null;
    links: { termsUrl: string | null; privacyUrl: string | null };
  }): string {
    const env = emailEnv((k) => this.configService.get<string>(k));
    const first = (p.firstName || '').trim().split(/\s+/)[0] || 'there';
    // {{name}} is replaced before Markdown runs; markdownToEmailHtml escapes everything, including the name.
    const md = (p.bodyMarkdown || '').replace(/\{\{\s*name\s*\}\}/gi, first);
    const label = p.label === null || p.label === undefined ? DEFAULT_LABEL[p.category] || null : p.label || null;
    const firstLine = md.split('\n').find((l) => l.trim() && !/^\s*(hi|hello|dear)\b/i.test(l)) || '';
    return renderEmail({
      logoUrl: env.logoUrl,
      preheader: firstLine.replace(/[#*>\[\]()-]/g, '').trim().slice(0, 120),
      label,
      labelTone: isRequiredCategory(p.category) ? 'neutral' : 'brand',
      title: p.subject,
      bodyHtml: markdownToEmailHtml(md),
      footerReason: FOOTER_REASON[p.category] || FOOTER_REASON.announcement,
      unsubscribeUrl: p.unsubscribeUrl,
      termsUrl: p.links.termsUrl,
      privacyUrl: p.links.privacyUrl,
    });
  }
}

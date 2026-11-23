import { Injectable, Logger, OnModuleInit, NotFoundException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v2 as cloudinary } from 'cloudinary';
import { NotificationsService } from '../notifications/notifications.service';
import {
  Feedback,
  FeedbackKind,
  FeedbackPriority,
  FeedbackStatus,
} from './entities/feedback.entity';

export interface CreateFeedbackParams {
  userId: string | null;
  kind: FeedbackKind;
  title: string;
  description: string;
  area?: string;
  impact?: string;
  priority?: FeedbackPriority;
  images?: string[]; // Base64 data strings (up to 3)
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  theme?: string;
}

export interface AdminFeedbackFilters {
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  kind?: FeedbackKind;
  area?: string;
  /** Free-text search over title, description, id and the sender's name/email. */
  search?: string;
  /** Only items created at or after this epoch-ms timestamp. */
  since?: number;
  limit?: number;
  offset?: number;
}

export interface FeedbackSender {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  reportCount: number;
}

export type AdminFeedbackItem = Feedback & { user: FeedbackSender | null };

export interface FeedbackStats {
  total: number;
  feature: number;
  bug: number;
  byStatus: Record<FeedbackStatus, number>;
  /** Not fixed/resolved/closed and no team reply yet. */
  awaitingReply: number;
  oldestAwaitingAt: number | null;
  criticalOpen: number;
  fixedLast7d: number;
}

export interface AdminUpdateParams {
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  adminNotes?: string;
  /** Send the sender an in-app notification + push about the change. */
  notify?: boolean;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const DONE_STATUSES: FeedbackStatus[] = ['fixed', 'resolved', 'closed'];
const ALL_STATUSES: FeedbackStatus[] = ['open', 'investigating', 'in_progress', 'fixed', 'resolved', 'closed'];

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  in_progress: 'In progress',
  fixed: 'Fixed',
  resolved: 'Resolved',
  closed: 'Closed',
};

@Injectable()
export class FeedbackService implements OnModuleInit {
  private readonly logger = new Logger(FeedbackService.name);
  private cloudinaryConfigured = false;

  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepo: Repository<Feedback>,
    private readonly configService: ConfigService,
    @Optional() private readonly notificationsService?: NotificationsService,
  ) {}

  async onModuleInit() {
    // 1. Ensure core.feedback table and indexes exist idempotently
    try {
      await this.feedbackRepo.query(`
        CREATE TABLE IF NOT EXISTS core.feedback (
          id                TEXT PRIMARY KEY,
          user_id           TEXT,
          kind              TEXT NOT NULL,
          title             TEXT NOT NULL,
          description       TEXT NOT NULL,
          area              TEXT,
          impact            TEXT,
          priority          TEXT NOT NULL DEFAULT 'medium',
          status            TEXT NOT NULL DEFAULT 'open',
          media_urls        JSONB NOT NULL DEFAULT '[]'::jsonb,
          media_public_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
          resolved_at       BIGINT,
          media_purged      BOOLEAN NOT NULL DEFAULT FALSE,
          media_purged_at   BIGINT,
          admin_notes       TEXT,
          app_version       TEXT,
          platform          TEXT,
          os_version        TEXT,
          theme             TEXT,
          created_at        BIGINT NOT NULL,
          updated_at        BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON core.feedback (user_id);
        CREATE INDEX IF NOT EXISTS idx_feedback_status ON core.feedback (status);
        CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON core.feedback (created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_feedback_purge_candidates ON core.feedback (status, resolved_at) WHERE media_purged = FALSE;
      `);
      this.logger.log('Feedback table and indexes verified in core schema.');
    } catch (err: any) {
      this.logger.warn('Could not auto-verify core.feedback schema:', err?.message || err);
    }

    // 2. Configure Cloudinary
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET')?.trim();
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.cloudinaryConfigured = true;
      this.logger.log(`Cloudinary configured for feedback attachments: ${cloudName}`);
    } else {
      this.logger.warn('Cloudinary credentials not provided; image attachments will be skipped or saved locally.');
    }
  }

  /**
   * Creates a feedback / bug report with optional base64 image uploads (max 3).
   */
  async createFeedback(params: CreateFeedbackParams): Promise<Feedback> {
    const now = Date.now();
    const id = `fb_${now}_${Math.random().toString(36).slice(2, 8)}`;

    const mediaUrls: string[] = [];
    const mediaPublicIds: string[] = [];

    // Process attached images (max 3, optional)
    if (params.images && Array.isArray(params.images) && params.images.length > 0) {
      const imagesToUpload = params.images.slice(0, 3);
      for (let i = 0; i < imagesToUpload.length; i++) {
        const imgData = imagesToUpload[i];
        if (!imgData || typeof imgData !== 'string') continue;

        if (this.cloudinaryConfigured) {
          try {
            const uploadRes = await cloudinary.uploader.upload(imgData, {
              folder: 'regent_feedback',
              resource_type: 'image',
              tags: ['feedback', params.kind, id],
            });
            if (uploadRes?.secure_url) {
              mediaUrls.push(uploadRes.secure_url);
              mediaPublicIds.push(uploadRes.public_id);
            }
          } catch (uploadErr: any) {
            this.logger.warn(
              `[Feedback] Failed to upload screenshot ${i + 1} to Cloudinary: ${uploadErr?.message || uploadErr}`,
            );
          }
        }
      }
    }

    const feedback = this.feedbackRepo.create({
      id,
      userId: params.userId ?? null,
      kind: params.kind,
      title: params.title.trim().slice(0, 120),
      description: params.description.trim().slice(0, 3000),
      area: params.area ? params.area.trim().slice(0, 50) : null,
      impact: params.impact ? params.impact.trim().slice(0, 50) : null,
      priority: params.priority || 'medium',
      status: 'open',
      mediaUrls,
      mediaPublicIds,
      resolvedAt: null,
      mediaPurged: false,
      mediaPurgedAt: null,
      adminNotes: null,
      appVersion: params.appVersion ?? null,
      platform: params.platform ?? null,
      osVersion: params.osVersion ?? null,
      theme: params.theme ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const saved = await this.feedbackRepo.save(feedback);
    this.logger.log(`[Feedback Created] ID: ${saved.id} | User: ${saved.userId} | ${saved.kind.toUpperCase()} (${saved.priority}): ${saved.title}`);
    return saved;
  }

  /**
   * Retrieves all reports submitted by a specific user.
   */
  async getUserFeedback(userId: string): Promise<Feedback[]> {
    if (!userId) return [];
    return this.feedbackRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  /**
   * Lets the person who sent a report change it, but only while it is still 'open'.
   * Once the team starts reviewing (any other status), the report is locked.
   */
  async updateOwnFeedback(
    userId: string,
    id: string,
    changes: { title?: string; description?: string; area?: string | null; impact?: string | null; priority?: FeedbackPriority },
  ): Promise<Feedback> {
    const item = await this.feedbackRepo.findOne({ where: { id } });
    if (!item || !userId || item.userId !== userId) {
      throw new NotFoundException('Report not found.');
    }
    if (item.status !== 'open') {
      throw new ForbiddenException('This report is already being reviewed, so it can’t be edited.');
    }

    if (typeof changes.title === 'string') item.title = changes.title.trim().slice(0, 120);
    if (typeof changes.description === 'string') item.description = changes.description.trim().slice(0, 3000);
    if (changes.area !== undefined) item.area = changes.area ? changes.area.trim().slice(0, 50) : null;
    if (changes.impact !== undefined) item.impact = changes.impact ? changes.impact.trim().slice(0, 50) : null;
    if (changes.priority) item.priority = changes.priority;

    item.updatedAt = Date.now();
    return this.feedbackRepo.save(item);
  }

  /**
   * Admin inbox: filtered, newest first, with the sender's name/email attached.
   */
  async getAllFeedback(filters: AdminFeedbackFilters = {}): Promise<{ items: AdminFeedbackItem[]; total: number }> {
    const limit = Math.min(Math.max(1, Number(filters.limit) || 50), 100);
    const offset = Math.max(0, Number(filters.offset) || 0);

    const qb = this.feedbackRepo.createQueryBuilder('fb');
    if (filters.status) qb.andWhere('fb.status = :status', { status: filters.status });
    if (filters.priority) qb.andWhere('fb.priority = :priority', { priority: filters.priority });
    if (filters.kind) qb.andWhere('fb.kind = :kind', { kind: filters.kind });
    if (filters.area) qb.andWhere('fb.area = :area', { area: filters.area });
    if (filters.since && Number(filters.since) > 0) {
      qb.andWhere('fb.created_at >= :since', { since: String(Math.floor(Number(filters.since))) });
    }
    const search = (filters.search || '').trim().slice(0, 100);
    if (search) {
      const escaped = search.replace(/\\/g, '\\\\').replace(/[%_]/g, '\\$&');
      qb.andWhere(
        `(fb.title ILIKE :like OR fb.description ILIKE :like OR fb.id ILIKE :like OR fb.user_id IN (
          SELECT u.id FROM core.users u
          WHERE (COALESCE(u.name, '') || ' ' || COALESCE(u.email, '')) ILIKE :like
        ))`,
        { like: `%${escaped}%` },
      );
    }
    qb.orderBy('fb.created_at', 'DESC').skip(offset).take(limit);

    const [rows, total] = await qb.getManyAndCount();
    const senders = await this.loadSenders(rows.map((r) => r.userId));
    const items = rows.map((r) => Object.assign(r, { user: r.userId ? senders.get(r.userId) ?? null : null }));
    return { items, total };
  }

  /** One item for the admin detail screen. */
  async getOneForAdmin(id: string): Promise<AdminFeedbackItem> {
    const item = await this.feedbackRepo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`Feedback report ${id} not found.`);
    const senders = await this.loadSenders([item.userId]);
    return Object.assign(item, { user: item.userId ? senders.get(item.userId) ?? null : null });
  }

  /** Counts for the admin inbox hero card and segmented control. */
  async getStats(): Promise<FeedbackStats> {
    const since7d = String(Date.now() - SEVEN_DAYS_MS);
    const rows: any[] = await this.feedbackRepo.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE kind = 'feature')::int AS feature,
         COUNT(*) FILTER (WHERE kind = 'bug')::int AS bug,
         COUNT(*) FILTER (WHERE status = 'open')::int AS s_open,
         COUNT(*) FILTER (WHERE status = 'investigating')::int AS s_investigating,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS s_in_progress,
         COUNT(*) FILTER (WHERE status = 'fixed')::int AS s_fixed,
         COUNT(*) FILTER (WHERE status = 'resolved')::int AS s_resolved,
         COUNT(*) FILTER (WHERE status = 'closed')::int AS s_closed,
         COUNT(*) FILTER (WHERE status NOT IN ('fixed','resolved','closed') AND COALESCE(admin_notes, '') = '')::int AS awaiting,
         MIN(created_at) FILTER (WHERE status NOT IN ('fixed','resolved','closed') AND COALESCE(admin_notes, '') = '') AS oldest_awaiting,
         COUNT(*) FILTER (WHERE priority = 'critical' AND status NOT IN ('fixed','resolved','closed'))::int AS critical_open,
         COUNT(*) FILTER (WHERE status IN ('fixed','resolved') AND resolved_at >= $1)::int AS fixed_7d
       FROM core.feedback`,
      [since7d],
    );
    const r = rows?.[0] || {};
    const n = (v: any) => Number(v) || 0;
    const byStatus = {} as Record<FeedbackStatus, number>;
    for (const st of ALL_STATUSES) byStatus[st] = n(r[`s_${st}`]);
    return {
      total: n(r.total),
      feature: n(r.feature),
      bug: n(r.bug),
      byStatus,
      awaitingReply: n(r.awaiting),
      oldestAwaitingAt: r.oldest_awaiting ? Number(r.oldest_awaiting) : null,
      criticalOpen: n(r.critical_open),
      fixedLast7d: n(r.fixed_7d),
    };
  }

  /**
   * Updates status, priority, or the team reply (admin notes).
   * If transitioning to 'fixed', 'resolved', or 'closed', records resolvedAt for the 30-day retention clock.
   * With notify, the sender gets an in-app notification and push.
   */
  async updateStatus(
    id: string,
    status?: FeedbackStatus,
    priority?: FeedbackPriority,
    adminNotes?: string,
    notify = false,
  ): Promise<Feedback> {
    const item = await this.feedbackRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Feedback report ${id} not found.`);
    }

    const now = Date.now();
    const statusChanged = !!status && status !== item.status;
    const previousNotes = (item.adminNotes || '').trim();
    if (status && statusChanged) {
      item.status = status;
      if (DONE_STATUSES.includes(status)) {
        if (!item.resolvedAt) {
          item.resolvedAt = now;
        }
      } else {
        // Re-opened: reset resolution timestamp
        item.resolvedAt = null;
      }
    }

    if (priority) {
      item.priority = priority;
    }

    if (typeof adminNotes === 'string') {
      item.adminNotes = adminNotes.trim().slice(0, 2000);
    }
    const nextNotes = (item.adminNotes || '').trim();
    const replyChanged = nextNotes !== previousNotes && nextNotes.length > 0;

    item.updatedAt = now;
    const saved = await this.feedbackRepo.save(item);

    if (notify && saved.userId && (statusChanged || replyChanged)) {
      await this.notifySender(saved, statusChanged, replyChanged);
    }
    return saved;
  }

  /** Admin update with a single params object (used by the controller). */
  async adminUpdate(id: string, params: AdminUpdateParams): Promise<AdminFeedbackItem> {
    await this.updateStatus(id, params.status, params.priority, params.adminNotes, !!params.notify);
    return this.getOneForAdmin(id);
  }

  private async notifySender(item: Feedback, statusChanged: boolean, replyChanged: boolean) {
    if (!this.notificationsService || !item.userId) return;
    const what = item.kind === 'bug' ? 'report' : 'idea';
    const shortTitle = item.title.length > 60 ? `${item.title.slice(0, 57)}…` : item.title;
    const title = replyChanged
      ? `The Regent team replied to your ${what}`
      : `Your ${what} is now ${STATUS_LABELS[item.status].toLowerCase()}`;
    const body = replyChanged ? (item.adminNotes || '').trim().slice(0, 160) : `“${shortTitle}”`;
    try {
      await this.notificationsService.sendNotification(item.userId, {
        title,
        body,
        type: 'feedback_update',
        payload: {
          feedbackId: item.id,
          status: item.status,
          statusChanged,
          replyChanged,
          deepLink: `regent://feedback/${item.kind}`,
        },
      });
    } catch (err: any) {
      // The update itself is saved; a failed notification must not undo it.
      this.logger.warn(`[Feedback] Couldn't notify ${item.userId} about ${item.id}: ${err?.message || err}`);
    }
  }

  /** Name, email, avatar and report count for each sender id. */
  private async loadSenders(ids: (string | null)[]): Promise<Map<string, FeedbackSender>> {
    const unique = Array.from(new Set(ids.filter((x): x is string => !!x)));
    const map = new Map<string, FeedbackSender>();
    if (unique.length === 0) return map;
    try {
      const users: any[] = await this.feedbackRepo.query(
        `SELECT u.id, u.name, u.email, u.avatar_url,
                (SELECT COUNT(*)::int FROM core.feedback f WHERE f.user_id = u.id) AS report_count
           FROM core.users u
          WHERE u.id = ANY($1)`,
        [unique],
      );
      for (const u of users || []) {
        map.set(u.id, {
          id: u.id,
          name: u.name ?? null,
          email: u.email ?? null,
          avatarUrl: u.avatar_url ?? null,
          reportCount: Number(u.report_count) || 0,
        });
      }
    } catch (err: any) {
      this.logger.warn(`[Feedback] Couldn't load senders: ${err?.message || err}`);
    }
    return map;
  }

  /**
   * Automated cron running daily at midnight:
   * Permanently deletes Cloudinary media for issues resolved >= 30 days ago.
   * The ticket and resolution history in the database remain completely intact for audit/transparency.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeResolvedMediaCron() {
    const now = Date.now();
    const cutoff = now - THIRTY_DAYS_MS;

    try {
      const candidates = await this.feedbackRepo
        .createQueryBuilder('fb')
        .where('fb.status IN (:...statuses)', { statuses: ['fixed', 'resolved', 'closed'] })
        .andWhere('fb.resolved_at <= :cutoff', { cutoff })
        .andWhere('fb.media_purged = false')
        .andWhere("jsonb_array_length(fb.media_urls) > 0")
        .take(100)
        .getMany();

      if (candidates.length === 0) return;

      this.logger.log(`[FeedbackMediaPurgeCron] Found ${candidates.length} ticket(s) with media eligible for 30-day purge.`);

      for (const ticket of candidates) {
        try {
          if (this.cloudinaryConfigured && Array.isArray(ticket.mediaPublicIds)) {
            for (const publicId of ticket.mediaPublicIds) {
              try {
                await cloudinary.uploader.destroy(publicId);
              } catch (delErr: any) {
                this.logger.warn(`Could not destroy Cloudinary asset ${publicId}: ${delErr?.message || delErr}`);
              }
            }
          }

          ticket.mediaUrls = [];
          ticket.mediaPublicIds = [];
          ticket.mediaPurged = true;
          ticket.mediaPurgedAt = now;
          ticket.updatedAt = now;
          await this.feedbackRepo.save(ticket);

          this.logger.log(`[FeedbackMediaPurgeCron] Purged media for ticket ${ticket.id} (resolved at ${ticket.resolvedAt})`);
        } catch (itemErr: any) {
          this.logger.error(`Error purging media for ticket ${ticket.id}:`, itemErr);
        }
      }
    } catch (err: any) {
      this.logger.error('[FeedbackMediaPurgeCron] Error running media purge cron:', err);
    }
  }
}


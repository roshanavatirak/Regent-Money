import { Injectable, Logger, OnModuleInit, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { v2 as cloudinary } from 'cloudinary';
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

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class FeedbackService implements OnModuleInit {
  private readonly logger = new Logger(FeedbackService.name);
  private cloudinaryConfigured = false;

  constructor(
    @InjectRepository(Feedback)
    private readonly feedbackRepo: Repository<Feedback>,
    private readonly configService: ConfigService,
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
   * Retrieves all feedback tickets (for Admin use), with optional status and priority filters.
   */
  async getAllFeedback(status?: FeedbackStatus, priority?: FeedbackPriority, limit = 50, offset = 0) {
    const qb = this.feedbackRepo.createQueryBuilder('fb');
    if (status) {
      qb.andWhere('fb.status = :status', { status });
    }
    if (priority) {
      qb.andWhere('fb.priority = :priority', { priority });
    }
    qb.orderBy('fb.created_at', 'DESC')
      .skip(offset)
      .take(limit);

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * Updates status, priority, or admin notes.
   * If transitioning to 'fixed', 'resolved', or 'closed', records resolvedAt for the 30-day retention clock.
   */
  async updateStatus(
    id: string,
    status?: FeedbackStatus,
    priority?: FeedbackPriority,
    adminNotes?: string,
  ): Promise<Feedback> {
    const item = await this.feedbackRepo.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Feedback report ${id} not found.`);
    }

    const now = Date.now();
    if (status && status !== item.status) {
      item.status = status;
      if (['fixed', 'resolved', 'closed'].includes(status)) {
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
      item.adminNotes = adminNotes.trim();
    }

    item.updatedAt = now;
    return this.feedbackRepo.save(item);
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


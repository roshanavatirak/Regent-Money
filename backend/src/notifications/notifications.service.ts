import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Notification } from './entities/notification.entity';
import { NotificationLog } from './entities/notification-log.entity';
import { Broadcast } from './entities/broadcast.entity';
import { SignalsService } from './signals.service';
import { User } from '../users/entities/user.entity';
import { getDailyHumorMessage, HumorousMessage } from './humorous-messages';
import * as crypto from 'crypto';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(NotificationLog)
    private readonly logRepository: Repository<NotificationLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Broadcast)
    private readonly broadcastRepository: Repository<Broadcast>,
    private readonly signalsService: SignalsService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    this.logger.log('Initializing Notifications database schema check...');
    try {
      // 1. Add push_token column to core.users if missing
      await this.dataSource.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS push_token TEXT;
      `);

      // 2. Create core.notifications table if missing
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.notifications (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES core.users(id) NOT NULL,
          agent_id TEXT,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          type TEXT NOT NULL,
          read_status BOOLEAN DEFAULT FALSE,
          payload JSONB,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          is_deleted BOOLEAN DEFAULT FALSE
        );
      `);

      // 3. Create core.notification_log table if missing
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.notification_log (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES core.users(id) NOT NULL,
          signal_type TEXT NOT NULL,
          numbers_used JSONB,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          tone TEXT NOT NULL DEFAULT 'straight',
          deep_link TEXT,
          sent_at BIGINT NOT NULL,
          opened_at BIGINT,
          is_opened BOOLEAN DEFAULT FALSE
        );
      `);

      // 4. Create core.user_signals table if missing
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.user_signals (
          id TEXT PRIMARY KEY,
          user_id TEXT REFERENCES core.users(id) NOT NULL,
          signals JSONB NOT NULL,
          computed_at BIGINT NOT NULL
        );
      `);

      // 5. Create core.broadcasts table if missing & add last_read_broadcast_at to core.users
      await this.dataSource.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS last_read_broadcast_at BIGINT DEFAULT 0;

        CREATE TABLE IF NOT EXISTS core.broadcasts (
          id TEXT PRIMARY KEY,
          idempotency_key TEXT UNIQUE,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'announcement',
          payload JSONB DEFAULT '{}',
          target_filter TEXT NOT NULL DEFAULT 'all',
          status TEXT NOT NULL DEFAULT 'pending',
          total_targeted INT DEFAULT 0,
          push_queued INT DEFAULT 0,
          push_delivered INT DEFAULT 0,
          push_failed INT DEFAULT 0,
          last_processed_user_id TEXT,
          lease_until TIMESTAMPTZ,
          created_at BIGINT NOT NULL,
          completed_at BIGINT,
          created_by TEXT,
          is_deleted BOOLEAN DEFAULT FALSE
        );
      `);

      // 6. Ensure indexes
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_notification_log_user_sent ON core.notification_log (user_id, sent_at DESC);
        CREATE INDEX IF NOT EXISTS idx_user_signals_user_computed ON core.user_signals (user_id, computed_at DESC);
        CREATE INDEX IF NOT EXISTS idx_broadcasts_status_created ON core.broadcasts (status, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_broadcasts_created_at ON core.broadcasts (created_at DESC);
      `);

      // 7. Enable RLS and setup policies safely
      await this.dataSource.query(`
        ALTER TABLE core.notifications ENABLE ROW LEVEL SECURITY;
        ALTER TABLE core.notification_log ENABLE ROW LEVEL SECURITY;
        ALTER TABLE core.user_signals ENABLE ROW LEVEL SECURITY;
        ALTER TABLE core.broadcasts ENABLE ROW LEVEL SECURITY;
      `);

      // Create policies if not exists
      await this.dataSource.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'core' AND tablename = 'notifications' AND policyname = 'Users can manage their own notifications'
          ) THEN
            CREATE POLICY "Users can manage their own notifications" ON core.notifications FOR ALL USING (auth.uid()::text = user_id);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'core' AND tablename = 'notification_log' AND policyname = 'Users can view their own notification logs'
          ) THEN
            CREATE POLICY "Users can view their own notification logs" ON core.notification_log FOR ALL USING (auth.uid()::text = user_id);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'core' AND tablename = 'user_signals' AND policyname = 'Users can view their own signals'
          ) THEN
            CREATE POLICY "Users can view their own signals" ON core.user_signals FOR ALL USING (auth.uid()::text = user_id);
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'core' AND tablename = 'broadcasts' AND policyname = 'Anyone authenticated can read active broadcasts'
          ) THEN
            CREATE POLICY "Anyone authenticated can read active broadcasts" ON core.broadcasts FOR SELECT USING (is_deleted = false);
          END IF;
        END
        $$;
      `);

      this.logger.log('Notifications, broadcasts, notification_log, and user_signals schema verified successfully.');
    } catch (err: any) {
      this.logger.error(`Database initialization error: ${err.message}`, err.stack);
    }
  }

  private maskToken(token?: string | null): string {
    if (!token || token.length < 15) return '***';
    return `${token.slice(0, 15)}...${token.slice(-5)}`;
  }

  async registerPushToken(userId: string, token: string | null): Promise<{ success: boolean }> {
    this.logger.log(`Registering push token for user: ${userId} (Token: ${token ? 'provided' : 'cleared'})`);
    const user = await this.userRepository.findOne({ where: { id: userId, isDeleted: false } });
    if (!user) {
      throw new BadRequestException('User not found.');
    }

    user.pushToken = token || null;
    user.updatedAt = Date.now();
    await this.userRepository.save(user);

    return { success: true };
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    this.logger.log(`Fetching notifications for user: ${userId}`);

    // Retrieve user sign-up date and read broadcast watermark
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });
    const userCreatedAt = Number(user?.createdAt || 0);
    const lastReadBroadcastAt = Number(user?.lastReadBroadcastAt || 0);

    // 1. Fetch personal notifications
    const personal = await this.notificationRepository.find({
      where: { userId, isDeleted: false },
      order: { createdAt: 'DESC' },
      take: 50,
    });

    // 2. Fetch broadcasts created on or after user sign-up (zero per-user storage overhead)
    let broadcasts: Broadcast[] = [];
    try {
      broadcasts = await this.broadcastRepository
        .createQueryBuilder('b')
        .where('b.isDeleted = false')
        .andWhere('b.status = :status', { status: 'completed' })
        .andWhere('b.createdAt >= :userCreatedAt', { userCreatedAt })
        .orderBy('b.createdAt', 'DESC')
        .take(30)
        .getMany();
    } catch (err: any) {
      this.logger.warn(`Could not fetch broadcasts for user ${userId}: ${err.message}`);
    }

    // Map broadcasts to in-app notification format
    const broadcastNotifs: Notification[] = broadcasts.map((b) => {
      const isRead = Boolean(lastReadBroadcastAt && lastReadBroadcastAt >= b.createdAt);
      return {
        id: b.id,
        userId,
        agentId: b.type === 'daily_humor' ? 'daily_humor' : 'system_broadcast',
        title: b.title,
        body: b.body,
        type: b.type,
        readStatus: isRead,
        payload: b.payload,
        createdAt: b.createdAt,
        updatedAt: b.completedAt || b.createdAt,
        isDeleted: false,
      } as Notification;
    });

    const merged = [...personal, ...broadcastNotifs];
    merged.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    return merged;
  }

  async markAsRead(userId: string, notificationId: string): Promise<Notification> {
    this.logger.log(`Marking notification ${notificationId} as read for user ${userId}`);

    // If it's a zero-storage broadcast notification, advance the user's lastReadBroadcastAt
    if (notificationId.startsWith('bcast_')) {
      const bcast = await this.broadcastRepository.findOne({ where: { id: notificationId } });
      if (bcast) {
        const now = Date.now();
        await this.userRepository
          .createQueryBuilder()
          .update(User)
          .set({
            lastReadBroadcastAt: () => `GREATEST(COALESCE(last_read_broadcast_at, 0), ${bcast.createdAt})`,
            updatedAt: now,
          })
          .where('id = :userId', { userId })
          .execute();

        return {
          id: bcast.id,
          userId,
          agentId: bcast.type === 'daily_humor' ? 'daily_humor' : 'system_broadcast',
          title: bcast.title,
          body: bcast.body,
          type: bcast.type,
          readStatus: true,
          payload: bcast.payload,
          createdAt: bcast.createdAt,
          updatedAt: now,
          isDeleted: false,
        } as Notification;
      }
    }

    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId, isDeleted: false },
    });
    if (!notification) {
      throw new BadRequestException('Notification not found.');
    }

    notification.readStatus = true;
    notification.updatedAt = Date.now();
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(userId: string): Promise<{ success: boolean; count: number }> {
    this.logger.log(`Marking all non-review notifications as read for user ${userId}`);
    const now = Date.now();
    const result = await this.notificationRepository.update(
      { userId, readStatus: false, isDeleted: false, type: Not('review') },
      { readStatus: true, updatedAt: now },
    );

    // Synchronize broadcast read watermark
    await this.userRepository.update(
      { id: userId },
      { lastReadBroadcastAt: now, updatedAt: now },
    );

    return { success: true, count: result.affected || 0 };
  }

  /** A user's own notification by id, including resolved and deleted ones. */
  async findNotification(userId: string, notificationId: string): Promise<Notification | null> {
    return this.notificationRepository.findOne({ where: { id: notificationId, userId } });
  }

  /**
   * Every duplicate review ever raised for an SMS (open, answered or deleted), matched on any of
   * its identity keys. Lets the sync service ask about a given SMS once and never again.
   */
  async findDuplicateReviews(userId: string, keys: string[]): Promise<Notification[]> {
    const cleanKeys = Array.from(new Set(keys.filter(Boolean)));
    if (cleanKeys.length === 0) return [];
    return this.notificationRepository
      .createQueryBuilder('n')
      .where('n.userId = :userId', { userId })
      .andWhere(`n.payload ->> 'action' = 'duplicate_transaction_review'`)
      .andWhere(
        `(n.payload -> 'transactionData' ->> 'smsId' IN (:...keys) OR n.payload -> 'transactionData' ->> 'contentId' IN (:...keys))`,
        { keys: cleanKeys },
      )
      .getMany();
  }

  /**
   * Closes open duplicate reviews for an SMS that turned out to be already recorded,
   * clearing false alerts raised before SMS identities were stored.
   */
  async resolveStaleDuplicateReviews(userId: string, keys: string[]): Promise<number> {
    const reviews = await this.findDuplicateReviews(userId, keys);
    const open = reviews.filter((n) => !n.isDeleted && !n.payload?.resolved);
    if (open.length === 0) return 0;
    const now = Date.now();
    for (const n of open) {
      n.readStatus = true;
      n.payload = { ...(n.payload || {}), resolved: true, decision: 'already_recorded' };
      n.updatedAt = now;
    }
    await this.notificationRepository.save(open);
    this.logger.log(`Closed ${open.length} stale duplicate review(s) for user ${userId}`);
    return open.length;
  }

  async resolveNotification(userId: string, notificationId: string, decision?: string): Promise<Notification> {
    this.logger.log(`Resolving review notification ${notificationId} for user ${userId} with decision: ${decision}`);
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId, isDeleted: false },
    });
    if (!notification) {
      throw new BadRequestException('Notification not found.');
    }

    notification.readStatus = true;
    notification.payload = {
      ...(notification.payload || {}),
      resolved: true,
      decision,
    };
    notification.updatedAt = Date.now();
    return this.notificationRepository.save(notification);
  }

  async deleteNotification(userId: string, notificationId: string): Promise<{ success: boolean }> {
    this.logger.log(`Soft deleting notification ${notificationId} for user ${userId}`);
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId, isDeleted: false },
    });
    if (!notification) {
      throw new BadRequestException('Notification not found.');
    }

    notification.isDeleted = true;
    notification.updatedAt = Date.now();
    await this.notificationRepository.save(notification);

    return { success: true };
  }

  async sendNotification(
    userId: string,
    data: { agentId?: string; title: string; body: string; type: string; payload?: any },
  ): Promise<Notification> {
    this.logger.log(`Creating notification for user: ${userId}, Agent: ${data.agentId ?? 'system'}`);

    // Verify user exists and retrieve their push token if registered
    const user = await this.userRepository.findOne({ where: { id: userId, isDeleted: false } });
    if (!user) {
      throw new BadRequestException('Recipient user not found.');
    }

    const now = Date.now();
    const notification = this.notificationRepository.create({
      id: 'notif_' + crypto.randomBytes(8).toString('hex'),
      userId,
      agentId: data.agentId || 'system',
      title: data.title,
      body: data.body,
      type: data.type,
      readStatus: false,
      payload: data.payload || null,
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
    });

    const savedNotification = await this.notificationRepository.save(notification);

    // If user has a registered push token, dispatch push delivery asynchronously
    if (user.pushToken) {
      this.sendExpoPush([
        {
          token: user.pushToken,
          title: data.title,
          body: data.body,
          payload: data.payload,
        },
      ]).catch((err) => {
        this.logger.warn(`Failed to send push notification: ${err.message}. DB record saved.`);
      });
    } else {
      this.logger.log(`User ${userId} does not have a registered push token. DB log saved.`);
    }

    return savedNotification;
  }

  /**
   * Tracks when a user opens a notification from device tray or in-app inbox.
   */
  async markNotificationOpened(
    notificationId: string,
    userId?: string,
  ): Promise<{ success: boolean; notificationId: string }> {
    this.logger.log(`Marking notification ${notificationId} as opened (User: ${userId || 'unknown'})`);
    const now = Date.now();

    // 1. Update NotificationLog open status
    try {
      const logWhere: any = { id: notificationId };
      if (userId) logWhere.userId = userId;
      const logEntry = await this.logRepository.findOne({ where: logWhere });
      if (logEntry) {
        logEntry.isOpened = true;
        logEntry.openedAt = now;
        await this.logRepository.save(logEntry);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to update notification log open state: ${err.message}`);
    }

    // 2. Synchronize readStatus on core.notifications
    try {
      const notifWhere: any = { id: notificationId, isDeleted: false };
      if (userId) notifWhere.userId = userId;
      const notif = await this.notificationRepository.findOne({ where: notifWhere });
      if (notif) {
        notif.readStatus = true;
        notif.updatedAt = now;
        await this.notificationRepository.save(notif);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to update core notification read state: ${err.message}`);
    }

    return { success: true, notificationId };
  }

  /**
   * Autonomous 9:30 AM IST Cron (04:00 UTC)
   * Detects high-priority financial signals and dispatches personalized updates.
   */
  @Cron('0 4 * * *')
  async handleMorningSignalsCron() {
    this.logger.log('[SignalsCron] Running 9:30 AM IST morning autonomous signal dispatch...');
    try {
      await this.signalsService.runSignalsDispatchJob();
    } catch (e: any) {
      this.logger.error(`[SignalsCron] Morning dispatch error: ${e.message}`, e.stack);
    }
  }

  /**
   * Autonomous 8:30 PM IST Cron (15:00 UTC)
   * Detects high-priority financial signals and dispatches evening personalized updates.
   */
  @Cron('0 15 * * *')
  async handleEveningSignalsCron() {
    this.logger.log('[SignalsCron] Running 8:30 PM IST evening autonomous signal dispatch...');
    try {
      await this.signalsService.runSignalsDispatchJob();
    } catch (e: any) {
      this.logger.error(`[SignalsCron] Evening dispatch error: ${e.message}`, e.stack);
    }
  }

  /**
   * Retrieves active non-banned user count and how many have push tokens registered.
   */
  async getAudienceEstimate(): Promise<{ totalUsers: number; pushEnabledUsers: number }> {
    const rows = await this.dataSource.query(`
      SELECT 
        COUNT(*)::int as total_users,
        COUNT(CASE WHEN push_token IS NOT NULL AND push_token != '' THEN 1 END)::int as push_enabled_users
      FROM core.users
      WHERE is_deleted = false AND is_banned = false;
    `);
    const row = rows[0] || {};
    return {
      totalUsers: Number(row.total_users || 0),
      pushEnabledUsers: Number(row.push_enabled_users || 0),
    };
  }

  /**
   * Creates a single broadcast record in core.broadcasts (zero per-user storage multiplication)
   * and asynchronously kicks off batch dispatch.
   */
  async createBroadcast(data: {
    title: string;
    body: string;
    type?: string;
    payload?: any;
    targetFilter?: string;
    idempotencyKey?: string;
    createdBy?: string;
  }): Promise<Broadcast> {
    if (data.idempotencyKey) {
      const existing = await this.broadcastRepository.findOne({
        where: { idempotencyKey: data.idempotencyKey },
      });
      if (existing) {
        this.logger.log(`[Broadcast] Reusing existing broadcast for idempotency key: ${data.idempotencyKey}`);
        return existing;
      }
    }

    const estimate = await this.getAudienceEstimate();
    const now = Date.now();
    const broadcast = this.broadcastRepository.create({
      id: 'bcast_' + crypto.randomBytes(8).toString('hex'),
      idempotencyKey: data.idempotencyKey || null,
      title: data.title,
      body: data.body,
      type: data.type || 'announcement',
      payload: data.payload || {},
      targetFilter: data.targetFilter || 'all',
      status: 'pending',
      totalTargeted: estimate.totalUsers,
      pushQueued: 0,
      pushDelivered: 0,
      pushFailed: 0,
      createdAt: now,
      createdBy: data.createdBy || 'system',
      isDeleted: false,
    });

    const saved = await this.broadcastRepository.save(broadcast);

    // Kick off dispatch asynchronously
    setImmediate(() => {
      this.dispatchBroadcast(saved.id).catch((err) => {
        this.logger.error(`[Broadcast] Dispatch error for ${saved.id}: ${err.message}`, err.stack);
      });
    });

    return saved;
  }

  /**
   * Resumable, lease-protected batch dispatcher.
   * Batches Expo push requests up to 100 per HTTP/2 call.
   * Prunes dead tokens on DeviceNotRegistered.
   * Consumes zero Redis commands.
   */
  async dispatchBroadcast(broadcastId: string): Promise<void> {
    this.logger.log(`[Broadcast] Starting dispatch for broadcast: ${broadcastId}`);

    // Claim lease for 2 minutes
    const claim = await this.dataSource.query(
      `UPDATE core.broadcasts
       SET status = 'processing', lease_until = NOW() + INTERVAL '2 minutes'
       WHERE id = $1 AND (lease_until IS NULL OR lease_until < NOW() OR status = 'pending')
       RETURNING *;`,
      [broadcastId],
    );

    if (!claim || claim.length === 0) {
      this.logger.warn(`[Broadcast] Broadcast ${broadcastId} already running or completed.`);
      return;
    }

    const broadcast = claim[0];
    let cursor: string | null = broadcast.last_processed_user_id || null;
    const batchSize = 100;
    let keepRunning = true;

    const expoAccessToken = process.env.EXPO_ACCESS_TOKEN;
    const expoHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (expoAccessToken) {
      expoHeaders['Authorization'] = `Bearer ${expoAccessToken}`;
    }

    while (keepRunning) {
      const users: Array<{ id: string; push_token: string }> = await this.dataSource.query(
        `SELECT id, push_token 
         FROM core.users 
         WHERE is_deleted = false 
           AND is_banned = false 
           AND push_token IS NOT NULL 
           AND push_token != ''
           AND ($1::text IS NULL OR id > $1)
         ORDER BY id ASC 
         LIMIT $2;`,
        [cursor, batchSize],
      );

      if (!users || users.length === 0) {
        keepRunning = false;
        break;
      }

      const validUsers = users.filter((u) => {
        return (
          typeof u.push_token === 'string' &&
          (u.push_token.startsWith('ExponentPushToken[') || u.push_token.startsWith('ExpoPushToken['))
        );
      });

      let deliveredInBatch = 0;
      let failedInBatch = 0;

      if (validUsers.length > 0) {
        const pushPayload = validUsers.map((u) => ({
          to: u.push_token,
          sound: 'default',
          title: broadcast.title,
          body: broadcast.body,
          channelId: 'daily_alerts',
          priority: 'high',
          data: broadcast.payload || {},
        }));

        try {
          const response = await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: expoHeaders,
            body: JSON.stringify(pushPayload),
          });

          if (response.ok) {
            const result: any = await response.json();
            const tickets = result?.data;
            if (Array.isArray(tickets)) {
              for (let i = 0; i < tickets.length; i++) {
                const ticket = tickets[i];
                const token = validUsers[i]?.push_token;
                if (ticket.status === 'ok') {
                  deliveredInBatch++;
                } else if (ticket.status === 'error') {
                  failedInBatch++;
                  this.logger.error(
                    `[Broadcast] Expo ticket error for ${this.maskToken(token)}: ${ticket.message} (details: ${JSON.stringify(ticket.details)})`,
                  );
                  if (ticket.details?.error === 'DeviceNotRegistered' && token) {
                    this.logger.log(`[Broadcast] Dead token pruned: ${this.maskToken(token)}`);
                    await this.dataSource.query(`UPDATE core.users SET push_token = NULL WHERE push_token = $1`, [token]).catch(() => {});
                  }
                }
              }
            }
          } else {
            const errText = await response.text();
            this.logger.error(`[Broadcast] Expo HTTP error ${response.status}: ${errText}`);
            failedInBatch += validUsers.length;
          }
        } catch (pushErr: any) {
          this.logger.error(`[Broadcast] Expo push error: ${pushErr.message}`);
          failedInBatch += validUsers.length;
        }
      }

      cursor = users[users.length - 1].id;

      await this.dataSource.query(
        `UPDATE core.broadcasts
         SET 
           push_queued = push_queued + $1,
           push_delivered = push_delivered + $2,
           push_failed = push_failed + $3,
           last_processed_user_id = $4,
           lease_until = NOW() + INTERVAL '2 minutes'
         WHERE id = $5;`,
        [validUsers.length, deliveredInBatch, failedInBatch, cursor, broadcastId],
      );

      if (users.length < batchSize) {
        keepRunning = false;
        break;
      }
    }

    await this.dataSource.query(
      `UPDATE core.broadcasts
       SET status = 'completed', completed_at = $1, lease_until = NULL
       WHERE id = $2;`,
      [Date.now(), broadcastId],
    );

    this.logger.log(`[Broadcast] Completed broadcast dispatch for ${broadcastId}.`);
  }

  async listBroadcasts(page = 1, limit = 20): Promise<{
    broadcasts: Broadcast[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [broadcasts, total] = await this.broadcastRepository.findAndCount({
      where: { isDeleted: false },
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

  /**
   * Broadcasts a non-repeating humorous notification to all active users.
   * Stored ONCE in core.broadcasts to protect database storage quotas.
   */
  async broadcastDailyHumor(
    slot: 'morning' | 'evening',
    customMessage?: HumorousMessage,
  ): Promise<{
    success: boolean;
    slot: string;
    message: HumorousMessage;
    totalUsers: number;
    pushQueued: number;
  }> {
    try {
      const message = customMessage || getDailyHumorMessage(slot);
      const today = new Date().toISOString().slice(0, 10);
      const idempotencyKey = `daily_humor_${slot}_${today}`;

      this.logger.log(`[Broadcast] Broadcasting "${message.title}" (${slot}) to all active users...`);

      const broadcast = await this.createBroadcast({
        idempotencyKey,
        title: message.title,
        body: message.body,
        type: 'daily_humor',
        payload: { slot, broadcastTime: Date.now() },
        createdBy: 'daily_humor_cron',
      });

      return {
        success: true,
        slot,
        message,
        totalUsers: broadcast.totalTargeted,
        pushQueued: broadcast.pushQueued,
      };
    } catch (err: any) {
      this.logger.error(`[Broadcast] Error in broadcastDailyHumor: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Dispatches push notifications directly to Expo's Push API asynchronously.
   * Prunes dead tokens on DeviceNotRegistered and masks tokens in logs.
   */
  async sendExpoPush(
    messages: Array<{ token: string; title: string; body: string; payload?: any }>,
  ): Promise<void> {
    if (!messages || messages.length === 0) return;

    // Filter valid ExponentPushToken or ExpoPushToken
    const validMessages = messages.filter((m) => {
      const isValid =
        typeof m.token === 'string' &&
        (m.token.startsWith('ExponentPushToken[') || m.token.startsWith('ExpoPushToken['));
      if (!isValid) {
        this.logger.warn(`Invalid Expo Push Token: "${this.maskToken(m.token)}". Skipping.`);
      }
      return isValid;
    });

    if (validMessages.length === 0) return;

    const expoAccessToken = process.env.EXPO_ACCESS_TOKEN;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (expoAccessToken) {
      headers['Authorization'] = `Bearer ${expoAccessToken}`;
    }

    const batchSize = 100;
    for (let i = 0; i < validMessages.length; i += batchSize) {
      const chunk = validMessages.slice(i, i + batchSize);
      const pushPayload = chunk.map((m) => ({
        to: m.token,
        sound: 'default',
        title: m.title,
        body: m.body,
        channelId: 'daily_alerts',
        priority: 'high',
        data: m.payload || {},
      }));

      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers,
          body: JSON.stringify(pushPayload),
        });

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Expo Push API returned HTTP ${response.status}: ${errorText}`);
          continue;
        }

        const result: any = await response.json();
        const tickets = result?.data;
        if (Array.isArray(tickets)) {
          tickets.forEach((ticket: any, idx: number) => {
            const token = chunk[idx]?.token;
            if (ticket.status === 'error') {
              this.logger.error(
                `Expo push delivery error for ${this.maskToken(token)}: ${ticket.message} (details: ${JSON.stringify(ticket.details)})`,
              );
              if (ticket.details?.error === 'DeviceNotRegistered' && token) {
                this.logger.log(`[Push] DeviceNotRegistered for ${this.maskToken(token)}. Pruning dead push token.`);
                this.dataSource
                  .query(`UPDATE core.users SET push_token = NULL WHERE push_token = $1`, [token])
                  .catch((err) => this.logger.warn(`Failed to prune dead token: ${err.message}`));
              }
            } else {
              this.logger.log(`Expo push ticket received: ${ticket.id}`);
            }
          });
        }
      } catch (err: any) {
        this.logger.error(`Failed to dispatch push notification batch to Expo: ${err.message}`);
      }
    }
  }
}


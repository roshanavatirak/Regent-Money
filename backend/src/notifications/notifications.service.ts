import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Notification } from './entities/notification.entity';
import { NotificationLog } from './entities/notification-log.entity';
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

      // 5. Ensure indexes
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_notification_log_user_sent ON core.notification_log (user_id, sent_at DESC);
        CREATE INDEX IF NOT EXISTS idx_user_signals_user_computed ON core.user_signals (user_id, computed_at DESC);
      `);

      // 6. Enable RLS and setup policies safely
      await this.dataSource.query(`
        ALTER TABLE core.notifications ENABLE ROW LEVEL SECURITY;
        ALTER TABLE core.notification_log ENABLE ROW LEVEL SECURITY;
        ALTER TABLE core.user_signals ENABLE ROW LEVEL SECURITY;
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
        END
        $$;
      `);

      this.logger.log('Notifications, notification_log, and user_signals schema verified successfully.');
    } catch (err: any) {
      this.logger.error(`Database initialization error: ${err.message}`, err.stack);
    }
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
    return this.notificationRepository.find({
      where: { userId, isDeleted: false },
      order: { createdAt: 'DESC' },
    });
  }

  async markAsRead(userId: string, notificationId: string): Promise<Notification> {
    this.logger.log(`Marking notification ${notificationId} as read for user ${userId}`);
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
    const result = await this.notificationRepository.update(
      { userId, readStatus: false, isDeleted: false, type: Not('review') },
      { readStatus: true, updatedAt: Date.now() },
    );
    return { success: true, count: result.affected || 0 };
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
   * Broadcasts a non-repeating humorous notification to all active users.
   * Also callable manually via API or external backup webhook.
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
      this.logger.log(`[Broadcast] Broadcasting "${message.title}" (${slot}) to all active users...`);

      const users = await this.userRepository.find({
        where: { isDeleted: false },
      });

    if (!users || users.length === 0) {
      this.logger.warn('[Broadcast] No active users found to broadcast.');
      return { success: true, slot, message, totalUsers: 0, pushQueued: 0 };
    }

    const now = Date.now();
    let pushQueued = 0;

    // 1. Bulk create notifications for in-app history
    const notificationsToSave = users.map((user) =>
      this.notificationRepository.create({
        id: 'notif_' + crypto.randomBytes(8).toString('hex'),
        userId: user.id,
        agentId: 'daily_humor',
        title: message.title,
        body: message.body,
        type: 'recommendation',
        readStatus: false,
        payload: { slot, broadcastTime: now },
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      }),
    );

    try {
      await this.notificationRepository.save(notificationsToSave);
    } catch (saveErr: any) {
      this.logger.warn(`[Broadcast] Could not batch save notifications to history: ${saveErr.message}`);
    }

    // 2. Dispatch push notifications for users with registered push tokens
    const pushMessages = users
      .filter((u) => u.pushToken)
      .map((u) => ({
        token: u.pushToken!,
        title: message.title,
        body: message.body,
        payload: { slot, type: 'daily_humor' },
      }));

    if (pushMessages.length > 0) {
      pushQueued = pushMessages.length;
      this.sendExpoPush(pushMessages).catch((err) => {
        this.logger.error(`[Broadcast] Push notification dispatch failed: ${err.message}`);
      });
    }

    this.logger.log(
      `[Broadcast] Successfully broadcasted to ${users.length} users (${pushQueued} push notifications queued).`,
    );

    return {
      success: true,
      slot,
      message,
      totalUsers: users.length,
      pushQueued,
    };
    } catch (err: any) {
      this.logger.error(`[Broadcast] Error in broadcastDailyHumor: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Dispatches push notifications directly to Expo's Push API asynchronously.
   * Completely eliminates the need for a Redis queue, avoiding Upstash request limit exhaustion.
   * Batches notifications up to 100 per request according to Expo recommendations.
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
        this.logger.warn(`Invalid Expo Push Token: "${m.token}". Skipping.`);
      }
      return isValid;
    });

    if (validMessages.length === 0) return;

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
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
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
            if (ticket.status === 'error') {
              this.logger.error(
                `Expo push delivery error for ${chunk[idx]?.token}: ${ticket.message} (details: ${JSON.stringify(ticket.details)})`,
              );
            } else {
              this.logger.log(`Expo push delivered successfully, ticket ID: ${ticket.id}`);
            }
          });
        }
      } catch (err: any) {
        this.logger.error(`Failed to dispatch push notification batch to Expo: ${err.message}`);
      }
    }
  }
}


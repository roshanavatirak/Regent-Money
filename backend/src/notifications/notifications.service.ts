import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Cron } from '@nestjs/schedule';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { getDailyHumorMessage, HumorousMessage } from './humorous-messages';
import * as crypto from 'crypto';

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectQueue('notification')
    private readonly notificationQueue: Queue,
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
          user_id UUID REFERENCES auth.users NOT NULL,
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

      // 3. Enable RLS and setup policies safely
      await this.dataSource.query(`
        ALTER TABLE core.notifications ENABLE ROW LEVEL SECURITY;
      `);

      // Create policy if not exists
      await this.dataSource.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'core' AND tablename = 'notifications' AND policyname = 'Users can manage their own notifications'
          ) THEN
            CREATE POLICY "Users can manage their own notifications" ON core.notifications FOR ALL USING (auth.uid() = user_id);
          END IF;
        END
        $$;
      `);

      this.logger.log('Notifications schema and policies verified successfully.');
    } catch (err: any) {
      this.logger.error(`Database initialization error: ${err.message}`, err.stack);
    }
  }

  async registerPushToken(userId: string, token: string): Promise<{ success: boolean }> {
    this.logger.log(`Registering push token for user: ${userId}`);
    const user = await this.userRepository.findOne({ where: { id: userId, isDeleted: false } });
    if (!user) {
      throw new BadRequestException('User not found.');
    }

    user.pushToken = token;
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

    // If user has a registered push token, queue it for push delivery
    if (user.pushToken) {
      try {
        const job = await this.notificationQueue.add(
          'sendPush',
          {
            token: user.pushToken,
            title: data.title,
            body: data.body,
            payload: data.payload,
          },
          { removeOnComplete: true, removeOnFail: 100 },
        );
        this.logger.log(`Queued push notification job (ID: ${job.id}) in Bull queue.`);
      } catch (err: any) {
        this.logger.warn(`Failed to queue push notification job: ${err.message}. Saving DB record only.`);
      }
    } else {
      this.logger.log(`User ${userId} does not have a registered push token. DB log saved.`);
    }

    return savedNotification;
  }

  /**
   * Built-in 9:00 AM IST Cron (03:30 UTC)
   * Dispatches the daily morning humorous check-in notification to all active users.
   */
  @Cron('30 3 * * *')
  async handleMorningDailyHumorCron() {
    this.logger.log('[DailyCron] Triggering 9:00 AM Morning Humorous Notification broadcast...');
    try {
      await this.broadcastDailyHumor('morning');
    } catch (e: any) {
      this.logger.error(`[DailyCron] Morning broadcast error: ${e.message}`, e.stack);
    }
  }

  /**
   * Built-in 9:00 PM IST Cron (15:30 UTC)
   * Dispatches the daily evening humorous check-in notification to all active users.
   */
  @Cron('30 15 * * *')
  async handleEveningDailyHumorCron() {
    this.logger.log('[DailyCron] Triggering 9:00 PM Evening Humorous Notification broadcast...');
    try {
      await this.broadcastDailyHumor('evening');
    } catch (e: any) {
      this.logger.error(`[DailyCron] Evening broadcast error: ${e.message}`, e.stack);
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

    await this.notificationRepository.save(notificationsToSave);

    // 2. Dispatch push notifications for users with registered push tokens
    for (const user of users) {
      if (user.pushToken) {
        try {
          await this.notificationQueue.add(
            'sendPush',
            {
              token: user.pushToken,
              title: message.title,
              body: message.body,
              payload: { slot, type: 'daily_humor' },
            },
            { removeOnComplete: true, removeOnFail: 50 },
          );
          pushQueued++;
        } catch (e: any) {
          this.logger.warn(`Failed to queue push for user ${user.id}: ${e.message}`);
        }
      }
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
}

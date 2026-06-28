import { Injectable, Logger, BadRequestException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
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
}

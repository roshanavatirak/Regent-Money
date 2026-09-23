import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationProcessor } from './notification.processor';
import { KeepAliveService } from './keep-alive.service';
import { Notification } from './entities/notification.entity';
import { User } from '../users/entities/user.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User]),
    BullModule.registerQueue({
      name: 'notification',
    }),
    AuthModule,
  ],
  providers: [NotificationsService, NotificationProcessor, KeepAliveService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}

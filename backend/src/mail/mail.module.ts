import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailService } from './mail.service';
import { EmailBroadcastService } from './email-broadcast.service';
import { EmailAccountsService } from './email-accounts.service';
import { WelcomeEmailService } from './welcome-email.service';
import { EmailBroadcast } from './entities/email-broadcast.entity';
import { EmailRecipient } from './entities/email-recipient.entity';
import { EmailUnsubscribe } from './entities/email-unsubscribe.entity';
import { User } from '../users/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      EmailBroadcast,
      EmailRecipient,
      EmailUnsubscribe,
      User,
    ]),
  ],
  providers: [EmailAccountsService, MailService, EmailBroadcastService, WelcomeEmailService],
  exports: [EmailAccountsService, MailService, EmailBroadcastService, WelcomeEmailService],
})
export class MailModule {}

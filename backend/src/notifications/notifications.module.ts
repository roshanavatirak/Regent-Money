import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { KeepAliveService } from './keep-alive.service';
import { SignalsService } from './signals.service';
import { Notification } from './entities/notification.entity';
import { NotificationLog } from './entities/notification-log.entity';
import { UserSignals } from './entities/user-signals.entity';
import { User } from '../users/entities/user.entity';
import { Transaction } from '../sync/entities/transaction.entity';
import { BudgetDeclaration } from '../sync/entities/budget-declaration.entity';
import { SavingsGoal } from '../sync/entities/savings-goal.entity';
import { BankProfile } from '../sync/entities/bank-profile.entity';
import { IncomeRecord } from '../sync/entities/income-record.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      NotificationLog,
      UserSignals,
      User,
      Transaction,
      BudgetDeclaration,
      SavingsGoal,
      BankProfile,
      IncomeRecord,
    ]),
    AuthModule,
  ],
  providers: [NotificationsService, KeepAliveService, SignalsService],
  controllers: [NotificationsController],
  exports: [NotificationsService, SignalsService],
})
export class NotificationsModule {}


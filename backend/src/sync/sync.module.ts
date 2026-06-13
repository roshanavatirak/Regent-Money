import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SyncService } from './sync.service';
import { SyncController } from './sync.controller';
import { BankProfile } from './entities/bank-profile.entity';
import { Transaction } from './entities/transaction.entity';
import { BudgetDeclaration } from './entities/budget-declaration.entity';
import { SavingsGoal } from './entities/savings-goal.entity';
import { NetWorthSnapshot } from './entities/net-worth-snapshot.entity';
import { IncomeRecord } from './entities/income-record.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BankProfile,
      Transaction,
      BudgetDeclaration,
      SavingsGoal,
      NetWorthSnapshot,
      IncomeRecord,
    ]),
    AuthModule,
  ],
  providers: [SyncService],
  controllers: [SyncController],
})
export class SyncModule {}

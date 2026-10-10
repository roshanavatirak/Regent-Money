import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerBehindProxyGuard } from './auth/throttler-behind-proxy.guard';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { SyncModule } from './sync/sync.module';
import { User } from './users/entities/user.entity';
import { BankProfile } from './sync/entities/bank-profile.entity';
import { Transaction } from './sync/entities/transaction.entity';
import { BudgetDeclaration } from './sync/entities/budget-declaration.entity';
import { SavingsGoal } from './sync/entities/savings-goal.entity';
import { GoalHistory } from './sync/entities/goal-history.entity';
import { NetWorthSnapshot } from './sync/entities/net-worth-snapshot.entity';
import { IncomeRecord } from './sync/entities/income-record.entity';
import { UserMerchantTag } from './sync/entities/user-merchant-tag.entity';
import { BudgetTransactionExclusion } from './sync/entities/budget-exclusion.entity';
import { Notification } from './notifications/entities/notification.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { AiModule } from './ai/ai.module';
import { RedisModule } from './redis/redis.module';
import * as dns from 'dns';

// Helper to resolve host to IPv4 address programmatically
const resolveHostToIPv4 = async (host: string): Promise<string> => {
  return new Promise((resolve) => {
    dns.lookup(host, { family: 4 }, (err, address) => {
      if (err || !address) {
        console.warn(`[DNS] Failed to resolve host ${host} to IPv4, falling back to host string:`, err?.message);
        resolve(host);
      } else {
        resolve(address);
      }
    });
  });
};

@Module({
  imports: [
    // Load .env globally and allow system environment variables (Render/Docker)
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvVars: false,
    }),

    // Configure TypeORM with Supabase PostgreSQL (forced IPv4 resolution)
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DATABASE_URL');
        const isSupabase = dbUrl?.includes('supabase');

        let connectionOptions: any = {
          type: 'postgres',
          entities: [
            User,
            BankProfile,
            Transaction,
            BudgetDeclaration,
            SavingsGoal,
            GoalHistory,
            NetWorthSnapshot,
            IncomeRecord,
            UserMerchantTag,
            BudgetTransactionExclusion,
            Notification,
          ],
          synchronize: false, // Set to false to avoid altering tables automatically, schemas exist
          ssl: isSupabase ? { rejectUnauthorized: false } : false,
        };

        if (dbUrl) {
          console.log(`[Database] DATABASE_URL raw value: "${dbUrl}"`);
          connectionOptions.url = dbUrl;
          if (isSupabase) {
            try {
              const parsedUrl = new URL(dbUrl);
              connectionOptions.ssl = {
                rejectUnauthorized: false,
                servername: parsedUrl.hostname,
              };
            } catch {
              connectionOptions.ssl = { rejectUnauthorized: false };
            }
          }
        }

        return connectionOptions;
      },
    }),

    AuthModule,
    SyncModule,
    NotificationsModule,
    AiModule,
    RedisModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 60,
      },
    ]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    },
  ],
})
export class AppModule {}

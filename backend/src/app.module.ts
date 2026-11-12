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
import { NotificationLog } from './notifications/entities/notification-log.entity';
import { UserSignals } from './notifications/entities/user-signals.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { AiModule } from './ai/ai.module';
import { RedisModule } from './redis/redis.module';
import { AdminModule } from './admin/admin.module';
import { AdminAuditLog } from './admin/entities/admin-audit-log.entity';
import { FeedbackModule } from './feedback/feedback.module';
import { Feedback } from './feedback/entities/feedback.entity';
import { UserKey } from './crypto/entities/user-key.entity';
import { CryptoModule } from './crypto/crypto.module';
import { ChatHistoryModule } from './chat-history/chat-history.module';
import { ChatThread } from './chat-history/entities/chat-thread.entity';
import { RefreshToken } from './auth/entities/refresh-token.entity';
import { Broadcast } from './notifications/entities/broadcast.entity';
import { EmailBroadcast } from './mail/entities/email-broadcast.entity';
import { EmailRecipient } from './mail/entities/email-recipient.entity';
import { EmailUnsubscribe } from './mail/entities/email-unsubscribe.entity';
import { MailModule } from './mail/mail.module';
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
        const supabaseCa = configService.get<string>('SUPABASE_CA_CERT')?.replace(/\\n/g, '\n');
        const isSupabase = dbUrl?.includes('supabase') || !!supabaseCa;

        if (isSupabase && !supabaseCa && process.env.NODE_ENV === 'production') {
          throw new Error('FATAL: SUPABASE_CA_CERT is required in production. Refusing to boot.');
        }

        const getSslConfig = (hostname?: string) => {
          if (!isSupabase) return false;
          if (supabaseCa) {
            return {
              ca: supabaseCa,
              rejectUnauthorized: true,
              ...(hostname ? { servername: hostname } : {}),
            };
          }
          console.warn('[Security Notice] SUPABASE_CA_CERT is not provided. Set SUPABASE_CA_CERT in Render to enforce rejectUnauthorized: true.');
          return {
            rejectUnauthorized: false,
            ...(hostname ? { servername: hostname } : {}),
          };
        };

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
            NotificationLog,
            UserSignals,
            AdminAuditLog,
            UserKey,
            Feedback,
            ChatThread,
            RefreshToken,
            Broadcast,
            EmailBroadcast,
            EmailRecipient,
            EmailUnsubscribe,
          ],
          synchronize: false, // Set to false to avoid altering tables automatically, schemas exist
          ssl: getSslConfig(),
          // Connection pool and safety timeouts (passed to the Postgres driver):
          //  - a small fixed pool: the free database allows 60 connections, this server needs few
          //  - a request waits at most 10 s for a free connection instead of forever
          // (Query timeouts are set per connection in SyncService.installDbTimeouts, not here:
          // sent as connection options they can be refused by Supabase's connection pooler.)
          extra: {
            max: Math.max(2, Number(configService.get<string>('DB_POOL_MAX')) || 10),
            connectionTimeoutMillis: 10_000,
            idleTimeoutMillis: 30_000,
          },
        };

        if (dbUrl) {
          connectionOptions.url = dbUrl;
          if (isSupabase) {
            try {
              const parsedUrl = new URL(dbUrl);
              connectionOptions.ssl = getSslConfig(parsedUrl.hostname);
            } catch {
              connectionOptions.ssl = getSslConfig();
            }
          }
        }

        return connectionOptions;
      },
    }),

    AuthModule,
    AdminModule,
    MailModule,
    SyncModule,
    NotificationsModule,
    AiModule,
    RedisModule,
    FeedbackModule,
    CryptoModule,
    ChatHistoryModule,
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

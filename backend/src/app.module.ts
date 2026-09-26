import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
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
import { NetWorthSnapshot } from './sync/entities/net-worth-snapshot.entity';
import { IncomeRecord } from './sync/entities/income-record.entity';
import { Notification } from './notifications/entities/notification.entity';
import { NotificationsModule } from './notifications/notifications.module';
import { AiModule } from './ai/ai.module';
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
            NetWorthSnapshot,
            IncomeRecord,
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

    // Configure Bull Queue with Redis URL or Host/Port
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.get<string>('REDIS_URL');
        if (redisUrl) {
          return {
            url: redisUrl,
            redis: {
              tls: redisUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
              maxRetriesPerRequest: null,
            },
          };
        }
        return {
          redis: {
            host: configService.get<string>('REDIS_HOST') || '127.0.0.1',
            port: configService.get<number>('REDIS_PORT') || 6379,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),

    AuthModule,
    SyncModule,
    NotificationsModule,
    AiModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

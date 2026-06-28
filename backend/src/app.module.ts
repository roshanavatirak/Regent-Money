import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
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
    // Load .env globally
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvVars: true,
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
          try {
            const parsedUrl = new URL(dbUrl);
            const resolvedIp = await resolveHostToIPv4(parsedUrl.hostname);
            console.log(`[Database] Resolved ${parsedUrl.hostname} to IPv4: ${resolvedIp}`);

            connectionOptions = {
              ...connectionOptions,
              host: resolvedIp,
              port: parseInt(parsedUrl.port || '5432', 10),
              username: parsedUrl.username,
              password: decodeURIComponent(parsedUrl.password),
              database: parsedUrl.pathname.substring(1),
            };
          } catch (e: any) {
            console.warn('[Database] Failed to parse DATABASE_URL, falling back to direct URL connection:', e.message);
            connectionOptions.url = dbUrl;
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

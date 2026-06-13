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

@Module({
  imports: [
    // Load .env globally
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Configure TypeORM with Supabase PostgreSQL
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUrl = configService.get<string>('DATABASE_URL');
        const isSupabase = dbUrl?.includes('supabase');
        return {
          type: 'postgres',
          url: dbUrl,
          entities: [
            User,
            BankProfile,
            Transaction,
            BudgetDeclaration,
            SavingsGoal,
            NetWorthSnapshot,
            IncomeRecord,
          ],
          synchronize: false, // Set to false to avoid altering tables automatically, schemas exist
          ssl: isSupabase ? { rejectUnauthorized: false } : false,
        };
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

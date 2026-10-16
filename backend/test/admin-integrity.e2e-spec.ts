import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminModule } from '../src/admin/admin.module';
import { AdminService, CASCADE_DELETE_TABLES } from '../src/admin/admin.service';
import { User } from '../src/users/entities/user.entity';
import { AdminAuditLog } from '../src/admin/entities/admin-audit-log.entity';
import { RedisModule } from '../src/redis/redis.module';

describe('Admin Integrity & Security (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminService: AdminService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            type: 'postgres',
            url: config.get<string>('DATABASE_URL'),
            ssl: { rejectUnauthorized: false },
            entities: [User, AdminAuditLog],
            synchronize: false,
          }),
        }),
        RedisModule,
        AdminModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = app.get(DataSource);
    adminService = app.get(AdminService);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('Schema Integrity & Cascade Delete Coverage', () => {
    it('CASCADE_DELETE_TABLES covers all tables in core, finance, and wealth with a user_id column', async () => {
      const rows = await dataSource.query(`
        SELECT table_schema, table_name 
        FROM information_schema.columns 
        WHERE column_name = 'user_id' 
          AND table_schema IN ('core', 'finance', 'wealth')
          AND table_name NOT IN ('users', 'admin_audit_logs')
      `);

      for (const row of rows) {
        const found = CASCADE_DELETE_TABLES.find(
          (t) => t.schema === row.table_schema && t.table === row.table_name,
        );
        if (!found) {
          console.error('MISSING CASCADE DELETE TABLE:', row);
        }
        expect(found).toBeDefined();
      }
    });

    it('CASCADE_DELETE_TABLES includes core.users for final account purge', () => {
      const usersEntry = CASCADE_DELETE_TABLES.find(
        (t) => t.schema === 'core' && t.table === 'users' && t.column === 'id',
      );
      expect(usersEntry).toBeDefined();
    });
  });

  describe('Server-Side Self Protection & Role Hierarchy', () => {
    it('blocks an administrator from banning their own account', async () => {
      const adminId = '00000000-0000-0000-0000-000000000001';
      await expect(
        adminService.banUser(adminId, 'admin', adminId, 'Self ban test'),
      ).rejects.toThrow('Security Violation: You cannot ban your own account.');
    });

    it('blocks an administrator from deleting their own account', async () => {
      const adminId = '00000000-0000-0000-0000-000000000001';
      await expect(
        adminService.hardDeleteUser(adminId, 'admin', adminId, 'admin@test.com', 'Self delete test'),
      ).rejects.toThrow('Security Violation: You cannot delete your own account.');
    });
  });
});

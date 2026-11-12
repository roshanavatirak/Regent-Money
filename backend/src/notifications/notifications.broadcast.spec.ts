jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined, CronExpression: {} }));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from './notifications.service';
import { Notification } from './entities/notification.entity';
import { NotificationLog } from './entities/notification-log.entity';
import { UserSignals } from './entities/user-signals.entity';
import { Broadcast } from './entities/broadcast.entity';
import { User } from '../users/entities/user.entity';
import { SignalsService } from './signals.service';

describe('NotificationsService - Live Broadcast Engine', () => {
  let service: NotificationsService;
  let broadcastRepo: any;
  let userRepo: any;
  let notificationRepo: any;
  let logRepo: any;
  let dataSource: any;

  beforeEach(async () => {
    broadcastRepo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((item) => Promise.resolve({ id: 'bcast_test1', ...item })),
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          {
            id: 'bcast_101',
            title: 'Global Announcement',
            body: 'Hello everyone!',
            type: 'announcement',
            payload: {},
            createdAt: 1000,
            completedAt: 1005,
          },
        ]),
      })),
    };

    userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user_1',
        createdAt: 500,
        lastReadBroadcastAt: 0,
        pushToken: 'ExponentPushToken[abc12345]',
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      })),
    };

    notificationRepo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      save: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    logRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    dataSource = {
      query: jest.fn().mockImplementation((query: string) => {
        if (query.includes('COUNT(*)::int as total_users')) {
          return Promise.resolve([{ total_users: 1500, push_enabled_users: 1200 }]);
        }
        if (query.includes('UPDATE core.broadcasts SET status = \'processing\'')) {
          return Promise.resolve([
            {
              id: 'bcast_test1',
              title: 'Test Broadcast',
              body: 'Test Body',
              type: 'announcement',
              status: 'processing',
              last_processed_user_id: null,
            },
          ]);
        }
        if (query.includes('SELECT id, push_token FROM core.users')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getRepositoryToken(Notification), useValue: notificationRepo },
        { provide: getRepositoryToken(NotificationLog), useValue: logRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Broadcast), useValue: broadcastRepo },
        {
          provide: SignalsService,
          useValue: {
            runSignalsDispatchJob: jest.fn(),
            evaluateUserSignals: jest.fn(),
            triggerUserDispatch: jest.fn(),
          },
        },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('calculates audience estimate without Redis commands', async () => {
    const estimate = await service.getAudienceEstimate();
    expect(estimate.totalUsers).toBe(1500);
    expect(estimate.pushEnabledUsers).toBe(1200);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('COUNT(*)::int as total_users'),
    );
  });

  it('creates broadcast with idempotency and prevents duplicate sends', async () => {
    const existingBcast = { id: 'bcast_existing', title: 'Already sent' };
    broadcastRepo.findOne.mockResolvedValueOnce(existingBcast);

    const result = await service.createBroadcast({
      title: 'Hello',
      body: 'World',
      idempotencyKey: 'key_123',
    });

    expect(result).toBe(existingBcast);
    expect(broadcastRepo.save).not.toHaveBeenCalled();
  });

  it('creates a single database row for global broadcasts (protects Supabase quota)', async () => {
    broadcastRepo.findOne.mockResolvedValueOnce(null);

    const broadcast = await service.createBroadcast({
      title: 'Breaking Update',
      body: 'Important message for all users',
      type: 'announcement',
      createdBy: 'admin_1',
    });

    expect(broadcastRepo.save).toHaveBeenCalledTimes(1);
    expect(broadcast.title).toBe('Breaking Update');
    expect(broadcast.totalTargeted).toBe(1500);
  });

  it('merges global broadcasts with personal inbox and marks read status correctly', async () => {
    userRepo.findOne.mockResolvedValueOnce({
      id: 'user_1',
      createdAt: 500,
      lastReadBroadcastAt: 0,
    });

    const notifs = await service.getNotifications('user_1');
    expect(notifs.length).toBe(1);
    expect(notifs[0].id).toBe('bcast_101');
    expect(notifs[0].readStatus).toBe(false);
  });

  it('marks broadcast as read by bumping user lastReadBroadcastAt', async () => {
    broadcastRepo.findOne.mockResolvedValueOnce({
      id: 'bcast_101',
      createdAt: 1000,
      type: 'announcement',
      title: 'Test',
      body: 'Test',
      payload: {},
    });

    const res = await service.markAsRead('user_1', 'bcast_101');
    expect(res.id).toBe('bcast_101');
    expect(res.readStatus).toBe(true);
    expect(userRepo.createQueryBuilder).toHaveBeenCalled();
  });

  it('updates both personal notifications and broadcast watermark on markAllAsRead', async () => {
    const res = await service.markAllAsRead('user_1');
    expect(res.success).toBe(true);
    expect(notificationRepo.update).toHaveBeenCalled();
    expect(userRepo.update).toHaveBeenCalledWith(
      { id: 'user_1' },
      expect.objectContaining({ lastReadBroadcastAt: expect.any(Number) }),
    );
  });
});

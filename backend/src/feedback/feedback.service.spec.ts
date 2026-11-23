// @nestjs/schedule ships ESM that this Jest setup can't load; the decorator isn't under test
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_MIDNIGHT: '0 0 * * *' },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { FeedbackService } from './feedback.service';
import { Feedback } from './entities/feedback.entity';
import { NotificationsService } from '../notifications/notifications.service';

describe('FeedbackService', () => {
  let service: FeedbackService;
  let mockFeedbackRepo: any;
  let mockConfigService: any;
  let mockNotifications: any;

  beforeEach(async () => {
    mockFeedbackRepo = {
      query: jest.fn().mockResolvedValue([]),
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'CLOUDINARY_CLOUD_NAME') return 'test-cloud';
        if (key === 'CLOUDINARY_API_KEY') return 'test-key';
        if (key === 'CLOUDINARY_API_SECRET') return 'test-secret';
        return null;
      }),
    };

    mockNotifications = { sendNotification: jest.fn().mockResolvedValue({}) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbackService,
        {
          provide: getRepositoryToken(Feedback),
          useValue: mockFeedbackRepo,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: NotificationsService,
          useValue: mockNotifications,
        },
      ],
    }).compile();

    service = module.get<FeedbackService>(FeedbackService);
  });

  it('creates feedback with 0 photos (photos optional)', async () => {
    const result = await service.createFeedback({
      userId: 'user_123',
      kind: 'bug',
      title: 'Payment did not show up',
      description: 'I paid via UPI and the balance did not update.',
      area: 'Balance',
      priority: 'high',
    });

    expect(result.id).toMatch(/^fb_\d+_/);
    expect(result.mediaUrls).toEqual([]);
    expect(result.mediaPublicIds).toEqual([]);
    expect(result.priority).toBe('high');
    expect(result.status).toBe('open');
    expect(result.mediaPurged).toBe(false);
    expect(mockFeedbackRepo.save).toHaveBeenCalled();
  });

  it('records resolvedAt when transitioning status to fixed or resolved', async () => {
    const existing = {
      id: 'fb_1',
      status: 'open',
      resolvedAt: null,
      updatedAt: 1000,
    };
    mockFeedbackRepo.findOne.mockResolvedValue(existing);

    const updated = await service.updateStatus('fb_1', 'fixed', undefined, 'Resolved in v1.0.64');

    expect(updated.status).toBe('fixed');
    expect(updated.resolvedAt).toBeGreaterThan(0);
    expect(updated.adminNotes).toBe('Resolved in v1.0.64');
  });

  it('resets resolvedAt if a fixed issue is reopened', async () => {
    const existing = {
      id: 'fb_2',
      status: 'fixed',
      resolvedAt: 5000000,
      updatedAt: 1000,
    };
    mockFeedbackRepo.findOne.mockResolvedValue(existing);

    const updated = await service.updateStatus('fb_2', 'open');

    expect(updated.status).toBe('open');
    expect(updated.resolvedAt).toBeNull();
  });

  it('lets the owner edit their report while it is open', async () => {
    mockFeedbackRepo.findOne.mockResolvedValue({
      id: 'fb_3',
      userId: 'user_1',
      status: 'open',
      title: 'Old title',
      description: 'Old description text',
      area: 'Home',
      priority: 'medium',
      updatedAt: 1000,
    });

    const updated = await service.updateOwnFeedback('user_1', 'fb_3', {
      title: '  Budget total stuck  ',
      description: 'Budget still shows zero after adding expenses.',
      area: 'Budgets',
      priority: 'high',
    });

    expect(updated.title).toBe('Budget total stuck');
    expect(updated.area).toBe('Budgets');
    expect(updated.priority).toBe('high');
    expect(updated.status).toBe('open');
    expect(updated.updatedAt).toBeGreaterThan(1000);
  });

  it('refuses edits once the report is no longer open', async () => {
    mockFeedbackRepo.findOne.mockResolvedValue({ id: 'fb_4', userId: 'user_1', status: 'investigating' });

    await expect(service.updateOwnFeedback('user_1', 'fb_4', { title: 'New title' })).rejects.toThrow(
      'already being reviewed',
    );
    expect(mockFeedbackRepo.save).not.toHaveBeenCalled();
  });

  it("refuses edits to someone else's report", async () => {
    mockFeedbackRepo.findOne.mockResolvedValue({ id: 'fb_5', userId: 'user_2', status: 'open' });

    await expect(service.updateOwnFeedback('user_1', 'fb_5', { title: 'New title' })).rejects.toThrow(
      'Report not found',
    );
    expect(mockFeedbackRepo.save).not.toHaveBeenCalled();
  });

  it('purges Cloudinary media for issues resolved >= 30 days ago while preserving DB record', async () => {
    const oldResolvedTicket = {
      id: 'fb_old',
      status: 'fixed',
      resolvedAt: Date.now() - 35 * 24 * 60 * 60 * 1000,
      mediaUrls: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
      mediaPublicIds: ['regent_feedback/sample'],
      mediaPurged: false,
    };

    const qbMock = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([oldResolvedTicket]),
    };
    mockFeedbackRepo.createQueryBuilder.mockReturnValue(qbMock);

    await service.purgeResolvedMediaCron();

    expect(mockFeedbackRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'fb_old',
        mediaUrls: [],
        mediaPublicIds: [],
        mediaPurged: true,
      }),
    );
  });
  it('notifies the sender when an admin replies, with a deep link to their screen', async () => {
    mockFeedbackRepo.findOne.mockResolvedValue({
      id: 'fb_5', userId: 'user_9', kind: 'bug', title: 'Sync stuck', status: 'open', adminNotes: null, resolvedAt: null,
    });

    await service.updateStatus('fb_5', 'investigating', undefined, 'Looking into it', true);

    expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
      'user_9',
      expect.objectContaining({
        title: 'The Regent team replied to your report',
        body: 'Looking into it',
        type: 'feedback_update',
        payload: expect.objectContaining({ feedbackId: 'fb_5', deepLink: 'regent://feedback/bug', status: 'investigating' }),
      }),
    );
  });

  it('tells the sender about a status change when there is no new reply', async () => {
    mockFeedbackRepo.findOne.mockResolvedValue({
      id: 'fb_6', userId: 'user_9', kind: 'feature', title: 'Split bills', status: 'open', adminNotes: 'Thanks!', resolvedAt: null,
    });

    await service.updateStatus('fb_6', 'in_progress', undefined, 'Thanks!', true);

    expect(mockNotifications.sendNotification).toHaveBeenCalledWith(
      'user_9',
      expect.objectContaining({ title: 'Your idea is now in progress' }),
    );
  });

  it('does not notify when notify is off or nothing the user sees changed', async () => {
    mockFeedbackRepo.findOne.mockResolvedValue({
      id: 'fb_7', userId: 'user_9', kind: 'bug', title: 'x', status: 'open', adminNotes: null, priority: 'low',
    });
    await service.updateStatus('fb_7', 'investigating', undefined, undefined, false);

    mockFeedbackRepo.findOne.mockResolvedValue({
      id: 'fb_7', userId: 'user_9', kind: 'bug', title: 'x', status: 'open', adminNotes: null, priority: 'low',
    });
    await service.updateStatus('fb_7', undefined, 'high', undefined, true);

    expect(mockNotifications.sendNotification).not.toHaveBeenCalled();
  });

  it('keeps the update when the notification fails', async () => {
    mockNotifications.sendNotification.mockRejectedValue(new Error('push down'));
    mockFeedbackRepo.findOne.mockResolvedValue({
      id: 'fb_8', userId: 'user_9', kind: 'bug', title: 'x', status: 'open', adminNotes: null,
    });

    const saved = await service.updateStatus('fb_8', 'fixed', undefined, undefined, true);

    expect(saved.status).toBe('fixed');
    expect(mockFeedbackRepo.save).toHaveBeenCalled();
  });

  it('attaches sender name, email and report count to the admin list', async () => {
    const qb: any = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'fb_1', userId: 'u1' }, { id: 'fb_2', userId: null }], 2]),
    };
    mockFeedbackRepo.createQueryBuilder.mockReturnValue(qb);
    mockFeedbackRepo.query.mockResolvedValue([{ id: 'u1', name: 'Priya', email: 'p@example.com', avatar_url: null, report_count: 3 }]);

    const res = await service.getAllFeedback({ kind: 'bug', search: '50%_off', limit: 500 });

    expect(qb.andWhere).toHaveBeenCalledWith('fb.kind = :kind', { kind: 'bug' });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE :like'), { like: '%50\\%\\_off%' });
    expect(qb.take).toHaveBeenCalledWith(100);
    expect(res.total).toBe(2);
    expect(res.items[0].user).toEqual({ id: 'u1', name: 'Priya', email: 'p@example.com', avatarUrl: null, reportCount: 3 });
    expect(res.items[1].user).toBeNull();
  });

  it('maps the stats query into counts', async () => {
    mockFeedbackRepo.query.mockResolvedValue([{
      total: 10, feature: 4, bug: 6, s_open: 3, s_investigating: 1, s_in_progress: 2, s_fixed: 2, s_resolved: 1, s_closed: 1,
      awaiting: 4, oldest_awaiting: '1700000000000', critical_open: 1, fixed_7d: 2,
    }]);

    const stats = await service.getStats();

    expect(stats).toEqual({
      total: 10, feature: 4, bug: 6,
      byStatus: { open: 3, investigating: 1, in_progress: 2, fixed: 2, resolved: 1, closed: 1 },
      awaitingReply: 4, oldestAwaitingAt: 1700000000000, criticalOpen: 1, fixedLast7d: 2,
    });
  });
});

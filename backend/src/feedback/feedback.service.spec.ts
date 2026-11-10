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

describe('FeedbackService', () => {
  let service: FeedbackService;
  let mockFeedbackRepo: any;
  let mockConfigService: any;

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
});

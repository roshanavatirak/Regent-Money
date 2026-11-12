jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined, CronExpression: {} }));

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { EmailBroadcastService } from './email-broadcast.service';
import { EmailAccountsService } from './email-accounts.service';
import { EmailBroadcast } from './entities/email-broadcast.entity';
import { EmailRecipient } from './entities/email-recipient.entity';
import { EmailUnsubscribe } from './entities/email-unsubscribe.entity';
import { User } from '../users/entities/user.entity';

describe('EmailBroadcastService - PostgreSQL Queue Engine', () => {
  let service: EmailBroadcastService;
  let broadcastRepo: any;
  let recipientRepo: any;
  let unsubscribeRepo: any;
  let userRepo: any;
  let dataSource: any;
  let configService: any;

  beforeEach(async () => {
    broadcastRepo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn((item) => Promise.resolve({ id: 'ebcast_test1', ...item })),
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    recipientRepo = {
      create: jest.fn((dto) => ({ ...dto })),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    unsubscribeRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    userRepo = {
      findOne: jest.fn(),
    };

    dataSource = {
      query: jest.fn().mockImplementation((query: string) => {
        if (query.includes("COALESCE(sent_via, 'broadcast')")) {
          return Promise.resolve([{ account: 'broadcast', n: 45 }]);
        }
        if (query.includes('SELECT COUNT(*)::int as verified_count')) {
          return Promise.resolve([{ verified_count: 850 }]);
        }
        if (query.includes('INSERT INTO core.email_recipients')) {
          return Promise.resolve([[], 850]);
        }
        if (query.includes('UPDATE core.email_broadcasts SET status = \'processing\'')) {
          return Promise.resolve([
            {
              id: 'ebcast_test1',
              subject: 'Test Subject',
              bodyMarkdown: 'Hello **World**!',
              category: 'announcement',
              status: 'processing',
            },
          ]);
        }
        if (query.includes('FOR UPDATE SKIP LOCKED')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([]);
      }),
    };

    configService = {
      get: jest.fn((key: string) => {
        if (key === 'AUDIT_HMAC_SECRET') return 'test_secret_hmac_123456';
        if (key === 'BREVO_BROADCAST_API_KEY') return 'test_brevo_key';
        if (key === 'BREVO_BROADCAST_SENDER_EMAIL') return 'updates@regentmoney.com';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailBroadcastService,
        EmailAccountsService,
        { provide: getRepositoryToken(EmailBroadcast), useValue: broadcastRepo },
        { provide: getRepositoryToken(EmailRecipient), useValue: recipientRepo },
        { provide: getRepositoryToken(EmailUnsubscribe), useValue: unsubscribeRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: DataSource, useValue: dataSource },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<EmailBroadcastService>(EmailBroadcastService);
  });

  it('calculates daily quota accurately from local DB (300/day limit)', async () => {
    const quota = await service.getDailyQuotaStats();
    expect(quota.sentToday).toBe(45);
    expect(quota.remainingToday).toBe(255);
    expect(quota.dailyLimit).toBe(300);
  });

  it('calculates audience estimate for verified active users', async () => {
    const audience = await service.getAudienceEstimate();
    expect(audience.totalVerifiedUsers).toBe(850);
    expect(audience.remainingToday).toBe(255);
  });

  it('snapshots audience into core.email_recipients on campaign creation', async () => {
    const broadcast = await service.createBroadcast('admin_123', {
      subject: 'Security Notice',
      bodyMarkdown: '# Important Security Advice\nPlease enable biometrics.',
      category: 'security_tip',
      targetType: 'all_verified',
    });

    expect(broadcastRepo.save).toHaveBeenCalled();
    expect(broadcast.subject).toBe('Security Notice');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO core.email_recipients'),
      expect.any(Array),
    );
  });

  it('generates and cryptographically verifies unsubscribe tokens', () => {
    const email = 'user@example.com';
    const token = service.generateUnsubscribeToken(email);
    expect(token).toBeDefined();

    const verified = service.verifyUnsubscribeToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.emailHmac).toBe(service.getHmac(email));

    // Tampered token check
    const tampered = token.slice(0, -4) + 'abcd';
    expect(service.verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it('records unsubscription by email HMAC in core.email_unsubscribes', async () => {
    const emailHmac = service.getHmac('optout@example.com');
    await service.recordUnsubscribe(emailHmac);

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO core.email_unsubscribes'),
      expect.arrayContaining([emailHmac]),
    );
  });

  it('sweeps expired leases to heal interrupted broadcasts on restart', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 'ebcast_stalled' }]); // expired email
    dataSource.query.mockResolvedValueOnce([]); // paused email
    dataSource.query.mockResolvedValueOnce([]); // expired push

    await service.runStaleBroadcastSweep();

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE status = \'processing\' AND (lease_until IS NULL OR lease_until < NOW())'),
    );
  });
});


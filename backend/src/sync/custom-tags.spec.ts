// Same stubs as sync-version.spec: modules SyncService imports that this Jest setup can't load
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_MIDNIGHT: '0 0 * * *' },
}));
jest.mock('pdf.js-extract', () => ({
  PDFExtract: class {
    extract = jest.fn();
  },
}));
jest.mock('../notifications/notifications.service', () => ({
  NotificationsService: class {
    sendNotification = jest.fn();
    resolveNotification = jest.fn();
  },
}));

import { BadRequestException } from '@nestjs/common';
import { SyncService } from './sync.service';

/** SyncService with only a fake database, enough for the custom-tag methods. */
function serviceWithDb() {
  const rows: { user_id: string; name_normalized: string; name: string; created_at: number }[] = [];
  const dataSource = {
    query: async (sql: string, p: any[]) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      if (s.startsWith('SELECT COUNT(*)')) return [{ count: rows.filter((r) => r.user_id === p[0]).length }];
      if (s.startsWith('SELECT name FROM finance.user_custom_tags')) {
        return rows.filter((r) => r.user_id === p[0]).slice(0, p[1]).map((r) => ({ name: r.name }));
      }
      if (s.startsWith('INSERT INTO finance.user_custom_tags')) {
        if (rows.some((r) => r.user_id === p[0] && r.name_normalized === p[1])) return [];
        rows.push({ user_id: p[0], name_normalized: p[1], name: p[2], created_at: p[3] });
        return [{ name: p[2] }];
      }
      throw new Error(`unexpected query: ${s}`);
    },
  };
  const svc = Object.create(SyncService.prototype) as SyncService;
  (svc as any).dataSource = dataSource;
  return { svc, rows };
}

describe('custom tags', () => {
  it('stores tags per user, ignoring case and keeping the first spelling', async () => {
    const { svc } = serviceWithDb();
    await svc.addCustomTags('u1', 'Haircut');
    const list = await svc.addCustomTags('u1', ['haircut', '  Google   Play Console ']);
    expect(list).toEqual([{ name: 'Haircut' }, { name: 'Google Play Console' }]);
    expect(await svc.getCustomTags('u2')).toEqual([]);
  });

  it('rejects names that are too short or too long', async () => {
    const { svc } = serviceWithDb();
    await expect(svc.addCustomTags('u1', ['x', 'y'.repeat(41)])).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stops at 100 tags per user', async () => {
    const { svc, rows } = serviceWithDb();
    await svc.addCustomTags('u1', Array.from({ length: 100 }, (_, i) => `tag ${i}`));
    await svc.addCustomTags('u1', ['one more']);
    expect(rows.filter((r) => r.user_id === 'u1')).toHaveLength(100);
  });
});

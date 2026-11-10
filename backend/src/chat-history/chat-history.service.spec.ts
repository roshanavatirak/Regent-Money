// @nestjs/schedule ships ESM that this Jest setup can't load; the decorator isn't under test
jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: { EVERY_DAY_AT_MIDNIGHT: '0 0 * * *' },
}));

import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  ChatHistoryService,
  expiresAt,
  titleFromMessages,
  KEEP_MS,
  PINNED_KEEP_MS,
  MAX_PINNED,
} from './chat-history.service';
import { ChatThread } from './entities/chat-thread.entity';
import { FieldCipherService } from '../crypto/field-cipher.service';

const USER = 'user_1';
const ID = 'chat_abcdef12';
const msgs = (n = 2) =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: i === 0 ? 'Can I afford a ₹40k phone this month?' : `Answer ${i}`,
    timestamp: Date.now() - (n - i) * 1000,
  }));

describe('ChatHistoryService', () => {
  let service: ChatHistoryService;
  let rows: Map<string, any>;
  let repo: any;

  beforeEach(async () => {
    rows = new Map();
    repo = {
      query: jest.fn().mockResolvedValue([]),
      create: jest.fn((d) => ({ ...d })),
      save: jest.fn(async (e) => {
        rows.set(e.id, { ...e });
        return { ...e };
      }),
      findOne: jest.fn(async ({ where }) => {
        const r = rows.get(where.id);
        if (!r) return null;
        if (where.userId && r.userId !== where.userId) return null;
        return { ...r };
      }),
      find: jest.fn(async ({ where }) =>
        [...rows.values()].filter((r) => r.userId === where.userId && r.deletedAt == null).map((r) => ({ ...r })),
      ),
      count: jest.fn(async ({ where }) =>
        [...rows.values()].filter((r) => r.userId === where.userId && r.pinned && r.deletedAt == null).length,
      ),
    };
    const cipher = {
      encryptText: jest.fn(async (_u, _t, _c, _id, text: string) => Buffer.from(`enc:${text}`)),
      decryptText: jest.fn(async (_u, _t, _c, _id, env: Buffer) => env.toString().slice(4)),
    };

    const module = await Test.createTestingModule({
      providers: [
        ChatHistoryService,
        { provide: getRepositoryToken(ChatThread), useValue: repo },
        { provide: FieldCipherService, useValue: cipher },
      ],
    }).compile();
    service = module.get(ChatHistoryService);
  });

  it('titles a new chat from the first question without calling the AI', async () => {
    const saved = await service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() });
    expect(saved.title).toBe('Can I afford a ₹40k phone this month?');
    expect(saved.messageCount).toBe(2);
    expect(titleFromMessages([{ role: 'user', content: 'x'.repeat(100), timestamp: 1 }]).length).toBeLessThanOrEqual(60);
  });

  it('stores messages encrypted, not as plain text', async () => {
    await service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() });
    const stored = rows.get(ID);
    expect(Buffer.isBuffer(stored.encMessages)).toBe(true);
    expect(stored).not.toHaveProperty('messages');
  });

  it('round-trips messages through get()', async () => {
    const m = msgs(4);
    await service.save(USER, ID, { messages: m, updatedAt: Date.now() });
    const got = await service.get(USER, ID);
    expect(got.messages.map((x) => x.content)).toEqual(m.map((x) => x.content));
  });

  it('refuses an older copy from another device (last write wins)', async () => {
    await service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() });
    await expect(service.save(USER, ID, { messages: msgs(2), updatedAt: 1000 })).rejects.toThrow('newer version');
  });

  it('keeps a deleted chat deleted when a stale device uploads it again', async () => {
    await service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() });
    await service.remove(USER, ID);
    expect(rows.get(ID).encMessages).toBeNull();
    await expect(service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() + 1000 })).rejects.toThrow('deleted');
    expect(await service.list(USER)).toEqual([]);
  });

  it("doesn't let one user read or change another user's chat", async () => {
    await service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() });
    await expect(service.get('someone_else', ID)).rejects.toThrow('not found');
    await expect(service.save('someone_else', ID, { messages: msgs(), updatedAt: Date.now() + 5000 })).rejects.toThrow(
      'not found',
    );
  });

  it(`allows at most ${MAX_PINNED} pinned chats`, async () => {
    for (let i = 0; i < MAX_PINNED; i++) {
      const id = `chat_pin000${i}`;
      await service.save(USER, id, { messages: msgs(), updatedAt: Date.now() });
      await service.update(USER, id, { pinned: true });
    }
    await service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() });
    await expect(service.update(USER, ID, { pinned: true })).rejects.toThrow('up to 5');
  });

  it('renames a chat', async () => {
    await service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() });
    const r = await service.update(USER, ID, { title: '  Phone budget  ' });
    expect(r.title).toBe('Phone budget');
  });

  it('keeps chats 30 days, pinned chats 90 days', () => {
    const base = 1_000_000;
    expect(expiresAt({ pinned: false, retentionAt: base })).toBe(base + KEEP_MS);
    expect(expiresAt({ pinned: true, retentionAt: base })).toBe(base + PINNED_KEEP_MS);
  });

  it('unpinning starts a fresh 30 days', async () => {
    await service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() });
    rows.get(ID).retentionAt = Date.now() - 60 * 24 * 60 * 60 * 1000; // 60 days old
    rows.get(ID).pinned = true;
    const r = await service.update(USER, ID, { pinned: false });
    expect(r.pinned).toBe(false);
    expect(r.expiresAt).toBeGreaterThan(Date.now() + KEEP_MS - 60_000);
  });

  it('hides expired chats from the list', async () => {
    await service.save(USER, ID, { messages: msgs(), updatedAt: Date.now() });
    rows.get(ID).retentionAt = Date.now() - KEEP_MS - 1000;
    expect(await service.list(USER)).toEqual([]);
  });
});

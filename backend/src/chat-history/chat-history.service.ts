import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ChatThread } from './entities/chat-thread.entity';
import { FieldCipherService } from '../crypto/field-cipher.service';
import { AAD_COLUMN, AAD_TABLE } from '../crypto/field-cipher';

const DAY_MS = 24 * 60 * 60 * 1000;
export const KEEP_MS = 30 * DAY_MS;
export const PINNED_KEEP_MS = 90 * DAY_MS;
export const TOMBSTONE_MS = 90 * DAY_MS;
export const MAX_PINNED = 5;
export const MAX_MESSAGES = 200;
export const MAX_CONTENT_CHARS = 8000;
export const MAX_TITLE_CHARS = 80;

const ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isEdited?: boolean;
}

export interface ChatSummary {
  id: string;
  title: string;
  pinned: boolean;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  expiresAt: number;
}

/** When a chat stops being kept: 30 days after retentionAt, or 90 while pinned. */
export const expiresAt = (t: Pick<ChatThread, 'pinned' | 'retentionAt'>) =>
  t.retentionAt + (t.pinned ? PINNED_KEEP_MS : KEEP_MS);

/** The default title: the first question, shortened. No AI call needed. */
export const titleFromMessages = (messages: StoredMessage[]): string => {
  const first = messages.find((m) => m.role === 'user')?.content?.replace(/\s+/g, ' ').trim() || 'New chat';
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
};

@Injectable()
export class ChatHistoryService implements OnModuleInit {
  private readonly logger = new Logger(ChatHistoryService.name);

  constructor(
    @InjectRepository(ChatThread)
    private readonly repo: Repository<ChatThread>,
    private readonly cipher: FieldCipherService,
  ) {}

  async onModuleInit() {
    try {
      await this.repo.query(`
        CREATE TABLE IF NOT EXISTS core.chat_threads (
          id               TEXT PRIMARY KEY,
          user_id          TEXT NOT NULL,
          enc_title        BYTEA,
          enc_messages     BYTEA,
          message_count    INT NOT NULL DEFAULT 0,
          pinned           BOOLEAN NOT NULL DEFAULT FALSE,
          created_at       BIGINT NOT NULL,
          updated_at       BIGINT NOT NULL,
          last_message_at  BIGINT NOT NULL,
          retention_at     BIGINT NOT NULL,
          deleted_at       BIGINT
        );
        CREATE INDEX IF NOT EXISTS idx_chat_threads_user ON core.chat_threads (user_id, deleted_at);
        CREATE INDEX IF NOT EXISTS idx_chat_threads_retention ON core.chat_threads (pinned, retention_at) WHERE deleted_at IS NULL;
      `);
    } catch (err: any) {
      this.logger.warn(`Could not verify core.chat_threads: ${err?.message || err}`);
    }
  }

  /* ---------------- Encryption helpers ---------------- */

  private async encrypt(userId: string, id: string, column: string, value: string) {
    return this.cipher.encryptText(userId, AAD_TABLE.chatThreads, column, id, value);
  }

  private async decrypt(userId: string, id: string, column: string, env: Buffer | null): Promise<string | null> {
    if (!env) return null;
    return this.cipher.decryptText(userId, AAD_TABLE.chatThreads, column, id, env);
  }

  private async toSummary(t: ChatThread): Promise<ChatSummary> {
    const title = (await this.decrypt(t.userId, t.id, AAD_COLUMN.chatTitle, t.encTitle)) || 'New chat';
    return {
      id: t.id,
      title,
      pinned: t.pinned,
      messageCount: t.messageCount,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      lastMessageAt: t.lastMessageAt,
      expiresAt: expiresAt(t),
    };
  }

  /** A live (not deleted, not expired) chat owned by this user, or null. */
  private async findLive(userId: string, id: string): Promise<ChatThread | null> {
    const t = await this.repo.findOne({ where: { id, userId } });
    if (!t || t.deletedAt != null || expiresAt(t) <= Date.now()) return null;
    return t;
  }

  /* ---------------- Reads ---------------- */

  async list(userId: string): Promise<ChatSummary[]> {
    const rows = await this.repo.find({
      where: { userId, deletedAt: IsNull() },
      order: { lastMessageAt: 'DESC' },
      take: 200,
    });
    const now = Date.now();
    const live = rows.filter((t) => expiresAt(t) > now);
    return Promise.all(live.map((t) => this.toSummary(t)));
  }

  async get(userId: string, id: string): Promise<ChatSummary & { messages: StoredMessage[] }> {
    const t = await this.findLive(userId, id);
    if (!t) throw new NotFoundException('Chat not found.');
    const raw = await this.decrypt(userId, id, AAD_COLUMN.chatMessages, t.encMessages);
    const messages: StoredMessage[] = raw ? JSON.parse(raw) : [];
    return { ...(await this.toSummary(t)), messages };
  }

  /* ---------------- Writes ---------------- */

  /** Validates and normalises messages sent by the app. */
  static cleanMessages(input: unknown): StoredMessage[] {
    if (!Array.isArray(input)) throw new BadRequestException('messages must be a list.');
    return input
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-MAX_MESSAGES)
      .map((m: any) => ({
        role: m.role,
        content: m.content.slice(0, MAX_CONTENT_CHARS),
        timestamp: Number(m.timestamp) || Date.now(),
        ...(m.isEdited ? { isEdited: true } : {}),
      }));
  }

  /**
   * Saves a chat's messages (create or replace). Last write wins: an older copy from
   * another device is refused with 409 so the app can reload the newer one.
   */
  async save(
    userId: string,
    id: string,
    body: { title?: string; messages: unknown; updatedAt?: number },
  ): Promise<ChatSummary> {
    if (!ID_PATTERN.test(id)) throw new BadRequestException('Invalid chat id.');
    const messages = ChatHistoryService.cleanMessages(body.messages);
    if (messages.length === 0) throw new BadRequestException('A chat needs at least one message.');

    const now = Date.now();
    const clientUpdatedAt = Math.min(Number(body.updatedAt) || now, now + 60_000);
    const lastMessageAt = Math.max(...messages.map((m) => m.timestamp));

    const existing = await this.repo.findOne({ where: { id } });
    if (existing && existing.userId !== userId) throw new NotFoundException('Chat not found.');
    if (existing && (existing.deletedAt != null || expiresAt(existing) <= now)) {
      throw new GoneException('This chat was deleted.');
    }
    if (existing && existing.updatedAt > clientUpdatedAt) {
      throw new ConflictException('A newer version of this chat exists.');
    }

    const title =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, MAX_TITLE_CHARS)
        : existing
          ? null // keep the stored title
          : titleFromMessages(messages);

    const row = existing ?? this.repo.create({ id, userId, createdAt: now, pinned: false, deletedAt: null, retentionAt: now });
    row.encMessages = await this.encrypt(userId, id, AAD_COLUMN.chatMessages, JSON.stringify(messages));
    if (title) row.encTitle = await this.encrypt(userId, id, AAD_COLUMN.chatTitle, title);
    row.messageCount = messages.length;
    row.lastMessageAt = lastMessageAt;
    row.retentionAt = Math.max(row.retentionAt || 0, Math.min(lastMessageAt, now));
    row.updatedAt = Math.max(clientUpdatedAt, (existing?.updatedAt ?? 0) + 1);

    return this.toSummary(await this.repo.save(row));
  }

  /** Rename and/or pin. Pinning is limited to MAX_PINNED chats. */
  async update(userId: string, id: string, changes: { title?: string; pinned?: boolean }): Promise<ChatSummary> {
    const t = await this.findLive(userId, id);
    if (!t) throw new NotFoundException('Chat not found.');
    const now = Date.now();

    if (changes.title !== undefined) {
      const title = String(changes.title).replace(/\s+/g, ' ').trim();
      if (!title) throw new BadRequestException('Give the chat a name.');
      t.encTitle = await this.encrypt(userId, id, AAD_COLUMN.chatTitle, title.slice(0, MAX_TITLE_CHARS));
    }

    if (changes.pinned !== undefined && changes.pinned !== t.pinned) {
      if (changes.pinned) {
        const pinnedCount = await this.repo.count({ where: { userId, pinned: true, deletedAt: IsNull() } });
        if (pinnedCount >= MAX_PINNED) {
          throw new BadRequestException(`You can pin up to ${MAX_PINNED} chats. Unpin one first.`);
        }
        t.pinned = true;
      } else {
        // Unpinning starts a fresh 30 days, so an old pinned chat isn't removed that night.
        t.pinned = false;
        t.retentionAt = now;
      }
    }

    t.updatedAt = Math.max(now, t.updatedAt + 1);
    return this.toSummary(await this.repo.save(t));
  }

  /** Deletes a chat everywhere: content is wiped now, a tombstone stops other devices re-uploading it. */
  async remove(userId: string, id: string): Promise<void> {
    if (!ID_PATTERN.test(id)) throw new BadRequestException('Invalid chat id.');
    const now = Date.now();
    const t = await this.repo.findOne({ where: { id } });
    if (t && t.userId !== userId) throw new NotFoundException('Chat not found.');
    if (t?.deletedAt != null) return;

    const row =
      t ??
      this.repo.create({ id, userId, createdAt: now, lastMessageAt: now, retentionAt: now, messageCount: 0, pinned: false });
    row.encTitle = null;
    row.encMessages = null;
    row.messageCount = 0;
    row.pinned = false;
    row.deletedAt = now;
    row.updatedAt = now;
    await this.repo.save(row);
  }

  /* ---------------- Daily cleanup ---------------- */

  /**
   * Runs every night: expires chats past 30 days (90 if pinned) by wiping their content,
   * then permanently removes tombstones older than 90 days.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpired(now = Date.now()): Promise<{ expired: number; purged: number }> {
    try {
      const expireResult = await this.repo
        .createQueryBuilder()
        .update(ChatThread)
        .set({ encTitle: null, encMessages: null, messageCount: 0, pinned: false, deletedAt: now, updatedAt: now })
        .where('deleted_at IS NULL')
        .andWhere(
          '((pinned = false AND retention_at < :keepCutoff) OR (pinned = true AND retention_at < :pinnedCutoff))',
          { keepCutoff: now - KEEP_MS, pinnedCutoff: now - PINNED_KEEP_MS },
        )
        .execute();

      const purgeResult = await this.repo
        .createQueryBuilder()
        .delete()
        .from(ChatThread)
        .where('deleted_at IS NOT NULL AND deleted_at < :cutoff', { cutoff: now - TOMBSTONE_MS })
        .execute();

      const expired = expireResult.affected ?? 0;
      const purged = purgeResult.affected ?? 0;
      if (expired || purged) this.logger.log(`[ChatHistoryCleanup] expired ${expired}, purged ${purged}`);
      return { expired, purged };
    } catch (err: any) {
      this.logger.error('[ChatHistoryCleanup] failed', err);
      return { expired: 0, purged: 0 };
    }
  }
}

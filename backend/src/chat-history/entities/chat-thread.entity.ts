import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

const bigintNumber = {
  to: (value: number | null) => (value == null ? null : String(value)),
  from: (value: string | null) => (value == null ? null : Number(value)),
};

/**
 * One saved Regent chat. Title and messages are stored encrypted with the user's key.
 *
 * Retention: a chat is removed 30 days after `retentionAt` (90 days while pinned).
 * `retentionAt` moves forward when a message is added or the chat is unpinned.
 * Deleting or expiring a chat wipes its content and leaves a tombstone (`deletedAt`),
 * so another device can't upload it again; tombstones are purged after 90 days.
 */
@Entity({ name: 'chat_threads', schema: 'core' })
@Index('idx_chat_threads_user', ['userId', 'deletedAt'])
export class ChatThread {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column({ name: 'enc_title', type: 'bytea', nullable: true })
  encTitle: Buffer | null;

  @Column({ name: 'enc_messages', type: 'bytea', nullable: true })
  encMessages: Buffer | null;

  @Column({ name: 'message_count', type: 'int', default: 0 })
  messageCount: number;

  @Column({ type: 'boolean', default: false })
  pinned: boolean;

  @Column({ name: 'created_at', type: 'bigint', transformer: bigintNumber })
  createdAt: number;

  /** Last change to title, messages or pin. Used for last-write-wins between devices. */
  @Column({ name: 'updated_at', type: 'bigint', transformer: bigintNumber })
  updatedAt: number;

  /** Last message time; the chat list is sorted by this. */
  @Column({ name: 'last_message_at', type: 'bigint', transformer: bigintNumber })
  lastMessageAt: number;

  /** Start of the 30/90-day retention window. */
  @Column({ name: 'retention_at', type: 'bigint', transformer: bigintNumber })
  retentionAt: number;

  @Column({ name: 'deleted_at', type: 'bigint', nullable: true, transformer: bigintNumber })
  deletedAt: number | null;
}

import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'email_recipients', schema: 'core' })
export class EmailRecipient {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'broadcast_id', type: 'text' })
  broadcastId: string;

  @Column({ name: 'user_id', type: 'text', nullable: true })
  userId?: string | null;

  @Column({ name: 'custom_email', type: 'text', nullable: true })
  customEmail?: string | null;

  @Column({ type: 'text', default: 'pending' })
  status: string; // 'pending' | 'sending' | 'sent' | 'failed' | 'skipped'

  @Column({ name: 'message_id', type: 'text', nullable: true })
  messageId?: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({
    name: 'sent_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number) => (value ? String(value) : null),
      from: (value: string) => (value ? Number(value) : null),
    },
  })
  sentAt?: number | null;

  @Column({
    name: 'created_at',
    type: 'bigint',
    transformer: {
      to: (value: number) => (value ? String(value) : null),
      from: (value: string) => (value ? Number(value) : null),
    },
  })
  createdAt: number;
}


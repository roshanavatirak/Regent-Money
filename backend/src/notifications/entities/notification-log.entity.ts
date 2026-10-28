import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity({ name: 'notification_log', schema: 'core' })
export class NotificationLog {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column({ name: 'signal_type', type: 'text' })
  signalType: string;

  @Column({ name: 'numbers_used', type: 'jsonb', nullable: true })
  numbersUsed: Record<string, any> | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text', default: 'straight' })
  tone: string; // 'playful' | 'nudging' | 'straight'

  @Column({ name: 'deep_link', type: 'text', nullable: true })
  deepLink: string | null;

  @Column({
    name: 'sent_at',
    type: 'bigint',
    transformer: {
      to: (value: number) => (value ? String(value) : null),
      from: (value: string) => (value ? Number(value) : null),
    },
  })
  sentAt: number;

  @Column({
    name: 'opened_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number) => (value ? String(value) : null),
      from: (value: string) => (value ? Number(value) : null),
    },
  })
  openedAt?: number | null;

  @Column({ name: 'is_opened', type: 'boolean', default: false })
  isOpened?: boolean;
}

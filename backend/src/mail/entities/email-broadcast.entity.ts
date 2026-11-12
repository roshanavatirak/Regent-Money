import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'email_broadcasts', schema: 'core' })
export class EmailBroadcast {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'idempotency_key', type: 'text', unique: true, nullable: true })
  idempotencyKey?: string | null;

  @Column({ type: 'text' })
  subject: string;

  @Column({ name: 'body_markdown', type: 'text' })
  bodyMarkdown: string;

  @Column({ type: 'text', default: 'announcement' })
  category: string; // 'announcement' | 'policy_update' | 'security_tip' | 'service_notice'

  /** Small label above the title. null = the category's default, '' = none. */
  @Column({ type: 'text', nullable: true })
  label?: string | null;

  @Column({ name: 'target_type', type: 'text', default: 'all_verified' })
  targetType: string; // 'all_verified' | 'specific_user' | 'custom_list'

  @Column({ name: 'target_user_id', type: 'text', nullable: true })
  targetUserId?: string | null;

  @Column({ type: 'text', default: 'pending' })
  status: string; // 'pending' | 'processing' | 'paused' | 'completed' | 'failed' | 'cancelled'

  @Column({ name: 'total_recipients', type: 'int', default: 0 })
  totalRecipients: number;

  @Column({ name: 'sent_count', type: 'int', default: 0 })
  sentCount: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount: number;

  @Column({ name: 'skipped_count', type: 'int', default: 0 })
  skippedCount: number;

  @Column({ name: 'daily_quota_exhausted', type: 'boolean', default: false })
  dailyQuotaExhausted: boolean;

  @Column({ name: 'lease_until', type: 'timestamptz', nullable: true })
  leaseUntil?: Date | null;

  @Column({
    name: 'created_at',
    type: 'bigint',
    transformer: {
      to: (value: number) => (value ? String(value) : null),
      from: (value: string) => (value ? Number(value) : null),
    },
  })
  createdAt: number;

  @Column({
    name: 'completed_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number) => (value ? String(value) : null),
      from: (value: string) => (value ? Number(value) : null),
    },
  })
  completedAt?: number | null;

  @Column({ name: 'created_by', type: 'text' })
  createdBy: string;
}


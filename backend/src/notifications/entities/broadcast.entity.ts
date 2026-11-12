import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'broadcasts', schema: 'core' })
export class Broadcast {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'idempotency_key', type: 'text', unique: true, nullable: true })
  idempotencyKey?: string | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text', default: 'announcement' })
  type: string;

  @Column({ type: 'jsonb', nullable: true, default: () => "'{}'" })
  payload?: any;

  @Column({ name: 'target_filter', type: 'text', default: 'all' })
  targetFilter: string;

  @Column({ type: 'text', default: 'pending' })
  status: string; // 'pending' | 'processing' | 'completed' | 'failed'

  @Column({ name: 'total_targeted', type: 'int', default: 0 })
  totalTargeted: number;

  @Column({ name: 'push_queued', type: 'int', default: 0 })
  pushQueued: number;

  @Column({ name: 'push_delivered', type: 'int', default: 0 })
  pushDelivered: number;

  @Column({ name: 'push_failed', type: 'int', default: 0 })
  pushFailed: number;

  @Column({ name: 'last_processed_user_id', type: 'text', nullable: true })
  lastProcessedUserId?: string | null;

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

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdBy?: string | null;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted?: boolean;
}


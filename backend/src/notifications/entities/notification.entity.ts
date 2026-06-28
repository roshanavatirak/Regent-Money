import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'notifications', schema: 'core' })
export class Notification {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'agent_id', type: 'text', nullable: true })
  agentId?: string | null;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text' })
  type: string; // 'anomaly', 'budget_alert', 'recommendation', 'info'

  @Column({ name: 'read_status', type: 'boolean', default: false })
  readStatus?: boolean;

  @Column({ type: 'jsonb', nullable: true })
  payload?: any | null;

  @Column({ name: 'created_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  createdAt?: number | null;

  @Column({ name: 'updated_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  updatedAt?: number | null;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted?: boolean;
}

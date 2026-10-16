import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'admin_audit_logs', schema: 'core' })
export class AdminAuditLog {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({ name: 'admin_id', type: 'text' })
  adminId: string;

  @Column({ name: 'target_user_id', type: 'text' })
  targetUserId: string;

  @Column({ name: 'target_email_hmac', type: 'text', nullable: true })
  targetEmailHmac?: string | null;

  @Column({ type: 'text' })
  action: string;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'jsonb', nullable: true, default: '{}' })
  metadata?: any;

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

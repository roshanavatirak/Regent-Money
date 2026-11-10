import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

export type FeedbackKind = 'feature' | 'bug';
export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical';
export type FeedbackStatus = 'open' | 'investigating' | 'in_progress' | 'fixed' | 'resolved' | 'closed';

@Entity({ name: 'feedback', schema: 'core' })
export class Feedback {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Index('idx_feedback_user_id')
  @Column({ name: 'user_id', type: 'text', nullable: true })
  userId: string | null;

  @Column({ type: 'text' })
  kind: FeedbackKind;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'text', nullable: true })
  area: string | null;

  @Column({ type: 'text', nullable: true })
  impact: string | null;

  @Column({ type: 'text', default: 'medium' })
  priority: FeedbackPriority;

  @Index('idx_feedback_status')
  @Column({ type: 'text', default: 'open' })
  status: FeedbackStatus;

  @Column({ name: 'media_urls', type: 'jsonb', default: () => "'[]'" })
  mediaUrls: string[];

  @Column({ name: 'media_public_ids', type: 'jsonb', default: () => "'[]'" })
  mediaPublicIds: string[];

  @Column({
    name: 'resolved_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number | null) => (value ? String(value) : null),
      from: (value: string | null) => (value ? Number(value) : null),
    },
  })
  resolvedAt: number | null;

  @Column({ name: 'media_purged', type: 'boolean', default: false })
  mediaPurged: boolean;

  @Column({
    name: 'media_purged_at',
    type: 'bigint',
    nullable: true,
    transformer: {
      to: (value: number | null) => (value ? String(value) : null),
      from: (value: string | null) => (value ? Number(value) : null),
    },
  })
  mediaPurgedAt: number | null;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes: string | null;

  @Column({ name: 'app_version', type: 'text', nullable: true })
  appVersion: string | null;

  @Column({ type: 'text', nullable: true })
  platform: string | null;

  @Column({ name: 'os_version', type: 'text', nullable: true })
  osVersion: string | null;

  @Column({ type: 'text', nullable: true })
  theme: string | null;

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
    name: 'updated_at',
    type: 'bigint',
    transformer: {
      to: (value: number) => (value ? String(value) : null),
      from: (value: string) => (value ? Number(value) : null),
    },
  })
  updatedAt: number;
}


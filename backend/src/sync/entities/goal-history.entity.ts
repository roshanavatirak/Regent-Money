import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'goal_history', schema: 'wealth' })
export class GoalHistory {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'goal_id', type: 'text' })
  goalId: string;

  @Column({ type: 'text' })
  type: string; // 'opening' | 'save' | 'withdraw'

  @Column({
    type: 'numeric',
    transformer: {
      to: (value: number) => value,
      from: (value: string) => (value ? parseFloat(value) : 0),
    },
  })
  amount: number;

  @Column({ type: 'text', nullable: true })
  note: string;

  @Column({ type: 'text' })
  at: string; // YYYY-MM-DD or ISO string

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

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;
}

import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

@Entity({ name: 'user_signals', schema: 'core' })
export class UserSignals {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column({ type: 'jsonb' })
  signals: any[];

  @Column({
    name: 'computed_at',
    type: 'bigint',
    transformer: {
      to: (value: number) => (value ? String(value) : null),
      from: (value: string) => (value ? Number(value) : null),
    },
  })
  computedAt: number;
}

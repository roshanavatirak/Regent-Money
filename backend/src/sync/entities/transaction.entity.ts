import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'transactions', schema: 'finance' })
export class Transaction {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'numeric', nullable: true, transformer: {
    to: (value: number) => value,
    from: (value: string) => value ? parseFloat(value) : null
  }})
  amount: number;

  @Column({ type: 'text', nullable: true })
  category: string;

  @Column({ type: 'text', nullable: true })
  merchant: string;

  @Column({ type: 'bigint', nullable: true, transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  timestamp: number;

  @Column({ name: 'bank_profile_id', type: 'text', nullable: true })
  bankProfileId: string;

  @Column({ name: 'sms_id', type: 'text', nullable: true })
  smsId: string;

  @Column({ name: 'is_anomaly', type: 'boolean', nullable: true })
  isAnomaly: boolean;

  @Column({ name: 'regret_score_id', type: 'text', nullable: true })
  regretScoreId: string;

  @Column({ type: 'text', nullable: true })
  status: string;

  @Column({ name: 'updated_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  updatedAt: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;
}

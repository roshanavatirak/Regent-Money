import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'income_records', schema: 'finance' })
export class IncomeRecord {
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
  source: string;

  @Column({ type: 'bigint', nullable: true, transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  timestamp: number;

  @Column({ name: 'bank_profile_id', type: 'text', nullable: true })
  bankProfileId: string;

  @Column({ name: 'updated_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  updatedAt: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;
}

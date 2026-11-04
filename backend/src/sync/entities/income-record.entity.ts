import { Entity, Column, PrimaryColumn } from 'typeorm';

if (typeof BigInt !== 'undefined' && !(BigInt.prototype as any).toJSON) {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

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

  @Column({ type: 'text', nullable: true })
  category: string;

  @Column({ type: 'bigint', nullable: true, transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  timestamp: number;

  @Column({ name: 'bank_profile_id', type: 'text', nullable: true })
  bankProfileId: string | null;

  @Column({ name: 'updated_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  updatedAt: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;

  @Column({ name: 'enc_amount', type: 'bytea', nullable: true })
  encAmount?: Buffer | null;

  @Column({ name: 'enc_source', type: 'bytea', nullable: true })
  encSource?: Buffer | null;

  @Column({ name: 'enc_note', type: 'bytea', nullable: true })
  encNote?: Buffer | null;

  @Column({ name: 'source_idx', type: 'bytea', nullable: true })
  sourceIdx?: Buffer | null;

  @Column({ name: 'row_version', type: 'bigint', default: 1, transformer: {
    to: (value: bigint | number) => value != null ? String(value) : '1',
    from: (value: string | number) => value != null ? BigInt(value) : 1n
  }})
  rowVersion: bigint;
}

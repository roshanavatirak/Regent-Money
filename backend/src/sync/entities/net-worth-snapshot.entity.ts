import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'net_worth_snapshots', schema: 'wealth' })
export class NetWorthSnapshot {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'bigint', nullable: true, transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  timestamp: number;

  @Column({ name: 'total_assets', type: 'numeric', nullable: true, transformer: {
    to: (value: number) => value,
    from: (value: string) => value ? parseFloat(value) : null
  }})
  totalAssets: number;

  @Column({ name: 'total_liabilities', type: 'numeric', nullable: true, transformer: {
    to: (value: number) => value,
    from: (value: string) => value ? parseFloat(value) : null
  }})
  totalLiabilities: number;

  @Column({ name: 'net_worth', type: 'numeric', nullable: true, transformer: {
    to: (value: number) => value,
    from: (value: string) => value ? parseFloat(value) : null
  }})
  netWorth: number;

  @Column({ name: 'updated_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  updatedAt: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;
}

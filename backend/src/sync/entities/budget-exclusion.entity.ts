import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'budget_transaction_exclusions', schema: 'finance' })
export class BudgetTransactionExclusion {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'transaction_id', type: 'text' })
  transactionId: string;

  @Column({ name: 'budget_id', type: 'text', nullable: true })
  budgetId?: string | null;

  @Column({ name: 'created_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  createdAt: number;

  @Column({ name: 'updated_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  updatedAt: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;
}

import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'budget_declarations', schema: 'finance' })
export class BudgetDeclaration {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'text', nullable: true })
  category: string;

  @Column({ name: 'limit_amount', type: 'numeric', nullable: true, transformer: {
    to: (value: number) => value,
    from: (value: string) => value ? parseFloat(value) : null
  }})
  limitAmount: number;

  @Column({ type: 'text', nullable: true })
  period: string;

  @Column({ name: 'spent_amount', type: 'numeric', nullable: true, transformer: {
    to: (value: number) => value,
    from: (value: string) => value ? parseFloat(value) : null
  }})
  spentAmount: number;

  @Column({ name: 'updated_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  updatedAt: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;
}

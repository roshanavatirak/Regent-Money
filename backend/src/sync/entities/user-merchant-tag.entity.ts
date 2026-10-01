import { Entity, Column, PrimaryColumn, Unique } from 'typeorm';

@Entity({ name: 'user_merchant_tags', schema: 'finance' })
@Unique(['userId', 'merchantNormalized'])
export class UserMerchantTag {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'merchant_normalized', type: 'text' })
  merchantNormalized: string;

  @Column({ type: 'text' })
  tag: string;

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
}

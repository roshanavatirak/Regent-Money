import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'email_unsubscribes', schema: 'core' })
export class EmailUnsubscribe {
  @PrimaryColumn({ name: 'email_hmac', type: 'text' })
  emailHmac: string;

  @Column({
    name: 'unsubscribed_at',
    type: 'bigint',
    transformer: {
      to: (value: number) => (value ? String(value) : null),
      from: (value: string) => (value ? Number(value) : null),
    },
  })
  unsubscribedAt: number;

  @Column({ type: 'text', default: 'all' })
  category: string; // 'all' | 'announcements'
}


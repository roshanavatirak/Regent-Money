import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'users', schema: 'core' })
export class User {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null;

  @Column({ type: 'text', nullable: true })
  email?: string | null;

  @Column({ type: 'text', nullable: true })
  phone?: string | null;

  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash?: string | null;

  @Column({ type: 'text', nullable: true })
  name?: string | null;

  @Column({ name: 'auth_provider', type: 'text', nullable: true })
  authProvider?: string | null;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl?: string | null;

  @Column({ name: 'created_at', type: 'bigint', nullable: true, transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  createdAt?: number | null;

  @Column({ name: 'updated_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  updatedAt?: number | null;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted?: boolean;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified?: boolean;

  @Column({ name: 'verification_token', type: 'text', nullable: true })
  verificationToken?: string | null;

  @Column({ name: 'push_token', type: 'text', nullable: true })
  pushToken?: string | null;
}

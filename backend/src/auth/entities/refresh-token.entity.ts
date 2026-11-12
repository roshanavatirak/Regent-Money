import { Entity, Column, PrimaryColumn, Index } from 'typeorm';

const bigintNumber = {
  to: (value: number | null) => (value == null ? null : String(value)),
  from: (value: string | null) => (value == null ? null : Number(value)),
};

/**
 * One refresh token. Only its SHA-256 hash is stored; the raw token lives on the phone.
 * All tokens issued to one device after one login share a `familyId`. Each refresh replaces
 * the token (`replacedBy`); reusing a replaced token after the grace period cancels the family.
 */
@Entity({ name: 'refresh_tokens', schema: 'core' })
@Index('idx_refresh_tokens_user', ['userId', 'revokedAt'])
@Index('idx_refresh_tokens_family', ['familyId'])
export class RefreshToken {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'text' })
  userId: string;

  @Column({ name: 'family_id', type: 'text' })
  familyId: string;

  @Index('idx_refresh_tokens_hash', { unique: true })
  @Column({ name: 'token_hash', type: 'text' })
  tokenHash: string;

  @Column({ name: 'device_name', type: 'text', nullable: true })
  deviceName: string | null;

  /** "Stay logged in": 30-day sliding sessions when true, 1 day when false. */
  @Column({ type: 'boolean', default: true })
  remember: boolean;

  @Column({ name: 'created_at', type: 'bigint', transformer: bigintNumber })
  createdAt: number;

  @Column({ name: 'last_used_at', type: 'bigint', nullable: true, transformer: bigintNumber })
  lastUsedAt: number | null;

  @Column({ name: 'expires_at', type: 'bigint', transformer: bigintNumber })
  expiresAt: number;

  @Column({ name: 'revoked_at', type: 'bigint', nullable: true, transformer: bigintNumber })
  revokedAt: number | null;

  @Column({ name: 'replaced_by', type: 'text', nullable: true })
  replacedBy: string | null;

  @Column({ name: 'replaced_at', type: 'bigint', nullable: true, transformer: bigintNumber })
  replacedAt: number | null;
}

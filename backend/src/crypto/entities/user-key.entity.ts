import { Entity, Column, PrimaryColumn } from 'typeorm';

export type KeyStatus = 'active' | 'decrypt_only' | 'destroyed';

@Entity({ name: 'user_keys', schema: 'core' })
export class UserKey {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'key_version', type: 'integer' })
  keyVersion: number;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status: KeyStatus;

  @Column({ type: 'bytea' })
  edek: Buffer;

  @Column({ name: 'kms_key_arn', type: 'text' })
  kmsKeyArn: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ name: 'rotated_at', type: 'timestamptz', nullable: true })
  rotatedAt?: Date | null;
}


import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity({ name: 'bank_profiles', schema: 'core' })
export class BankProfile {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'bank_name', type: 'text', nullable: true })
  bankName: string;

  @Column({ name: 'account_type', type: 'text', nullable: true, default: 'Savings' })
  accountType: string;

  @Column({ name: 'account_number_suffix', type: 'text', nullable: true })
  accountNumberSuffix: string;

  @Column({ name: 'current_balance', type: 'numeric', nullable: true, transformer: {
    to: (value: number) => value,
    from: (value: string) => value ? parseFloat(value) : null
  }})
  currentBalance: number;

  @Column({ name: 'last_sync_timestamp', type: 'bigint', nullable: true, transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  lastSyncTimestamp: number;

  @Column({ name: 'sms_sender_id', type: 'text', nullable: true })
  smsSenderId: string | null;

  @Column({ name: 'upi_id', type: 'text', nullable: true })
  upiId: string | null;

  @Column({ name: 'custom_keywords', type: 'text', nullable: true })
  customKeywords: string | null;

  @Column({ name: 'statement_password', type: 'text', nullable: true })
  statementPassword: string | null;

  /** Last 4 digits of debit cards on this account, comma-separated ("1479,0032"). */
  @Column({ name: 'debit_card_suffixes', type: 'text', nullable: true })
  debitCardSuffixes: string | null;

  @Column({ name: 'sms_consent', type: 'boolean', default: true })
  smsConsent: boolean;

  /**
   * Cash wallet only: ATM withdrawals from this moment on are added to the wallet
   * (see cash-wallet-topups.ts). Set by the server, never by the phone.
   */
  @Column({ name: 'cash_tracking_since', type: 'bigint', nullable: true, transformer: {
    to: (value: number | null) => value ? String(value) : null,
    from: (value: string | null) => value ? Number(value) : null
  }})
  cashTrackingSince?: number | null;

  @Column({ name: 'updated_at', type: 'bigint', transformer: {
    to: (value: number) => value ? String(value) : null,
    from: (value: string) => value ? Number(value) : null
  }})
  updatedAt: number;

  @Column({ name: 'is_deleted', type: 'boolean', default: false })
  isDeleted: boolean;
}

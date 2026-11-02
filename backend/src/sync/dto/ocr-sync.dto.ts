import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  IsBoolean,
  IsIn,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class OcrSyncTransactionDto {
  @IsNumber()
  amount: number;

  @IsIn(['debit', 'credit'])
  type: 'debit' | 'credit';

  @IsString()
  date: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  time?: string | null; // HH:mm or HH:mm:ss

  @IsString()
  merchant: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  balanceAfter?: number | null;

  @IsOptional()
  @IsNumber()
  timestamp?: number;

  @IsOptional()
  @IsString()
  referenceId?: string;

  @IsOptional()
  @IsString()
  smsId?: string;

  /** Balance stated in the SMS. Sent by the inbox scan; the batch-level updatedBalance is what's applied. */
  @IsOptional()
  @IsNumber()
  availableBalance?: number;

  /** Hash of the SMS text alone, stable across parser changes; used to recognise a re-scanned SMS. */
  @IsOptional()
  @Matches(/^sms_\d{1,12}$/)
  contentId?: string;
}

export class OcrSyncDto {
  @IsOptional()
  @IsString()
  bankProfileId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OcrSyncTransactionDto)
  transactions: OcrSyncTransactionDto[];

  @IsOptional()
  @IsNumber()
  updatedBalance?: number | null;

  @IsOptional()
  @IsBoolean()
  applyBalanceChange?: boolean;
}

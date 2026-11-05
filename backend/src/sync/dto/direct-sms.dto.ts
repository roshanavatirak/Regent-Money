import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsIn,
  IsPositive,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Transaction fields extracted from a bank SMS on the phone. */
export class ParsedSmsDto {
  @IsNumber()
  @IsPositive()
  amount: number;

  @IsIn(['debit', 'credit'])
  type: 'debit' | 'credit';

  @IsString()
  @MaxLength(120)
  merchant: string;

  @IsString()
  @MaxLength(8)
  accountSuffix: string;

  @IsString()
  @MaxLength(60)
  bankName: string;

  @IsBoolean()
  isSalary: boolean;

  @IsOptional()
  @IsNumber()
  availableBalance?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  referenceId?: string;

  /** The suffix is a debit card, not an account number. */
  @IsOptional()
  @IsBoolean()
  isDebitCard?: boolean;
}

export class DirectSmsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  sender: string;

  @IsOptional()
  @IsNumber()
  timestamp?: number;

  /** Current app versions: parsed on the phone, no message text is sent. */
  @IsOptional()
  @ValidateNested()
  @Type(() => ParsedSmsDto)
  parsed?: ParsedSmsDto;

  @IsOptional()
  @IsString()
  @Matches(/^(?:ref|sms)_[A-Za-z0-9]{1,40}$/)
  smsId?: string;

  /** Hash of the SMS text alone, stable across parser changes. */
  @IsOptional()
  @Matches(/^sms_\d{1,12}$/)
  contentId?: string;

  /** Legacy app versions (1.0.53 and earlier) still send the raw text; parsed server-side and discarded. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;
}

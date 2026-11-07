import { IsString, IsNotEmpty, IsIn, IsOptional, IsNumber, IsObject, IsBoolean } from 'class-validator';

export class DuplicateTransactionDataDto {
  @IsNumber()
  amount: number;

  @IsIn(['debit', 'credit'])
  type: 'debit' | 'credit';

  @IsString()
  merchant: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsNumber()
  timestamp?: number;

  @IsOptional()
  @IsString()
  bankProfileId?: string | null;

  @IsOptional()
  @IsString()
  smsId?: string;

  @IsOptional()
  @IsString()
  source?: string;

  /** SMS text hash of the reviewed SMS; stored with the answer so it is never asked again. */
  @IsOptional()
  @IsString()
  contentId?: string;

  @IsOptional()
  @IsString()
  referenceId?: string;
}

export class ConfirmDuplicateDto {
  @IsString()
  @IsNotEmpty()
  notificationId: string;

  @IsIn(['add', 'ignore'])
  decision: 'add' | 'ignore';

  @IsOptional()
  @IsBoolean()
  adjustBalance?: boolean;

  @IsOptional()
  @IsObject()
  transactionData?: DuplicateTransactionDataDto;
}

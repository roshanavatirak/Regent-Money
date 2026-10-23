import { IsString, IsNotEmpty, IsIn, IsOptional, IsNumber, IsObject } from 'class-validator';

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
}

export class ConfirmDuplicateDto {
  @IsString()
  @IsNotEmpty()
  notificationId: string;

  @IsIn(['add', 'ignore'])
  decision: 'add' | 'ignore';

  @IsOptional()
  @IsObject()
  transactionData?: DuplicateTransactionDataDto;
}

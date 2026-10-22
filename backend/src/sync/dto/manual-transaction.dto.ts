import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn } from 'class-validator';

export class ManualTransactionDto {
  @IsString()
  @IsNotEmpty()
  bankProfileId: string;

  @IsIn(['debit', 'credit'])
  type: 'debit' | 'credit';

  @IsNumber()
  amount: number;

  @IsString()
  category: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsNumber()
  timestamp?: number;
}

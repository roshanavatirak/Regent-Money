import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateBroadcastDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(250)
  body: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  payload?: any;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}


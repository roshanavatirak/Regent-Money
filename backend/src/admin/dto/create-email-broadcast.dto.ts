import { IsNotEmpty, IsOptional, IsString, MaxLength, IsArray, IsIn } from 'class-validator';

export class CreateEmailBroadcastDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  subject: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  bodyMarkdown: string;

  @IsOptional()
  @IsIn(['announcement', 'policy_update', 'security_tip', 'service_notice'])
  category?: 'announcement' | 'policy_update' | 'security_tip' | 'service_notice';

  /** Small label above the title. Omit for the category's default; '' for none. */
  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;

  @IsOptional()
  @IsString()
  targetType?: 'all_verified' | 'specific_user' | 'custom_list';

  @IsOptional()
  @IsString()
  targetUserId?: string;

  @IsOptional()
  @IsArray()
  customEmails?: string[];

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}


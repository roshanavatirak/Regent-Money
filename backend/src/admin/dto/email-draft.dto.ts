import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** An unsent email broadcast, for preview and test sends. */
export class EmailDraftDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(40)
  label?: string;
}

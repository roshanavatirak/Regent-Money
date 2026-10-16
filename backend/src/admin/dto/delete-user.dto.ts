import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteUserDto {
  @IsEmail()
  @IsNotEmpty()
  confirmEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}

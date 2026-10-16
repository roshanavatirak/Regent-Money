import { IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class BanUserDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason: string;
}

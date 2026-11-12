import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ArrayMaxSize,
} from 'class-validator';
import { LIMITS } from './home-cards.schema';

// Card objects are checked field by field in validateCards(); here only the envelope.

export class SaveHomeCardsDraftDto {
  @IsArray()
  @ArrayMaxSize(LIMITS.maxCards)
  cards: unknown[];

  @IsInt()
  @Min(0)
  rev: number;
}

export class PublishHomeCardsDto {
  @IsArray()
  @ArrayMaxSize(LIMITS.maxCards)
  cards: unknown[];

  @IsInt()
  @Min(0)
  baseVersion: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  note?: string;
}

export class RollbackHomeCardsDto {
  @IsInt()
  @Min(0)
  baseVersion: number;
}

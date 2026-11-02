import { IsArray, ArrayMaxSize } from 'class-validator';

export class OutboxBatchDto {
  @IsArray()
  @ArrayMaxSize(100)
  ops!: any[]; // validated per op in the service, not here
}


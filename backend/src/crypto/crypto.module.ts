import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserKey } from './entities/user-key.entity';
import { Transaction } from '../sync/entities/transaction.entity';
import { IncomeRecord } from '../sync/entities/income-record.entity';
import { KmsService } from './kms.service';
import { FieldCipherService } from './field-cipher.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserKey, Transaction, IncomeRecord]),
  ],
  providers: [KmsService, FieldCipherService],
  exports: [FieldCipherService, KmsService],
})
export class CryptoModule {}


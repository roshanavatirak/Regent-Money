import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CryptoModule } from '../crypto/crypto.module';
import { PeerLedgerService } from './peer-ledger.service';
import { PeerLedgerController } from './peer-ledger.controller';

@Module({
  imports: [AuthModule, CryptoModule],
  controllers: [PeerLedgerController],
  providers: [PeerLedgerService],
})
export class PeerLedgerModule {}

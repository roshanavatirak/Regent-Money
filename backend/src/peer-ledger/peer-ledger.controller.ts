import { Body, Controller, Get, HttpCode, HttpStatus, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PeerLedgerService } from './peer-ledger.service';

/** The signed-in user's Borrow & Lend ledger. Every route is scoped to req.user.id. */
@UseGuards(JwtAuthGuard)
@Controller('peer-ledger')
export class PeerLedgerController {
  constructor(private readonly ledger: PeerLedgerService) {}

  @Get()
  get(@Req() req: any) {
    return this.ledger.get(req.user.id);
  }

  /** { data, baseVersion }: 409 with { current } when another device saved first. */
  @Put()
  @HttpCode(HttpStatus.OK)
  save(@Req() req: any, @Body() body: { data?: unknown; baseVersion?: unknown }) {
    return this.ledger.save(req.user.id, body || {});
  }
}

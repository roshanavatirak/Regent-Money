import { Controller, Get, Post, Body, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('sync')
@UseGuards(JwtAuthGuard)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get()
  async getSyncData(@Req() req: any) {
    const userId = req.user.id;
    return this.syncService.sync(userId);
  }

  @Post('bank-profile')
  @HttpCode(HttpStatus.CREATED)
  async createBankProfile(
    @Req() req: any,
    @Body() body: { id: string; bankName: string; accountNumberSuffix: string; currentBalance: number },
  ) {
    const userId = req.user.id;
    return this.syncService.createBankProfile(userId, body);
  }

  @Get('net-worth-snapshots')
  async getNetWorthSnapshots(@Req() req: any) {
    const userId = req.user.id;
    return this.syncService.getNetWorthSnapshots(userId);
  }

  @Get('income-records')
  async getIncomeRecords(@Req() req: any) {
    const userId = req.user.id;
    return this.syncService.getIncomeRecords(userId);
  }

  @Post('inject-mock')
  @HttpCode(HttpStatus.OK)
  async injectMockData(@Req() req: any) {
    const userId = req.user.id;
    return this.syncService.injectMockData(userId);
  }
}

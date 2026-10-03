import { Controller, Get, Post, Patch, Body, Req, UseGuards, HttpCode, HttpStatus, Delete, Param, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OcrSyncDto } from './dto/ocr-sync.dto';
import { ManualTransactionDto } from './dto/manual-transaction.dto';
import { FileInterceptor } from '@nestjs/platform-express';

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
    @Body() body: {
      id: string;
      bankName: string;
      accountNumberSuffix: string;
      currentBalance: number;
      accountType?: string;
      smsSenderId?: string;
      upiId?: string;
      customKeywords?: string;
    },
  ) {
    const userId = req.user.id;
    return this.syncService.createBankProfile(userId, body);
  }

  @Delete('bank-profile/:id')
  @HttpCode(HttpStatus.OK)
  async deleteBankProfile(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const userId = req.user.id;
    return this.syncService.deleteBankProfile(userId, id);
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

  @Post('verify-bank')
  @HttpCode(HttpStatus.OK)
  async verifyBankAccount(
    @Req() req: any,
    @Body() body: { bankCode: string; phoneNumber: string; simulateFailure?: boolean },
  ) {
    const userId = req.user.id;
    return this.syncService.verifyBankAccount(userId, body);
  }

  @Patch('transaction/:id/category')
  async updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { category: string; merchant?: string },
  ) {
    const userId = req.user.id;
    return this.syncService.updateTransactionCategory(userId, id, body.category, body.merchant);
  }

  @Post('merchant-tag-rule')
  @HttpCode(HttpStatus.OK)
  async saveMerchantTagRule(
    @Req() req: any,
    @Body() body: { merchant: string; tag: string },
  ) {
    const userId = req.user.id;
    return this.syncService.saveMerchantTagRule(userId, body.merchant, body.tag);
  }

  @Post('ocr-sync')
  @HttpCode(HttpStatus.OK)
  async syncOcrTransactions(
    @Req() req: any,
    @Body() body: OcrSyncDto,
  ) {
    const userId = req.user.id;
    return this.syncService.syncOcrTransactions(userId, body);
  }

  @Post('direct-sms')
  @HttpCode(HttpStatus.OK)
  async ingestDirectSms(
    @Req() req: any,
    @Body() body: { sender: string; body: string; timestamp?: number },
  ) {
    const userId = req.user.id;
    return this.syncService.ingestDirectSms(userId, body);
  }

  @Post('manual-transaction')
  @HttpCode(HttpStatus.CREATED)
  async addManualTransaction(
    @Req() req: any,
    @Body() body: ManualTransactionDto,
  ) {
    const userId = req.user.id;
    return this.syncService.addManualTransaction(userId, body);
  }

  @Patch('transaction-entry')
  @HttpCode(HttpStatus.OK)
  async updateTransactionEntry(
    @Req() req: any,
    @Body() body: {
      id: string;
      type: 'credit' | 'debit';
      amount: number;
      category: string;
      note?: string;
    },
  ) {
    const userId = req.user.id;
    return this.syncService.updateTransactionEntry(userId, body);
  }

  @Delete('transaction-entry/:id')
  @HttpCode(HttpStatus.OK)
  async deleteTransactionEntry(
    @Req() req: any,
    @Param('id') id: string,
    @Query('type') type: 'credit' | 'debit',
  ) {
    const userId = req.user.id;
    return this.syncService.deleteTransactionEntry(userId, id, type);
  }

  @Post('upload-screenshot')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async uploadScreenshot(
    @Req() req: any,
    @Body('bankProfileId') bankProfileId: string,
    @UploadedFile() file?: any,
  ) {
    const userId = req.user.id;
    if (!file) {
      throw new BadRequestException('Screenshot image file is required.');
    }
    return this.syncService.processScreenshotUpload(userId, bankProfileId, file.buffer, file.mimetype);
  }

  @Post('upload-statement')
  @UseInterceptors(FileInterceptor('file'))
  @HttpCode(HttpStatus.OK)
  async uploadStatement(
    @Req() req: any,
    @Body('bankProfileId') bankProfileId: string,
    @Body('password') password?: string,
    @UploadedFile() file?: any,
  ) {
    const userId = req.user.id;
    if (!file) {
      throw new BadRequestException('Statement file is required.');
    }
    return this.syncService.syncStatementFile(userId, bankProfileId, file.buffer, file.mimetype, password);
  }

  @Patch('bank-profile/:id/consent')
  async toggleSmsConsent(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { smsConsent: boolean },
  ) {
    const userId = req.user.id;
    return this.syncService.updateSmsConsent(userId, id, body.smsConsent);
  }

  @Post('goal')
  @HttpCode(HttpStatus.CREATED)
  async createGoal(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    return this.syncService.createGoal(userId, body);
  }

  @Patch('goal/:id')
  @HttpCode(HttpStatus.OK)
  async updateGoal(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const userId = req.user.id;
    return this.syncService.updateGoal(userId, id, body);
  }

  @Post('goal/:id/contribute')
  @HttpCode(HttpStatus.OK)
  async contributeToGoal(@Req() req: any, @Param('id') id: string, @Body('amount') amount: number) {
    const userId = req.user.id;
    return this.syncService.contributeToGoal(userId, id, amount);
  }

  @Delete('goal/:id')
  @HttpCode(HttpStatus.OK)
  async deleteGoal(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    return this.syncService.deleteGoal(userId, id);
  }

  @Post('budget')
  @HttpCode(HttpStatus.CREATED)
  async createBudget(@Req() req: any, @Body() body: any) {
    const userId = req.user.id;
    return this.syncService.createBudget(userId, body);
  }

  @Patch('budget/:id')
  @HttpCode(HttpStatus.OK)
  async updateBudget(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const userId = req.user.id;
    return this.syncService.updateBudget(userId, id, body);
  }

  @Delete('budget/:id')
  @HttpCode(HttpStatus.OK)
  async deleteBudget(@Req() req: any, @Param('id') id: string) {
    const userId = req.user.id;
    return this.syncService.deleteBudget(userId, id);
  }

  @Post('budget/exclude-transaction')
  @HttpCode(HttpStatus.OK)
  async excludeTransactionFromBudget(
    @Req() req: any,
    @Body() body: { transactionId: string; budgetId?: string },
  ) {
    const userId = req.user.id;
    return this.syncService.excludeTransactionFromBudget(userId, body);
  }

  @Post('budget/restore-transaction')
  @HttpCode(HttpStatus.OK)
  async restoreTransactionToBudget(
    @Req() req: any,
    @Body() body: { transactionId: string },
  ) {
    const userId = req.user.id;
    return this.syncService.restoreTransactionToBudget(userId, body);
  }
}

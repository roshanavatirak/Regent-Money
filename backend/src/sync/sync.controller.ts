import { Controller, Get, Post, Patch, Body, Req, Res, UseGuards, HttpCode, HttpStatus, Delete, Param, Query, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import type { Response } from 'express';
import { SyncVersionInterceptor } from './sync-version.interceptor';
import { AllowIngestToken } from '../auth/allow-ingest-token.decorator';
import { SyncService } from './sync.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OcrSyncDto } from './dto/ocr-sync.dto';
import { ManualTransactionDto } from './dto/manual-transaction.dto';
import { ConfirmDuplicateDto } from './dto/confirm-duplicate.dto';
import { OutboxBatchDto } from './dto/outbox-batch.dto';
import { DirectSmsDto } from './dto/direct-sms.dto';
import { FileInterceptor } from '@nestjs/platform-express';

/**
 * Even when nothing changed, a phone gets the full data at least once in this window,
 * so a missed version bump can never leave it stale for long.
 */
export const SYNC_ETAG_WINDOW_MS = 15 * 60 * 1000;

/** Uploaded files are held in memory, so they are capped (same limits the app enforces). */
export const MAX_SCREENSHOT_BYTES = 15 * 1024 * 1024;
export const MAX_STATEMENT_BYTES = 25 * 1024 * 1024;

@Controller('sync')
@UseGuards(JwtAuthGuard)
@UseInterceptors(SyncVersionInterceptor)
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  /**
   * Full sync, with "nothing changed" replies. The ETag is the user's sync version (bumped on
   * every write) plus a 15-minute window. If the phone already has that version, reply 304 with
   * no body and skip the database entirely. When something did change, a phone that sends
   * ?since=<cursor> receives only the changed rows (see SyncService.syncForClient).
   */
  @Get()
  async getSyncData(@Req() req: any, @Res({ passthrough: true }) res: Response, @Query('since') since?: string) {
    const userId = req.user.id;
    const version = await this.syncService.getSyncVersion(userId);
    const etag = version ? `"${version}-${Math.floor(Date.now() / SYNC_ETAG_WINDOW_MS)}"` : null;

    res.setHeader('Cache-Control', 'private, no-cache');
    if (etag && req.headers['if-none-match'] === etag) {
      res.setHeader('ETag', etag);
      res.status(HttpStatus.NOT_MODIFIED);
      return;
    }

    // With ?since=<cursor> the phone gets only what changed; without it, everything
    const data = await this.syncService.syncForClient(userId, since);
    if (etag) res.setHeader('ETag', etag);
    return data;
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

  @Post('bank-profile/:id/debit-cards')
  @HttpCode(HttpStatus.OK)
  async setDebitCards(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { cardSuffixes: string[] },
  ) {
    const userId = req.user.id;
    return this.syncService.setDebitCards(userId, id, Array.isArray(body?.cardSuffixes) ? body.cardSuffixes : []);
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

  @Patch('transaction/:id/category')
  async updateCategory(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { category: string; merchant?: string; updateMerchantRule?: boolean },
  ) {
    const userId = req.user.id;
    return this.syncService.updateTransactionCategory(
      userId,
      id,
      body.category,
      body.merchant,
      body.updateMerchantRule,
    );
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

  @Delete('merchant-tag-rule')
  @HttpCode(HttpStatus.OK)
  async deleteMerchantTagRule(
    @Req() req: any,
    @Query('merchant') merchant: string,
  ) {
    const userId = req.user.id;
    return this.syncService.deleteMerchantTagRule(userId, merchant);
  }

  @Get('merchant-tag-rules')
  @HttpCode(HttpStatus.OK)
  async getMerchantTagRules(@Req() req: any) {
    const userId = req.user.id;
    return this.syncService.getUserMerchantTagRules(userId);
  }

  /** The user's own tags ("Your tags" in the tag sheet), shared by all their devices. */
  @Get('custom-tags')
  @HttpCode(HttpStatus.OK)
  async getCustomTags(@Req() req: any) {
    return this.syncService.getCustomTags(req.user.id);
  }

  /** Adds one tag ({ name }) or several ({ names: [...] }); returns the full list. */
  @Post('custom-tags')
  @HttpCode(HttpStatus.OK)
  async addCustomTags(@Req() req: any, @Body() body: { name?: string; names?: string[] }) {
    return this.syncService.addCustomTags(req.user.id, body?.names ?? body?.name);
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

  /** Inbox re-scan of bank SMS: identical SMS are no-ops, only distinct look-alikes are reviewed. */
  @Post('sms-catchup')
  @HttpCode(HttpStatus.OK)
  async syncSmsCatchup(
    @Req() req: any,
    @Body() body: OcrSyncDto,
  ) {
    const userId = req.user.id;
    return this.syncService.syncSmsCatchup(userId, body);
  }

  // The Android background worker posts here with its SMS-only token while the app is closed
  @Post('direct-sms')
  @AllowIngestToken()
  @HttpCode(HttpStatus.OK)
  async ingestDirectSms(
    @Req() req: any,
    @Body() body: DirectSmsDto,
  ) {
    const userId = req.user.id;
    return this.syncService.ingestDirectSms(userId, body);
  }

  @Post('confirm-duplicate')
  @HttpCode(HttpStatus.OK)
  async confirmDuplicate(
    @Req() req: any,
    @Body() body: ConfirmDuplicateDto,
  ) {
    const userId = req.user.id;
    return this.syncService.confirmDuplicateTransaction(userId, body);
  }

  @Post('outbox')
  @HttpCode(HttpStatus.OK)
  async outbox(@Req() req: any, @Body() body: OutboxBatchDto) {
    return this.syncService.applyOutbox(req.user.id, body?.ops || []);
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
      timestamp?: number;
      bankProfileId?: string | null;
      updateMerchantRule?: boolean;
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
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SCREENSHOT_BYTES, files: 1 } }))
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
    await this.syncService.assertScanQuota(userId);
    return this.syncService.processScreenshotUpload(userId, bankProfileId, file.buffer, file.mimetype);
  }

  @Post('upload-statement')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_STATEMENT_BYTES, files: 1 } }))
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
    await this.syncService.assertScanQuota(userId);
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
  async contributeToGoal(
    @Req() req: any,
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Body('note') note?: string,
  ) {
    const userId = req.user.id;
    return this.syncService.contributeToGoal(userId, id, amount, note);
  }

  @Post('goal/:id/withdraw')
  @HttpCode(HttpStatus.OK)
  async withdrawFromGoal(
    @Req() req: any,
    @Param('id') id: string,
    @Body('amount') amount: number,
    @Body('note') note?: string,
  ) {
    const userId = req.user.id;
    return this.syncService.withdrawFromGoal(userId, id, amount, note);
  }

  @Delete('goal/:id/entry/:entryId')
  @HttpCode(HttpStatus.OK)
  async deleteGoalEntry(
    @Req() req: any,
    @Param('id') goalId: string,
    @Param('entryId') entryId: string,
  ) {
    const userId = req.user.id;
    return this.syncService.deleteGoalEntry(userId, goalId, entryId);
  }

  @Get('goal/:id/history')
  @HttpCode(HttpStatus.OK)
  async getGoalHistory(@Req() req: any, @Param('id') goalId: string) {
    const userId = req.user.id;
    return this.syncService.getGoalHistory(userId, goalId);
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

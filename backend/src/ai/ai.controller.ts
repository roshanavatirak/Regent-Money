import { Controller, Post, Body, UseGuards, Req, HttpException, HttpStatus, UseInterceptors, UploadedFile, HttpCode, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VoiceService, MAX_VOICE_BYTES, VoiceLanguage } from './voice.service';
import { AiService, ChatRequestDto, MAX_CONTEXT_CHARS } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  private readonly logger = new Logger(AiController.name);

  constructor(
    private readonly aiService: AiService,
    private readonly voiceService: VoiceService,
  ) {}

  @Post('chat')
  async chat(@Body() body: ChatRequestDto, @Req() req: any) {
    // Each person gets a daily number of questions (AI_DAILY_LIMIT, default 40), so one
    // busy account can't use up the free AI allowance for everyone.
    const userId = req.user?.id;
    if (userId) {
      const quota = await this.aiService.consumeDailyQuota(userId);
      if (!quota.allowed) {
        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            code: 'AI_DAILY_LIMIT',
            message: `You've asked Regent ${quota.limit} questions today, which is the daily limit. It resets at midnight.`,
            limit: quota.limit,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    // The account summary sent with a question is small; anything huge is not from the app
    if (body?.context && JSON.stringify(body.context).length > MAX_CONTEXT_CHARS) {
      throw new HttpException('The request is too large.', HttpStatus.PAYLOAD_TOO_LARGE);
    }
    return this.aiService.chat(body);
  }

  @Post('parse-statement')
  async parseStatement(@Body('text') text: string, @Req() req: any) {
    // Scans use the AI too, so they have their own daily limit
    const quota = await this.aiService.consumeDailyQuota(req.user.id, 'scan');
    if (!quota.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'AI_SCAN_LIMIT',
          message: `You've scanned ${quota.limit} statements or screenshots today, which is the daily limit. It resets at midnight.`,
          limit: quota.limit,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const result = await this.aiService.parseStatementText(typeof text === 'string' ? text : '');
    return { success: result.isValid, transactions: result.transactions, rejectionReason: result.rejectionReason };
  }

  /**
   * Voice entry: one short recording in, draft transactions out. Nothing is saved here;
   * the phone shows the drafts for review and saves them the usual way.
   */
  @Post('voice-transaction')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_VOICE_BYTES, files: 1 } }))
  async voiceTransaction(
    @Req() req: any,
    @Body('lang') langRaw?: string,
    @Body('accounts') accountsRaw?: string,
    @UploadedFile() file?: any,
  ) {
    if (!file?.buffer?.length) {
      throw new HttpException(
        { statusCode: HttpStatus.BAD_REQUEST, code: 'VOICE_NO_AUDIO', message: 'No recording was received. Try again.' },
        HttpStatus.BAD_REQUEST,
      );
    }
    // A recording this small is a tap, not speech: don't spend the daily allowance on it
    if (file.buffer.length < 2000) {
      return { status: 'no_speech', transcript: '', drafts: [] };
    }

    const quota = await this.aiService.consumeDailyQuota(req.user.id, 'voice');
    if (!quota.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'AI_VOICE_LIMIT',
          message: `You've added ${quota.limit} transactions by voice today, which is the daily limit. It resets at midnight. You can still add them by typing.`,
          limit: quota.limit,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const lang: VoiceLanguage = langRaw === 'en' ? 'en' : langRaw === 'auto' ? 'auto' : 'hi';
    let accounts: string[] = [];
    try {
      const parsed = JSON.parse(accountsRaw || '[]');
      if (Array.isArray(parsed)) accounts = parsed.filter((a) => typeof a === 'string');
    } catch {
      accounts = [];
    }

    try {
      const result = await this.voiceService.process(file.buffer, lang, accounts);
      return { status: result.status, transcript: result.transcript, drafts: result.drafts };
    } catch (err: any) {
      this.logger.warn(`[Voice] ${err?.message || err}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.SERVICE_UNAVAILABLE,
          code: 'VOICE_UNAVAILABLE',
          message: "Regent couldn't hear that right now. Try again in a moment, or add it by typing.",
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Voice entry when the phone's own recogniser already heard the words: text in, drafts out.
   * Used only when the phone's rules were not sure; there is no audio in this request.
   */
  @Post('voice-text')
  @HttpCode(HttpStatus.OK)
  async voiceText(@Req() req: any, @Body('text') text?: string, @Body('accounts') accountsRaw?: unknown) {
    if (typeof text !== 'string' || !text.trim()) {
      return { status: 'no_speech', transcript: '', drafts: [] };
    }
    if (text.length > 2000) {
      throw new HttpException('The request is too large.', HttpStatus.PAYLOAD_TOO_LARGE);
    }
    const quota = await this.aiService.consumeDailyQuota(req.user.id, 'voice');
    if (!quota.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: 'AI_VOICE_LIMIT',
          message: `You've added ${quota.limit} transactions by voice today, which is the daily limit. It resets at midnight. You can still add them by typing.`,
          limit: quota.limit,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const accounts = Array.isArray(accountsRaw) ? accountsRaw.filter((a): a is string => typeof a === 'string') : [];
    // Never fails: when every AI is down the rule parser answers
    const result = await this.voiceService.processText(text, accounts);
    return { status: result.status, transcript: result.transcript, drafts: result.drafts };
  }
}

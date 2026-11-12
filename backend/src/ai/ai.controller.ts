import { Controller, Post, Body, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
import { AiService, ChatRequestDto, MAX_CONTEXT_CHARS } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

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
}

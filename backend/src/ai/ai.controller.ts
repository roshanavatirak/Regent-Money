import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AiService, ChatRequestDto } from './ai.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() body: ChatRequestDto) {
    return this.aiService.chat(body);
  }

  @Post('parse-statement')
  async parseStatement(@Body('text') text: string) {
    const result = await this.aiService.parseStatementText(text || '');
    return { success: result.isValid, transactions: result.transactions, rejectionReason: result.rejectionReason };
  }
}

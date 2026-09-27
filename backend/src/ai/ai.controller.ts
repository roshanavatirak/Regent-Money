import { Controller, Post, Body } from '@nestjs/common';
import { AiService, ChatRequestDto } from './ai.service';

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

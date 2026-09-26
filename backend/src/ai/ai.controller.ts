import { Controller, Post, Body } from '@nestjs/common';
import { AiService, ChatRequestDto } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('chat')
  async chat(@Body() body: ChatRequestDto) {
    return this.aiService.chat(body);
  }
}

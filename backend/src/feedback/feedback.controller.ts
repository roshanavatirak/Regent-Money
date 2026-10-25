// backend/src/feedback/feedback.controller.ts
//
// POST /feedback — receives feature ideas and bug reports from the app.

import { Body, Controller, Post, Req, UseGuards, BadRequestException, Logger } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface FeedbackDto {
  kind: 'feature' | 'bug';
  title: string;
  description: string;
  area?: string;
  impact?: string;
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  theme?: string;
}

@Controller('feedback')
@UseGuards(JwtAuthGuard)
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  @Post()
  async create(@Body() body: FeedbackDto, @Req() req: any) {
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();
    if (!['feature', 'bug'].includes(body.kind)) {
      throw new BadRequestException('Unknown feedback type.');
    }
    if (title.length < 3) {
      throw new BadRequestException('Add a short title.');
    }
    if (description.length < 10) {
      throw new BadRequestException('Add a few more words.');
    }

    const record = {
      userId: req.user?.id ?? null,
      kind: body.kind,
      title: title.slice(0, 80),
      description: description.slice(0, 1000),
      area: body.area?.slice(0, 40) ?? null,
      impact: body.impact?.slice(0, 40) ?? null,
      appVersion: body.appVersion ?? null,
      platform: body.platform ?? null,
      osVersion: body.osVersion ?? null,
      theme: body.theme ?? null,
      createdAt: new Date(),
    };

    this.logger.log(`[Feedback Received] User: ${record.userId} | ${record.kind.toUpperCase()}: ${record.title}`);
    console.log('[Feedback]', record);
    return { id: `fb_${Date.now()}` };
  }
}

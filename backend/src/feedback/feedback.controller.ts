import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { FeedbackService } from './feedback.service';
import type {
  FeedbackKind,
  FeedbackPriority,
  FeedbackStatus,
} from './entities/feedback.entity';

interface FeedbackDto {
  kind: FeedbackKind;
  title: string;
  description: string;
  area?: string;
  impact?: string;
  priority?: FeedbackPriority;
  images?: string[];
  appVersion?: string;
  platform?: string;
  osVersion?: string;
  theme?: string;
}

interface UpdateOwnFeedbackDto {
  title?: string;
  description?: string;
  area?: string | null;
  impact?: string | null;
  priority?: FeedbackPriority;
}

interface UpdateFeedbackStatusDto {
  status?: FeedbackStatus;
  priority?: FeedbackPriority;
  adminNotes?: string;
}

@Controller('feedback')
export class FeedbackController {
  private readonly logger = new Logger(FeedbackController.name);

  constructor(private readonly feedbackService: FeedbackService) {}

  /**
   * Submit a new bug report or feature suggestion.
   * Photos are optional (0 to 3 images, base64 strings).
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() body: FeedbackDto, @Req() req: any) {
    const title = (body.title || '').trim();
    const description = (body.description || '').trim();

    if (!['feature', 'bug'].includes(body.kind)) {
      throw new BadRequestException('Unknown feedback type. Must be "feature" or "bug".');
    }
    if (title.length < 3) {
      throw new BadRequestException('Add a short title (at least 3 characters).');
    }
    if (description.length < 10) {
      throw new BadRequestException('Add a few more words (at least 10 characters).');
    }

    if (body.images && (!Array.isArray(body.images) || body.images.length > 3)) {
      throw new BadRequestException('Maximum 3 screenshots allowed.');
    }

    const priority: FeedbackPriority = ['low', 'medium', 'high', 'critical'].includes(body.priority as any)
      ? body.priority!
      : 'medium';

    const record = await this.feedbackService.createFeedback({
      userId: req.user?.id ?? null,
      kind: body.kind,
      title,
      description,
      area: body.area,
      impact: body.impact,
      priority,
      images: body.images,
      appVersion: body.appVersion,
      platform: body.platform,
      osVersion: body.osVersion,
      theme: body.theme,
    });

    return {
      id: record.id,
      kind: record.kind,
      title: record.title,
      status: record.status,
      priority: record.priority,
      mediaUrls: record.mediaUrls,
      createdAt: record.createdAt,
    };
  }

  /**
   * Fetch feedback reports submitted by the authenticated user.
   */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  async getMyFeedback(@Req() req: any) {
    const userId = req.user?.id;
    if (!userId) return [];
    return this.feedbackService.getUserFeedback(userId);
  }

  /**
   * Edit your own report. Allowed only while its status is still 'open'.
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async updateMine(@Param('id') id: string, @Body() body: UpdateOwnFeedbackDto, @Req() req: any) {
    const changes: UpdateOwnFeedbackDto = {};

    if (body.title !== undefined) {
      const title = String(body.title).trim();
      if (title.length < 3) throw new BadRequestException('Add a short title (at least 3 characters).');
      changes.title = title;
    }
    if (body.description !== undefined) {
      const description = String(body.description).trim();
      if (description.length < 10) throw new BadRequestException('Add a few more words (at least 10 characters).');
      changes.description = description;
    }
    if (body.area !== undefined) changes.area = body.area ? String(body.area) : null;
    if (body.impact !== undefined) changes.impact = body.impact ? String(body.impact) : null;
    if (body.priority !== undefined) {
      if (!['low', 'medium', 'high', 'critical'].includes(body.priority as any)) {
        throw new BadRequestException('Unknown priority.');
      }
      changes.priority = body.priority;
    }

    const record = await this.feedbackService.updateOwnFeedback(req.user?.id, id, changes);
    return {
      id: record.id,
      kind: record.kind,
      title: record.title,
      description: record.description,
      area: record.area,
      impact: record.impact,
      priority: record.priority,
      status: record.status,
      mediaUrls: record.mediaUrls,
      adminNotes: record.adminNotes,
      createdAt: record.createdAt,
      resolvedAt: record.resolvedAt,
    };
  }

  /**
   * Admin endpoint: View all feedback tickets with optional filtering.
   */
  @Get('admin/all')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async getAllFeedback(
    @Query('status') status?: FeedbackStatus,
    @Query('priority') priority?: FeedbackPriority,
    @Query('limit') limit = 50,
    @Query('offset') offset = 0,
  ) {
    return this.feedbackService.getAllFeedback(status, priority, Number(limit), Number(offset));
  }

  /**
   * Admin endpoint: Update ticket status, priority, or resolution notes.
   */
  @Patch('admin/:id/status')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateStatus(
    @Param('id') id: string,
    @Body() body: UpdateFeedbackStatusDto,
  ) {
    return this.feedbackService.updateStatus(id, body.status, body.priority, body.adminNotes);
  }
}

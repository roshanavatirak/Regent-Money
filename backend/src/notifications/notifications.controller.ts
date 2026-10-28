import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Headers, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';
import { SignalsService } from './signals.service';
import { timingSafeEqual } from 'crypto';

@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly signalsService: SignalsService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('token')
  async registerToken(
    @Req() req: any,
    @Body() body: { token?: string | null },
  ) {
    const userId = req.user.id;
    return this.notificationsService.registerPushToken(userId, body.token || null);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getNotifications(@Req() req: any) {
    const userId = req.user.id;
    return this.notificationsService.getNotifications(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('read-all')
  async markAllAsRead(@Req() req: any) {
    const userId = req.user.id;
    return this.notificationsService.markAllAsRead(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async markAsRead(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const userId = req.user.id;
    return this.notificationsService.markAsRead(userId, id);
  }

  /**
   * Tracks open analytics and marks notification as read when user taps tray or in-app notification.
   */
  @UseGuards(JwtAuthGuard)
  @Post('opened')
  async markOpened(
    @Req() req: any,
    @Body() body: { notificationId: string },
  ) {
    const userId = req.user.id;
    return this.notificationsService.markNotificationOpened(body.notificationId, userId);
  }

  /**
   * Evaluates current user's financial signals in real-time (diagnostic / instant inspection).
   */
  @UseGuards(JwtAuthGuard)
  @Post('evaluate-mine')
  async evaluateMySignals(@Req() req: any) {
    const userId = req.user.id;
    return this.signalsService.evaluateUserSignals(userId);
  }

  /**
   * Evaluates and attempts dispatch for current user.
   */
  @UseGuards(JwtAuthGuard)
  @Post('trigger-mine')
  async triggerMySignals(@Req() req: any) {
    const userId = req.user.id;
    return this.signalsService.triggerUserDispatch(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteNotification(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const userId = req.user.id;
    return this.notificationsService.deleteNotification(userId, id);
  }

  // Protected endpoint for internal backend agents or automated jobs
  @Post('send')
  async sendNotification(
    @Headers('x-internal-key') internalKeyHeader: string,
    @Body() body: {
      userId: string;
      agentId?: string;
      title: string;
      body: string;
      type: string;
      payload?: any;
    },
  ) {
    const expected = process.env.INTERNAL_API_KEY || process.env.BROADCAST_SECRET;
    if (
      !expected ||
      typeof internalKeyHeader !== 'string' ||
      internalKeyHeader.length !== expected.length ||
      !timingSafeEqual(Buffer.from(internalKeyHeader), Buffer.from(expected))
    ) {
      throw new ForbiddenException('Access denied. Invalid or missing internal key.');
    }

    return this.notificationsService.sendNotification(body.userId, {
      agentId: body.agentId,
      title: body.title,
      body: body.body,
      type: body.type,
      payload: body.payload,
    });
  }

  // Autonomous Signals Dispatch Manual / Webhook Trigger
  @Post('dispatch-signals')
  async triggerSignalsDispatch(
    @Headers('x-broadcast-secret') secretHeader: string,
    @Headers('x-internal-key') internalKeyHeader: string,
    @Body() body?: { secret?: string },
  ) {
    const expected = process.env.BROADCAST_SECRET || process.env.INTERNAL_API_KEY;
    const provided = secretHeader || internalKeyHeader || body?.secret;

    if (
      !expected ||
      typeof provided !== 'string' ||
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      throw new ForbiddenException('Access denied. Invalid or missing secret.');
    }

    return this.signalsService.runSignalsDispatchJob();
  }

  // External Webhook or Manual Trigger for Daily Humor Broadcast
  @Post('broadcast/daily-humor')
  async triggerDailyHumor(
    @Headers('x-broadcast-secret') secretHeader: string,
    @Headers('x-internal-key') internalKeyHeader: string,
    @Body() body?: { slot?: 'morning' | 'evening'; secret?: string; title?: string; body?: string },
  ) {
    const expected = process.env.BROADCAST_SECRET || process.env.INTERNAL_API_KEY;
    const provided = secretHeader || internalKeyHeader || body?.secret;

    if (
      !expected ||
      typeof provided !== 'string' ||
      provided.length !== expected.length ||
      !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
    ) {
      throw new ForbiddenException('Access denied. Invalid or missing broadcast secret.');
    }

    const slot = body?.slot || (new Date().getHours() < 14 ? 'morning' : 'evening');
    const customMessage = body?.title && body?.body ? { title: body.title, body: body.body } : undefined;

    return this.notificationsService.broadcastDailyHumor(slot, customMessage);
  }
}


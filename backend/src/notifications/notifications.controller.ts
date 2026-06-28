import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('token')
  async registerToken(
    @Req() req: any,
    @Body() body: { token: string },
  ) {
    const userId = req.user.id;
    return this.notificationsService.registerPushToken(userId, body.token);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getNotifications(@Req() req: any) {
    const userId = req.user.id;
    return this.notificationsService.getNotifications(userId);
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

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteNotification(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const userId = req.user.id;
    return this.notificationsService.deleteNotification(userId, id);
  }

  // Endpoint for internal backend agents or testing to trigger a notification
  @Post('send')
  async sendNotification(
    @Body() body: {
      userId: string;
      agentId?: string;
      title: string;
      body: string;
      type: string;
      payload?: any;
    },
  ) {
    return this.notificationsService.sendNotification(body.userId, {
      agentId: body.agentId,
      title: body.title,
      body: body.body,
      type: body.type,
      payload: body.payload,
    });
  }
}

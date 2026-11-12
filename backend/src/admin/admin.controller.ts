import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { BanUserDto } from './dto/ban-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { CreateBroadcastDto } from './dto/create-broadcast.dto';
import { CreateEmailBroadcastDto } from './dto/create-email-broadcast.dto';
import { EmailDraftDto } from './dto/email-draft.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  @Get('broadcasts/audience-estimate')
  getAudienceEstimate() {
    return this.adminService.getAudienceEstimate();
  }

  @Get('broadcasts')
  listBroadcasts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.listBroadcasts(page, limit);
  }

  @Post('broadcasts')
  sendBroadcast(@Req() req: any, @Body() dto: CreateBroadcastDto) {
    return this.adminService.sendBroadcast(req.user.id, req.user.role, dto);
  }

  @Get('emails/quota')
  getEmailQuota() {
    return this.adminService.getEmailBroadcastQuota();
  }

  @Get('emails/overview')
  getEmailOverview() {
    return this.adminService.getEmailSystemOverview();
  }

  @Post('emails/preview')
  previewEmail(@Req() req: any, @Body() dto: EmailDraftDto) {
    return this.adminService.previewEmailDraft(req.user.role, dto);
  }

  @Post('emails/test-draft')
  sendDraftTest(@Req() req: any, @Body() dto: EmailDraftDto) {
    return this.adminService.sendEmailDraftTest(req.user.id, req.user.role, dto);
  }

  @Post('emails/fallback')
  setEmailFallback(@Req() req: any, @Body() dto: { enabled: boolean }) {
    return this.adminService.setEmailFallback(req.user.id, req.user.role, dto?.enabled);
  }

  @Post('emails/test')
  sendTestEmail(@Req() req: any, @Body() dto: { type: 'primary' | 'broadcast'; email?: string }) {
    return this.adminService.sendTestEmail(req.user.id, req.user.role, dto.type, dto.email);
  }

  @Get('emails/audience-estimate')
  getEmailAudienceEstimate() {
    return this.adminService.getEmailAudienceEstimate();
  }

  @Get('emails/broadcasts')
  listEmailBroadcasts(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.listEmailBroadcasts(page, limit);
  }

  @Post('emails/broadcast')
  createEmailBroadcast(@Req() req: any, @Body() dto: CreateEmailBroadcastDto) {
    return this.adminService.createEmailBroadcast(req.user.id, req.user.role, dto);
  }

  @Post('emails/broadcasts/:id/cancel')
  cancelEmailBroadcast(@Req() req: any, @Param('id') id: string) {
    return this.adminService.cancelEmailBroadcast(req.user.id, req.user.role, id);
  }

  @Get('users')
  getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(page, limit, search);
  }

  @Get('logs')
  getLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getAuditLogs(page, limit);
  }

  @Post('users/:id/ban')
  banUser(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: BanUserDto,
  ) {
    return this.adminService.banUser(req.user.id, req.user.role, id, dto.reason);
  }

  @Post('users/:id/unban')
  unbanUser(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.adminService.unbanUser(req.user.id, req.user.role, id);
  }

  // Uses POST so reverse proxies and clients never drop confirmation email payload
  @Post('users/:id/delete')
  deleteUser(
    @Req() req: any,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: DeleteUserDto,
  ) {
    return this.adminService.hardDeleteUser(
      req.user.id,
      req.user.role,
      id,
      dto.confirmEmail,
      dto.reason || '',
    );
  }
}

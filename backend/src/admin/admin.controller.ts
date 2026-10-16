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

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
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

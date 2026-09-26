import { Controller, Get, Query } from '@nestjs/common';
import { AppService, AppVersionResponse } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('app/version-check')
  async checkAppVersion(
    @Query('platform') platform?: string,
    @Query('currentVersion') currentVersion?: string,
  ): Promise<AppVersionResponse> {
    return this.appService.checkAppVersion(platform, currentVersion);
  }
}

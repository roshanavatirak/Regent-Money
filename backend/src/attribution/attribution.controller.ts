import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { AttributionService } from './attribution.service';
import type { ClaimInput } from './attribution.service';
import { isPreviewBot, playStoreUrl } from './referrer';

/**
 * Public invite and campaign links: /r/<code>.
 * Always ends at the Play Store, whatever the code, so the link never shows an error
 * and never reveals whether a code exists.
 */
@Controller('r')
export class LinkRedirectController {
  constructor(private readonly attribution: AttributionService) {}

  @Get(':code')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  async open(@Param('code') code: string, @Req() req: Request, @Res() res: Response) {
    let target = playStoreUrl();
    try {
      const isPerson = req.method === 'GET' && !isPreviewBot(req.headers['user-agent']);
      target = await this.attribution.openLink(code, isPerson);
    } catch {
      // Fall back to the plain store page
    }
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.redirect(302, target);
  }
}

@Controller('attribution')
@UseGuards(JwtAuthGuard)
export class AttributionController {
  constructor(private readonly attribution: AttributionService) {}

  /** The signed-in user's invite link and totals. Never who joined. */
  @Get('me')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  me(@Req() req: any) {
    return this.attribution.myInvite(req.user.id);
  }

  @Post('challenge')
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  challenge(@Req() req: any) {
    return this.attribution.challenge(req.user.id);
  }

  @Post('claim')
  @Throttle({ default: { limit: 6, ttl: 60000 } })
  claim(@Req() req: any, @Body() body: ClaimInput) {
    return this.attribution.claim(req.user.id, body || {});
  }

  /* ---------------- Admin ---------------- */

  @Get('admin/overview')
  @UseGuards(AdminGuard)
  overview(@Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number) {
    return this.attribution.adminOverview(Math.min(Math.max(days, 0), 3650));
  }

  @Post('admin/campaigns')
  @UseGuards(AdminGuard)
  createCampaign(@Req() req: any, @Body() body: { name?: string; channel?: string; code?: string }) {
    return this.attribution.createCampaign(req.user.id, body || {});
  }

  @Post('admin/campaigns/:id/active')
  @UseGuards(AdminGuard)
  setCampaignActive(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: { isActive?: boolean }) {
    return this.attribution.setCampaignActive(id, !!body?.isActive);
  }

  @Post('admin/inviters/:userId/review')
  @UseGuards(AdminGuard)
  resolveReview(
    @Req() req: any,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() body: { approve?: boolean },
  ) {
    return this.attribution.resolveReview(req.user.id, userId, !!body?.approve);
  }
}

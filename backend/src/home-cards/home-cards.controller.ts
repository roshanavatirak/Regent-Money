import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { HomeCardsService } from './home-cards.service';
import {
  PublishHomeCardsDto,
  RollbackHomeCardsDto,
  SaveHomeCardsDraftDto,
} from './home-cards.dto';

/**
 * Phones call this only when the X-Home-Cards header shows a newer number than they hold.
 * No sign-in needed (the cards are the same for everyone and hold no user data), so it costs
 * no token check, and the response can be cached by Cloudflare and the phone for good.
 */
@Controller('home-cards')
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class HomeCardsController {
  constructor(private readonly homeCards: HomeCardsService) {}

  @Get(':version')
  async get(
    @Param('version', ParseIntPipe) version: number,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    await this.homeCards.ensureLoaded();
    const live = this.homeCards.liveRelease;
    if (!live || live.version !== version) {
      // Old or unknown number: tell the phone what's current and don't let anyone cache this
      res.setHeader('Cache-Control', 'no-store');
      res
        .status(404)
        .json({ code: 'NOT_LIVE', current: this.homeCards.version });
      return;
    }

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('ETag', live.etag);
    res.setHeader('Vary', 'Accept-Encoding');
    if (req.headers['if-none-match'] === live.etag) {
      res.status(304).end();
      return;
    }
    res.type('application/json');
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      res.setHeader('Content-Encoding', 'gzip');
      res.send(live.gz);
    } else {
      res.send(live.body);
    }
  }
}

@Controller('admin/home-cards')
@UseGuards(JwtAuthGuard, AdminGuard)
@Throttle({ default: { limit: 30, ttl: 60_000 } })
export class AdminHomeCardsController {
  constructor(private readonly homeCards: HomeCardsService) {}

  @Get()
  getState() {
    return this.homeCards.getAdminState();
  }

  @Put('draft')
  saveDraft(@Req() req: any, @Body() dto: SaveHomeCardsDraftDto) {
    return this.homeCards.saveDraft(req.user.id, dto.cards, dto.rev);
  }

  @Post('publish')
  @Throttle({ default: { limit: 2, ttl: 30_000 } })
  publish(@Req() req: any, @Body() dto: PublishHomeCardsDto) {
    return this.homeCards.publish(
      req.user.id,
      dto.cards,
      dto.note,
      dto.baseVersion,
    );
  }

  @Post('rollback/:version')
  @Throttle({ default: { limit: 2, ttl: 30_000 } })
  rollback(
    @Req() req: any,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: RollbackHomeCardsDto,
  ) {
    return this.homeCards.rollback(req.user.id, version, dto.baseVersion);
  }
}

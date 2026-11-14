import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { AttributionController, LinkRedirectController } from './attribution.controller';
import { AttributionService } from './attribution.service';
import { PlayIntegrityService } from './play-integrity.service';

/**
 * How each new user arrived: a friend's invite link, a campaign link, an ad, or organically.
 * One row per user in core.install_attributions; links in core.tracking_links.
 */
@Module({
  imports: [ConfigModule, AuthModule, AdminModule],
  controllers: [LinkRedirectController, AttributionController],
  providers: [AttributionService, PlayIntegrityService],
  exports: [AttributionService],
})
export class AttributionModule {}

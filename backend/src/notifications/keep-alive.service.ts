import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class KeepAliveService implements OnModuleInit {
  private readonly logger = new Logger(KeepAliveService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const renderUrl = this.getSelfUrl();
    if (renderUrl) {
      this.logger.log(`[KeepAlive] 24/7 Heartbeat initialized for URL: ${renderUrl}`);
    } else {
      this.logger.log('[KeepAlive] Running in local environment (RENDER_EXTERNAL_URL not set).');
    }
  }

  private getSelfUrl(): string | null {
    return (
      process.env.RENDER_EXTERNAL_URL ||
      this.configService.get<string>('RENDER_EXTERNAL_URL') ||
      process.env.BACKEND_URL ||
      this.configService.get<string>('BACKEND_URL') ||
      null
    );
  }

  /**
   * Pings the server every 10 minutes to prevent Render from sleeping (free tier sleeps after 15m of inactivity).
   */
  @Cron('*/10 * * * *')
  async pingSelf() {
    const url = this.getSelfUrl();
    if (!url) {
      return;
    }

    try {
      const pingEndpoint = `${url.replace(/\/$/, '')}/health`;
      this.logger.log(`[KeepAlive] Sending 10-minute heartbeat ping to ${pingEndpoint}`);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(pingEndpoint, {
        method: 'GET',
        signal: controller.signal,
      }).catch(async () => {
        // Fallback to root endpoint if /health returns 404
        return fetch(`${url.replace(/\/$/, '')}/`, {
          method: 'GET',
          signal: controller.signal,
        });
      });

      clearTimeout(timeout);
      this.logger.log(`[KeepAlive] Heartbeat ping success. HTTP status: ${response?.status || 200}`);
    } catch (e: any) {
      this.logger.warn(`[KeepAlive] Heartbeat ping notice: ${e.message}`);
    }
  }
}

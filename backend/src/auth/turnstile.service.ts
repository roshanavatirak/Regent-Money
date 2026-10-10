import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);
  private readonly siteverifyUrl = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

  constructor(private readonly configService: ConfigService) {}

  /**
   * Validates a Cloudflare Turnstile token from client-side challenge.
   * If secret key is not set, it passes in dev environment with a warning.
   */
  async verifyToken(token?: string, remoteIp?: string): Promise<boolean> {
    const secretKey =
      this.configService.get<string>('CLOUDFLARE_TURNSTILE_SECRET_KEY') ||
      process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY;

    if (!secretKey) {
      this.logger.warn('CLOUDFLARE_TURNSTILE_SECRET_KEY not configured. Skipping challenge verification.');
      return true;
    }

    if (!token) {
      throw new BadRequestException('Cloudflare security verification token is required.');
    }


    try {
      const formData = new URLSearchParams();
      formData.append('secret', secretKey.trim());
      formData.append('response', token.trim());
      if (remoteIp) {
        formData.append('remoteip', remoteIp);
      }

      const res = await fetch(this.siteverifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const outcome = (await res.json()) as {
        success: boolean;
        'error-codes'?: string[];
        challenge_ts?: string;
        hostname?: string;
      };

      if (!outcome.success) {
        this.logger.warn(`Turnstile validation failed: ${JSON.stringify(outcome['error-codes'] || [])}`);
        throw new BadRequestException('Security check failed. Please refresh and try again.');
      }

      return true;
    } catch (err: any) {
      if (err instanceof BadRequestException) {
        throw err;
      }
      this.logger.error(`Error contacting Cloudflare Turnstile API: ${err.message}`);
      throw new BadRequestException('Security verification service unreachable. Please try again.');
    }
  }
}

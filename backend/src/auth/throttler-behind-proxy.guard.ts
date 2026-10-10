import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { timingSafeEqual } from 'crypto';

function safeEqual(given: any, expected: string | undefined): boolean {
  if (!expected || typeof given !== 'string') return false;
  const givenBuf = Buffer.from(given);
  const expectedBuf = Buffer.from(expected);
  if (givenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(givenBuf, expectedBuf);
}

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Only trust CF-Connecting-IP if the request proved it routed through Cloudflare
    // via a secret transform header (x-origin-auth) matching CF_ORIGIN_SECRET.
    // If CF_ORIGIN_SECRET is unset, it safely falls back to req.ip.
    const secret = process.env.CF_ORIGIN_SECRET;
    const viaCloudflare =
      !!secret && safeEqual(req.headers?.['x-origin-auth'], secret);

    return viaCloudflare && typeof req.headers?.['cf-connecting-ip'] === 'string'
      ? req.headers['cf-connecting-ip'].trim()
      : (req.ips?.length ? req.ips[0] : req.ip);
  }
}

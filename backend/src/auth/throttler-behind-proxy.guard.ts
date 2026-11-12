import { ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerLimitDetail } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';

function safeEqual(given: any, expected: string | undefined): boolean {
  if (!expected || typeof given !== 'string') return false;
  const givenBuf = Buffer.from(given);
  const expectedBuf = Buffer.from(expected);
  if (givenBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(givenBuf, expectedBuf);
}

/**
 * The caller's network address. CF-Connecting-IP is trusted only when the request proved it
 * came through Cloudflare (x-origin-auth matches CF_ORIGIN_SECRET); otherwise req.ip.
 */
export function clientIpOf(req: Record<string, any>): string {
  const secret = process.env.CF_ORIGIN_SECRET;
  const viaCloudflare = !!secret && safeEqual(req?.headers?.['x-origin-auth'], secret);
  const ip =
    viaCloudflare && typeof req.headers?.['cf-connecting-ip'] === 'string'
      ? req.headers['cf-connecting-ip'].trim()
      : (req?.ips?.length ? req.ips[0] : req?.ip);
  return String(ip || '');
}

/**
 * The user id inside a Bearer token, but only if the token's signature is genuine (expiry is
 * not checked here; the login guard does that). A forged token returns null, so nobody can
 * dodge the limit by inventing user ids.
 */
export function signedUserIdOf(req: Record<string, any>): string | null {
  const header = req?.headers?.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) return null;
  const secret = process.env.JWT_SECRET || 'default-jwt-secret-key-1234';
  try {
    const head = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    if (head?.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const sub = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))?.sub;
    return typeof sub === 'string' && sub ? sub : null;
  } catch {
    return null;
  }
}

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  /**
   * Signed-in requests are counted per user, so people sharing one mobile-network address
   * (very common in India) don't use up each other's allowance. Everything else (login,
   * signup, password reset) is counted per network address.
   */
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = signedUserIdOf(req);
    return userId ? `u:${userId}` : clientIpOf(req);
  }

  /**
   * 429 with a readable message and the wait in seconds in the body, so the app can
   * show "Too many attempts. Try again in 42s" without reading the Retry-After header
   * (which browsers hide from cross-origin fetches).
   */
  protected async throwThrottlingException(
    _context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const retryAfterSeconds = Math.max(1, Math.ceil(Number(detail.timeToBlockExpire || detail.timeToExpire) || 60));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        rateLimited: true,
        retryAfterSeconds,
        message: `Too many attempts. Try again in ${retryAfterSeconds}s.`,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

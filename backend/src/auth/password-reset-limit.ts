// Per-account limits for password reset emails, kept in Redis next to the reset tokens.
// The per-address throttle on the endpoint can't stop someone rotating addresses from
// flooding one person's inbox (and spending the day's email quota); this can.
//
// The rule, per account, counted over one day from the first email:
//   - emails 1–3 are sent;
//   - after the 3rd, a 2-hour cooldown;
//   - then emails 4–6 are sent;
//   - after the 6th, a 1-day cooldown, after which the count resets.

/** Emails before the first cooldown. */
export const RESET_FIRST_BATCH = 3;
/** Emails in a day before the day cooldown. */
export const RESET_DAILY_MAX = 6;
/** Cooldown after the first batch. */
export const RESET_FIRST_COOLDOWN_SECONDS = 2 * 60 * 60;
/** Cooldown after the daily maximum; the count resets with it. */
export const RESET_DAY_COOLDOWN_SECONDS = 24 * 60 * 60;
/** How long the count lives from the day's first email. */
export const RESET_COUNT_SECONDS = 24 * 60 * 60;
/** How long a reset link works. */
export const RESET_TOKEN_TTL_SECONDS = 15 * 60;

/**
 * The only reply forgot-password ever gives: the same whether the email is registered,
 * unknown, or held back by a limit, so the reply can't be used to find out who has an account.
 */
export const RESET_REQUEST_REPLY =
  'If an account exists for this email, we’ve sent a reset link. Check your inbox and spam folder. The link works for 15 minutes.';

export const resetTokenKey = (token: string) => `pwd_reset:${token}`;
export const resetLatestKey = (userId: string) => `pwd_reset_latest:${userId}`;
const sentKey = (userId: string) => `pwd_reset_sent:${userId}`;
const blockKey = (userId: string) => `pwd_reset_block:${userId}`;

export interface RedisCommander {
  executeCommand(command: (string | number)[]): Promise<any>;
}

export type ResetRefusal = 'cooldown' | 'day_lock';
export type ResetSlot = { allowed: true } | { allowed: false; reason: ResetRefusal; retryAfterSeconds: number };

const unreachable = (v: unknown) => v === null || v === undefined;

/**
 * Claims a reset email for this account, or says why not. If Redis can't be reached the request
 * is allowed: a broken cache must not lock people out of their accounts.
 */
export async function claimResetSlot(redis: RedisCommander, userId: string): Promise<ResetSlot> {
  const refusal = async (secondsLeft: number): Promise<ResetSlot> => {
    const sent = Number(await redis.executeCommand(['GET', sentKey(userId)])) || 0;
    return {
      allowed: false,
      reason: sent >= RESET_DAILY_MAX ? 'day_lock' : 'cooldown',
      retryAfterSeconds: secondsLeft,
    };
  };

  // 1. In a cooldown?
  const blockLeft = await redis.executeCommand(['TTL', blockKey(userId)]);
  if (unreachable(blockLeft)) return { allowed: true };
  if (Number(blockLeft) > 0) return refusal(Number(blockLeft));

  // 2. Count this email (INCR is atomic, so parallel requests get distinct numbers).
  const sent = Number(await redis.executeCommand(['INCR', sentKey(userId)]));
  if (!Number.isFinite(sent) || sent < 1) return { allowed: true };
  if (sent === 1) await redis.executeCommand(['EXPIRE', sentKey(userId), RESET_COUNT_SECONDS]);

  // A request that raced past step 1 while another one started a cooldown gives its number back.
  if (sent > RESET_DAILY_MAX) {
    await redis.executeCommand(['DECR', sentKey(userId)]);
    const left = Number(await redis.executeCommand(['TTL', blockKey(userId)]));
    return refusal(left > 0 ? left : RESET_DAY_COOLDOWN_SECONDS);
  }

  // 3. Start a cooldown after the 3rd and the 6th email (this email still goes out).
  if (sent === RESET_FIRST_BATCH) {
    await redis.executeCommand(['SET', blockKey(userId), '1', 'EX', RESET_FIRST_COOLDOWN_SECONDS]);
  } else if (sent === RESET_DAILY_MAX) {
    await redis.executeCommand(['SET', blockKey(userId), '1', 'EX', RESET_DAY_COOLDOWN_SECONDS]);
    // Keep the count for the whole day cooldown, so both end together and it starts over.
    await redis.executeCommand(['EXPIRE', sentKey(userId), RESET_DAY_COOLDOWN_SECONDS]);
  }
  return { allowed: true };
}

/**
 * Limits on verification emails, per account:
 *  - at least RESEND_GAP_MS between two emails to the same address
 *  - at most DAILY_MAX emails a day (UTC day), the signup email included
 * Enforced in one conditional UPDATE so two requests at the same moment can't both pass.
 */
export const RESEND_GAP_MS = 60_000;
export const DAILY_MAX = 5;

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function msUntilNextUtcDay(now: number): number {
  const d = new Date(now);
  d.setUTCHours(24, 0, 0, 0);
  return d.getTime() - now;
}

/** Why a send was refused, and how long until the next one is allowed. */
export function refusal(
  state: { lastSentAt: number | null; day: string | null; count: number | null },
  now: number,
): { reason: 'too_soon' | 'daily_cap'; retryAfterSeconds: number } | null {
  const today = utcDay(now);
  if (state.day === today && (state.count ?? 0) >= DAILY_MAX) {
    return { reason: 'daily_cap', retryAfterSeconds: Math.ceil(msUntilNextUtcDay(now) / 1000) };
  }
  if (state.lastSentAt && now - state.lastSentAt < RESEND_GAP_MS) {
    return { reason: 'too_soon', retryAfterSeconds: Math.ceil((RESEND_GAP_MS - (now - state.lastSentAt)) / 1000) };
  }
  return null;
}

/** Records a send and stores the new token, only if the limits allow it. Returns true when it did. */
export const CLAIM_SEND_SQL = `
  UPDATE core.users SET
    verification_token = $4,
    verification_last_sent_at = $2,
    verification_send_count = CASE WHEN verification_send_day = $3 THEN COALESCE(verification_send_count, 0) + 1 ELSE 1 END,
    verification_send_day = $3,
    updated_at = $2
  WHERE id = $1
    AND (verification_last_sent_at IS NULL OR verification_last_sent_at <= $2 - ${RESEND_GAP_MS})
    AND (verification_send_day IS DISTINCT FROM $3 OR COALESCE(verification_send_count, 0) < ${DAILY_MAX})
  RETURNING id;`;

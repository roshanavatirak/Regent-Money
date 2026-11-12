import { refusal, utcDay, DAILY_MAX, RESEND_GAP_MS, CLAIM_SEND_SQL } from './verification-limit';

describe('verification email limits', () => {
  const now = Date.UTC(2026, 10, 12, 10, 0, 0);

  it('allows the first email and one after the 60-second gap', () => {
    expect(refusal({ lastSentAt: null, day: null, count: null }, now)).toBeNull();
    expect(refusal({ lastSentAt: now - RESEND_GAP_MS, day: utcDay(now), count: 1 }, now)).toBeNull();
  });

  it('refuses inside the gap and says how long to wait', () => {
    expect(refusal({ lastSentAt: now - 15_000, day: utcDay(now), count: 1 }, now)).toEqual({ reason: 'too_soon', retryAfterSeconds: 45 });
  });

  it('refuses after 5 emails in a UTC day, until midnight UTC', () => {
    const r = refusal({ lastSentAt: now - 10 * 60_000, day: utcDay(now), count: DAILY_MAX }, now);
    expect(r?.reason).toBe('daily_cap');
    expect(r?.retryAfterSeconds).toBe(14 * 3600);
  });

  it('starts a new count on a new day', () => {
    expect(refusal({ lastSentAt: now - 24 * 3600_000, day: '2026-11-11', count: DAILY_MAX }, now)).toBeNull();
  });

  it('claims the send in one conditional UPDATE so parallel requests cannot both pass', () => {
    expect(CLAIM_SEND_SQL).toContain('WHERE id = $1');
    expect(CLAIM_SEND_SQL).toContain(`verification_last_sent_at <= $2 - ${RESEND_GAP_MS}`);
    expect(CLAIM_SEND_SQL).toContain(`COALESCE(verification_send_count, 0) < ${DAILY_MAX}`);
  });
});

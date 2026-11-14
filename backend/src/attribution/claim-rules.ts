import type { LinkType, ParsedReferrer, SourceType } from './referrer';

/**
 * The decision for one attribution claim, as a pure function of the facts.
 * AttributionService gathers the facts (database rows, Google's verdict) and stores the result.
 */

export const CLAIM_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // a new account has 7 days to be attributed
export const CLICK_TTL_MS = 90 * 24 * 60 * 60 * 1000; // Google Play keeps the referrer for 90 days
export const CLOCK_SKEW_MS = 10 * 60 * 1000;
export const DAILY_INVITE_LIMIT = 20; // more accepted invites than this in 24 h are held for review

export type IntegrityResult = 'passed' | 'failed' | 'unavailable' | 'not_required';
export type IntegrityMode = 'enforce' | 'off';
export type ClaimStatus = 'accepted' | 'rejected' | 'unverified' | 'review';

export interface ClaimFacts {
  parsed: ParsedReferrer;
  userId: string;
  userCreatedAt: number;
  now: number;
  /** When Google Play says the install began (ms), 0 if unknown. */
  installAt: number;
  link: { id: string; type: LinkType; ownerUserId: string | null; isActive: boolean } | null;
  click: { createdAt: number; claimedBy: string | null } | null;
  integrity: IntegrityResult;
  integrityMode: IntegrityMode;
  /** Invites already accepted for this inviter in the last 24 hours. */
  inviterAcceptedToday: number;
}

export interface ClaimDecision {
  sourceType: SourceType;
  linkId: string | null;
  status: ClaimStatus;
  reason: string | null;
  /** True when the one-time click token should be marked as used by this account. */
  consumeClick: boolean;
}

const reject = (sourceType: SourceType, linkId: string | null, reason: string): ClaimDecision => ({
  sourceType,
  linkId,
  status: 'rejected',
  reason,
  consumeClick: false,
});

export const decideClaim = (f: ClaimFacts): ClaimDecision => {
  // Organic, ads and anything else without one of our links: just record how they arrived.
  if (f.parsed.kind !== 'link') {
    return { sourceType: f.parsed.kind, linkId: null, status: 'accepted', reason: null, consumeClick: false };
  }

  if (!f.link || !f.link.isActive) return reject('unknown', null, 'unknown_link');
  const { link } = f;

  if (f.now - f.userCreatedAt > CLAIM_WINDOW_MS) return reject(link.type, link.id, 'late_claim');
  if (link.type === 'invite' && link.ownerUserId === f.userId) return reject(link.type, link.id, 'self_invite');

  // Every counted install must trace back to one real, unused link open that came first.
  if (!f.click) return reject(link.type, link.id, 'unknown_click');
  if (f.click.claimedBy && f.click.claimedBy !== f.userId) return reject(link.type, link.id, 'click_reused');
  if (f.now - f.click.createdAt > CLICK_TTL_MS) return reject(link.type, link.id, 'click_expired');
  if (f.installAt > 0 && f.installAt + CLOCK_SKEW_MS < f.click.createdAt) {
    return reject(link.type, link.id, 'install_before_click');
  }

  // Google must confirm the claim came from the real app, from Play, on a genuine device.
  if (f.integrity === 'failed') return reject(link.type, link.id, 'integrity_failed');
  if (f.integrity !== 'passed' && f.integrityMode === 'enforce') {
    // Not final: the app tries again later (Google unreachable, or not set up yet).
    return { sourceType: link.type, linkId: link.id, status: 'unverified', reason: 'integrity_unavailable', consumeClick: false };
  }

  if (link.type === 'invite' && f.inviterAcceptedToday >= DAILY_INVITE_LIMIT) {
    return { sourceType: link.type, linkId: link.id, status: 'review', reason: 'velocity', consumeClick: true };
  }

  return { sourceType: link.type, linkId: link.id, status: 'accepted', reason: null, consumeClick: true };
};

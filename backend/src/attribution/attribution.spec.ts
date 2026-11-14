import {
  buildReferrer,
  generateClickToken,
  generateInviteCode,
  integrityPayload,
  isPreviewBot,
  isValidCode,
  parseReferrer,
  playStoreUrl,
} from './referrer';
import { CLAIM_WINDOW_MS, CLICK_TTL_MS, ClaimFacts, DAILY_INVITE_LIMIT, decideClaim } from './claim-rules';
import { INTEGRITY_MAX_AGE_MS, verdictProblem } from './play-integrity.service';

const TOKEN = 'a'.repeat(32);

describe('link codes and referrer strings', () => {
  it('generates invite codes that are valid and free of look-alike characters', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode();
      expect(isValidCode(code)).toBe(true);
      expect(code).toHaveLength(8);
      expect(code).not.toMatch(/[01oil]/);
    }
    expect(generateClickToken()).toMatch(/^[a-f0-9]{32}$/);
  });

  it('round-trips our own link through the Play Store address', () => {
    const referrer = buildReferrer('rosh7k2m', TOKEN, 'invite');
    const url = new URL(playStoreUrl(referrer));
    expect(url.searchParams.get('id')).toBe('com.regentmoney');
    const parsed = parseReferrer(url.searchParams.get('referrer'));
    expect(parsed).toMatchObject({ kind: 'link', code: 'rosh7k2m', clickToken: TOKEN });
  });

  it('reads organic, paid, external and empty referrers', () => {
    expect(parseReferrer('utm_source=google-play&utm_medium=organic').kind).toBe('organic');
    expect(parseReferrer('gclid=abc123&utm_source=google').kind).toBe('paid_ads');
    expect(parseReferrer('utm_source=newsletter&utm_medium=email').kind).toBe('external');
    expect(parseReferrer('').kind).toBe('unknown');
    expect(parseReferrer(undefined).kind).toBe('unknown');
  });

  it('does not treat a code without a valid click token as a link', () => {
    expect(parseReferrer('rm=rosh7k2m').kind).toBe('unknown');
    expect(parseReferrer('rm=rosh7k2m&rc=not-a-token').kind).toBe('unknown');
    expect(parseReferrer(`rm=<script>&rc=${TOKEN}`).kind).toBe('unknown');
  });

  it('stores only a cleaned copy: never the ad click id or stray parameters', () => {
    const parsed = parseReferrer('gclid=SECRET-CLICK-ID&utm_source=goo gle&email=a@b.com');
    expect(parsed.sanitized).toBe('utm_source=google&ad_click=1');
    expect(parsed.sanitized).not.toContain('SECRET');
    expect(parsed.sanitized).not.toContain('email');
  });

  it('spots link-preview bots but not a phone browser', () => {
    expect(isPreviewBot('WhatsApp/2.23.20.0')).toBe(true);
    expect(isPreviewBot('facebookexternalhit/1.1')).toBe(true);
    expect(isPreviewBot('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36')).toBe(false);
  });

  it('binds the integrity hash to the user, nonce and referrer', () => {
    const base = integrityPayload('user-1', 'nonce', 'rm=x', 10, 5);
    expect(integrityPayload('user-2', 'nonce', 'rm=x', 10, 5)).not.toBe(base);
    expect(integrityPayload('user-1', 'other', 'rm=x', 10, 5)).not.toBe(base);
    expect(integrityPayload('user-1', 'nonce', 'rm=y', 10, 5)).not.toBe(base);
  });
});

describe('claim rules', () => {
  const now = Date.UTC(2026, 10, 14, 12, 0, 0);
  const facts = (over: Partial<ClaimFacts> = {}): ClaimFacts => ({
    parsed: parseReferrer(buildReferrer('rosh7k2m', TOKEN, 'invite')),
    userId: 'friend',
    userCreatedAt: now - 60_000,
    now,
    installAt: now - 120_000,
    link: { id: 'link-1', type: 'invite', ownerUserId: 'inviter', isActive: true },
    click: { createdAt: now - 300_000, claimedBy: null },
    integrity: 'passed',
    integrityMode: 'enforce',
    inviterAcceptedToday: 0,
    ...over,
  });

  it('accepts a genuine invite and uses up the click', () => {
    expect(decideClaim(facts())).toEqual({
      sourceType: 'invite',
      linkId: 'link-1',
      status: 'accepted',
      reason: null,
      consumeClick: true,
    });
  });

  it('records organic and ad installs without needing a link or integrity', () => {
    const d = decideClaim(facts({ parsed: parseReferrer('utm_source=google-play&utm_medium=organic'), link: null, click: null, integrity: 'not_required' }));
    expect(d).toMatchObject({ sourceType: 'organic', status: 'accepted', linkId: null, consumeClick: false });
  });

  it.each([
    ['unknown_link', { link: null }],
    ['unknown_link', { link: { id: 'link-1', type: 'invite' as const, ownerUserId: 'inviter', isActive: false } }],
    ['self_invite', { userId: 'inviter' }],
    ['late_claim', { userCreatedAt: now - CLAIM_WINDOW_MS - 1 }],
    ['unknown_click', { click: null }],
    ['click_reused', { click: { createdAt: now - 300_000, claimedBy: 'someone-else' } }],
    ['click_expired', { click: { createdAt: now - CLICK_TTL_MS - 1, claimedBy: null } }],
    ['install_before_click', { installAt: now - 3_600_000 }],
    ['integrity_failed', { integrity: 'failed' as const }],
  ])('rejects with %s', (reason, over) => {
    const d = decideClaim(facts(over as Partial<ClaimFacts>));
    expect(d.status).toBe('rejected');
    expect(d.reason).toBe(reason);
    expect(d.consumeClick).toBe(false);
  });

  it('never counts a link install that Google has not confirmed', () => {
    for (const integrity of ['unavailable', 'not_required'] as const) {
      const d = decideClaim(facts({ integrity }));
      expect(d.status).toBe('unverified');
      expect(d.consumeClick).toBe(false);
    }
  });

  it('only skips the Google check when the mode is off (development)', () => {
    expect(decideClaim(facts({ integrity: 'unavailable', integrityMode: 'off' })).status).toBe('accepted');
    expect(decideClaim(facts({ integrity: 'failed', integrityMode: 'off' })).status).toBe('rejected');
  });

  it('holds a burst of invites for review instead of counting them', () => {
    const d = decideClaim(facts({ inviterAcceptedToday: DAILY_INVITE_LIMIT }));
    expect(d).toMatchObject({ status: 'review', reason: 'velocity', consumeClick: true });
    expect(decideClaim(facts({ inviterAcceptedToday: DAILY_INVITE_LIMIT - 1 })).status).toBe('accepted');
  });

  it('lets the same account retry its own click', () => {
    expect(decideClaim(facts({ click: { createdAt: now - 300_000, claimedBy: 'friend' } })).status).toBe('accepted');
  });
});

describe('Play Integrity verdict', () => {
  const now = Date.UTC(2026, 10, 14, 12, 0, 0);
  const expectation = { packageName: 'com.regentmoney', requestHash: 'abc123', now };
  const good = () => ({
    requestDetails: { requestPackageName: 'com.regentmoney', requestHash: 'abc123', timestampMillis: String(now - 5_000) },
    appIntegrity: { appRecognitionVerdict: 'PLAY_RECOGNIZED', packageName: 'com.regentmoney', certificateSha256Digest: ['CERT'], versionCode: '148' },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
    accountDetails: { appLicensingVerdict: 'LICENSED' },
  });

  it('passes a genuine verdict', () => {
    expect(verdictProblem(good(), expectation)).toBeNull();
    expect(verdictProblem(good(), { ...expectation, certDigests: ['CERT'] })).toBeNull();
  });

  it.each([
    ['no_request_details', (v: any) => delete v.requestDetails],
    ['wrong_package', (v: any) => (v.requestDetails.requestPackageName = 'com.evil')],
    ['hash_mismatch', (v: any) => (v.requestDetails.requestHash = 'zzz999')],
    ['stale_token', (v: any) => (v.requestDetails.timestampMillis = String(now - INTEGRITY_MAX_AGE_MS - 1))],
    ['app_not_recognized', (v: any) => (v.appIntegrity.appRecognitionVerdict = 'UNRECOGNIZED_VERSION')],
    ['app_not_recognized', (v: any) => (v.appIntegrity.appRecognitionVerdict = 'UNEVALUATED')],
    ['wrong_app_package', (v: any) => (v.appIntegrity.packageName = 'com.evil')],
    ['device_not_genuine', (v: any) => (v.deviceIntegrity.deviceRecognitionVerdict = [])],
    ['device_not_genuine', (v: any) => (v.deviceIntegrity.deviceRecognitionVerdict = ['MEETS_BASIC_INTEGRITY'])],
    ['not_installed_from_play', (v: any) => (v.accountDetails.appLicensingVerdict = 'UNLICENSED')],
  ])('fails with %s', (reason, breakIt) => {
    const verdict = good();
    breakIt(verdict);
    expect(verdictProblem(verdict, expectation)).toBe(reason);
  });

  it('fails when the signing certificate is not on the allow-list', () => {
    expect(verdictProblem(good(), { ...expectation, certDigests: ['OTHER'] })).toBe('wrong_certificate');
  });

  it('fails an empty or missing verdict', () => {
    expect(verdictProblem(undefined, expectation)).toBe('no_request_details');
    expect(verdictProblem({}, expectation)).toBe('no_request_details');
  });
});

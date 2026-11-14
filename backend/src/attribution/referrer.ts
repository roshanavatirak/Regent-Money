import { randomBytes, randomInt } from 'crypto';

/**
 * Pure helpers for install attribution: link codes, the Play Store referrer string we
 * hand out, and reading back the string Google Play returns to the app after install.
 * No database or network here, so every rule can be unit tested.
 */

export const ANDROID_PACKAGE = 'com.regentmoney';

/** Lower-case letters and digits without look-alikes (0/o, 1/i/l). */
export const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const INVITE_CODE_LENGTH = 8;

export type LinkType = 'invite' | 'campaign';
export type SourceType = 'invite' | 'campaign' | 'paid_ads' | 'organic' | 'external' | 'unknown';

export const generateInviteCode = (): string => {
  let out = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return out;
};

/** One-time token minted per link open. 128 random bits, hex. */
export const generateClickToken = (): string => randomBytes(16).toString('hex');

export const normalizeCode = (raw: unknown): string => String(raw ?? '').trim().toLowerCase();

/** Invite codes and campaign slugs share one shape: 3 to 40 of a-z, 0-9 and hyphen. */
export const isValidCode = (code: string): boolean => /^[a-z0-9][a-z0-9-]{2,39}$/.test(code);

export const isValidClickToken = (token: string): boolean => /^[a-f0-9]{32}$/.test(token);

/** The referrer value Google Play passes through to the installed app, unchanged. */
export const buildReferrer = (code: string, clickToken: string, type: LinkType): string =>
  `rm=${code}&rc=${clickToken}&utm_source=regent&utm_medium=${type}`;

export const playStoreUrl = (referrer?: string): string => {
  const base = `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`;
  return referrer ? `${base}&referrer=${encodeURIComponent(referrer)}` : base;
};

/**
 * Link previews (chat apps fetching the page to draw a card) are not people opening the link.
 * They are redirected like anyone else but never get a click token, so they don't inflate counts.
 */
export const isPreviewBot = (userAgent: unknown): boolean =>
  /bot|crawler|spider|preview|facebookexternalhit|whatsapp|telegram|slack|discord|skype|linkedin|pinterest|embedly|curl|wget|python-requests|okhttp|headless/i.test(
    String(userAgent ?? ''),
  );

export type ParsedReferrer =
  | { kind: 'link'; code: string; clickToken: string; sanitized: string }
  | { kind: Exclude<SourceType, 'invite' | 'campaign'>; sanitized: string };

const safeValue = (v: string | null): string | null => {
  if (!v) return null;
  const cleaned = v.replace(/[^A-Za-z0-9_.\-]/g, '').slice(0, 64);
  return cleaned || null;
};

/**
 * Reads the referrer string the app got from Google Play.
 *
 * Only a short, cleaned copy is ever stored (`sanitized`): our own code, the utm_* labels,
 * and a marker that an ad click id was present. The ad click id itself is never kept.
 */
export const parseReferrer = (raw: unknown): ParsedReferrer => {
  let text = String(raw ?? '').trim().slice(0, 1024);
  if (!text) return { kind: 'unknown', sanitized: '' };

  // Google Play returns the value already decoded; tolerate one extra layer of encoding.
  if (!text.includes('=') && /%3d/i.test(text)) {
    try {
      text = decodeURIComponent(text);
    } catch {
      return { kind: 'unknown', sanitized: '' };
    }
  }

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(text);
  } catch {
    return { kind: 'unknown', sanitized: '' };
  }

  const source = safeValue(params.get('utm_source'));
  const medium = safeValue(params.get('utm_medium'));
  const campaign = safeValue(params.get('utm_campaign'));
  const hasAdClick = ['gclid', 'gbraid', 'wbraid'].some((key) => !!params.get(key));

  const kept: string[] = [];
  if (source) kept.push(`utm_source=${source}`);
  if (medium) kept.push(`utm_medium=${medium}`);
  if (campaign) kept.push(`utm_campaign=${campaign}`);
  if (hasAdClick) kept.push('ad_click=1');

  const code = normalizeCode(params.get('rm'));
  const clickToken = String(params.get('rc') ?? '').trim().toLowerCase();
  if (code && isValidCode(code) && isValidClickToken(clickToken)) {
    return { kind: 'link', code, clickToken, sanitized: [`rm=${code}`, ...kept].join('&') };
  }

  const sanitized = kept.join('&');
  if (hasAdClick || ['cpc', 'ppc', 'paid', 'paidsocial', 'display'].includes((medium || '').toLowerCase())) {
    return { kind: 'paid_ads', sanitized };
  }
  if ((medium || '').toLowerCase() === 'organic') return { kind: 'organic', sanitized };
  if (source) return { kind: 'external', sanitized };
  return { kind: 'unknown', sanitized };
};

/**
 * The exact text both the app and the server hash to bind a Play Integrity token to one
 * claim. If any part differs (another user, another referrer, a replayed nonce) the hash
 * inside Google's signed verdict will not match and the claim is refused.
 */
export const integrityPayload = (
  userId: string,
  nonce: string,
  rawReferrer: string,
  installAtSeconds: number,
  clickAtSeconds: number,
): string => ['v1', userId, nonce, rawReferrer, String(installAtSeconds), String(clickAtSeconds)].join('\n');

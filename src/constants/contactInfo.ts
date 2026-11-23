// Regent Money's public contact addresses and legal links.
//
// The live values come from the server (GET /app/contact) and are edited in the admin console,
// so they can change without an app update. These defaults are used on first launch, offline,
// or if the server sends something unusable.

export interface ContactInfo {
  /** Help & support, and the address shown for general help. */
  support: string;
  /** General and business enquiries. */
  contact: string;
  /** Privacy questions and account deletion requests. */
  privacy: string;
  /** Grievance contact named in the Privacy Policy. */
  grievance: string;
  /** Grievance Officer, e.g. "Name, Company". */
  grievanceOfficer: string;
  termsUrl: string;
  privacyUrl: string;
  deleteAccountUrl: string;
}

export const DEFAULT_CONTACT_INFO: ContactInfo = {
  support: 'support@raodevstudios.in',
  contact: 'contact@raodevstudios.in',
  privacy: 'privacy@raodevstudios.in',
  grievance: 'privacy@raodevstudios.in',
  grievanceOfficer: 'Roshan Avatirak, RAO Dev Studios',
  termsUrl: 'https://raodevstudios.in/terms',
  privacyUrl: 'https://raodevstudios.in/privacy',
  deleteAccountUrl: 'https://raodevstudios.in/regent-money/delete-account',
};

const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;
const isEmail = (v: unknown): v is string => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v.trim());
const isHttpsUrl = (v: unknown): v is string => typeof v === 'string' && /^https:\/\/\S+$/i.test(v.trim());

/**
 * Reads a server or cached value field by field: anything missing or malformed keeps the
 * default, so the app never shows a blank or broken address.
 */
export function parseContactInfo(raw: unknown): ContactInfo {
  const out: ContactInfo = { ...DEFAULT_CONTACT_INFO };
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  for (const k of ['support', 'contact', 'privacy', 'grievance'] as const) {
    if (isEmail(r[k])) out[k] = (r[k] as string).trim();
  }
  for (const k of ['termsUrl', 'privacyUrl', 'deleteAccountUrl'] as const) {
    if (isHttpsUrl(r[k])) out[k] = (r[k] as string).trim();
  }
  if (typeof r.grievanceOfficer === 'string' && r.grievanceOfficer.trim()) {
    out.grievanceOfficer = r.grievanceOfficer.trim().slice(0, 120);
  }
  return out;
}

/** A mailto: link with an optional subject and body, safely encoded. */
export function mailtoUrl(email: string, subject?: string, body?: string): string {
  const params = [
    subject ? `subject=${encodeURIComponent(subject)}` : '',
    body ? `body=${encodeURIComponent(body)}` : '',
  ].filter(Boolean);
  return `mailto:${email}${params.length ? `?${params.join('&')}` : ''}`;
}

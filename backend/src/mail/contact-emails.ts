/**
 * Regent Money's public contact addresses. Stored in core.email_settings under CONTACT_EMAILS_KEY
 * and edited from the admin console, so changing one needs no code change or redeploy.
 * The app reads them from GET /app/contact; emails use `support` for Reply-To and the footer.
 *
 * The address emails are SENT from is not here: Brevo only sends from verified senders, so that
 * stays in the BREVO_*_SENDER_EMAIL environment settings.
 */
export interface ContactEmails {
  /** Help in the app, Reply-To on every email, the verification pages. */
  support: string;
  /** General and business enquiries. */
  contact: string;
  /** Privacy questions and account deletion requests. */
  privacy: string;
  /** Grievance contact named in the Privacy Policy (IT Rules 2021 / DPDP Act). */
  grievance: string;
  /** Grievance Officer shown next to it, e.g. "Name, Company". */
  grievanceOfficer: string;
}

export const CONTACT_EMAILS_KEY = 'contact_emails';

export const DEFAULT_CONTACT_EMAILS: ContactEmails = {
  support: 'support@raodevstudios.in',
  contact: 'contact@raodevstudios.in',
  privacy: 'privacy@raodevstudios.in',
  grievance: 'privacy@raodevstudios.in',
  grievanceOfficer: 'Roshan Avatirak, RAO Dev Studios',
};

const EMAIL_FIELDS = ['support', 'contact', 'privacy', 'grievance'] as const;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;

export const isContactEmail = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v.trim());

/**
 * Reads a stored value: each valid field is kept, anything missing or broken falls back to its
 * default, so a bad row can never blank out a contact address.
 */
export function readContactEmails(stored: unknown): ContactEmails {
  const out: ContactEmails = { ...DEFAULT_CONTACT_EMAILS };
  if (!stored || typeof stored !== 'object') return out;
  const s = stored as Record<string, unknown>;
  for (const f of EMAIL_FIELDS) {
    const v = s[f];
    if (isContactEmail(v)) out[f] = v.trim().toLowerCase();
  }
  if (typeof s.grievanceOfficer === 'string' && s.grievanceOfficer.trim()) {
    out.grievanceOfficer = s.grievanceOfficer.trim().slice(0, 120);
  }
  return out;
}

/**
 * Checks an admin edit. Returns the cleaned value, or the list of problems
 * (one plain sentence per bad field) when anything is wrong.
 */
export function validateContactEmails(
  input: unknown,
): { ok: true; value: ContactEmails } | { ok: false; errors: string[] } {
  if (!input || typeof input !== 'object')
    return { ok: false, errors: ['Send the contact addresses.'] };
  const s = input as Record<string, unknown>;
  const errors: string[] = [];
  for (const f of EMAIL_FIELDS) {
    if (!isContactEmail(s[f]))
      errors.push(`${f} must be a valid email address.`);
  }
  const officer =
    typeof s.grievanceOfficer === 'string' ? s.grievanceOfficer.trim() : '';
  if (!officer) errors.push('grievanceOfficer must not be empty.');
  else if (officer.length > 120)
    errors.push('grievanceOfficer must be 120 characters or fewer.');
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: readContactEmails({ ...s, grievanceOfficer: officer }),
  };
}

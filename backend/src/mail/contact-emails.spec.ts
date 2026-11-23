import {
  DEFAULT_CONTACT_EMAILS,
  readContactEmails,
  validateContactEmails,
} from './contact-emails';

describe('contact addresses', () => {
  it('starts with the studio addresses', () => {
    expect(DEFAULT_CONTACT_EMAILS).toEqual({
      support: 'support@raodevstudios.in',
      contact: 'contact@raodevstudios.in',
      privacy: 'privacy@raodevstudios.in',
      grievance: 'privacy@raodevstudios.in',
      grievanceOfficer: 'Roshan Avatirak, RAO Dev Studios',
    });
  });

  it('falls back to the defaults when nothing is stored', () => {
    expect(readContactEmails(null)).toEqual(DEFAULT_CONTACT_EMAILS);
    expect(readContactEmails('junk')).toEqual(DEFAULT_CONTACT_EMAILS);
  });

  it('keeps valid stored fields and replaces only the broken ones', () => {
    const v = readContactEmails({
      support: ' Help@Example.com ',
      privacy: 'not-an-email',
      grievanceOfficer: '  A. Person  ',
    });
    expect(v.support).toBe('help@example.com');
    expect(v.privacy).toBe(DEFAULT_CONTACT_EMAILS.privacy);
    expect(v.contact).toBe(DEFAULT_CONTACT_EMAILS.contact);
    expect(v.grievanceOfficer).toBe('A. Person');
  });

  it('accepts a full, valid edit', () => {
    const r = validateContactEmails({
      ...DEFAULT_CONTACT_EMAILS,
      grievance: 'grievance@raodevstudios.in',
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.grievance).toBe('grievance@raodevstudios.in');
  });

  it('rejects bad or missing fields with one message each', () => {
    const r = validateContactEmails({
      support: 'nope',
      contact: '',
      privacy: 'a@b.co',
      grievance: 'x@y',
      grievanceOfficer: ' ',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors).toEqual([
        'support must be a valid email address.',
        'contact must be a valid email address.',
        'grievance must be a valid email address.',
        'grievanceOfficer must not be empty.',
      ]);
    }
    expect(validateContactEmails(null).ok).toBe(false);
  });

  it('rejects addresses that could break an email header or link', () => {
    for (const bad of [
      'a@b.com, c@d.com',
      '"x"@y.com',
      'a <b@c.com>',
      'a@b.com;x',
    ]) {
      expect(
        validateContactEmails({ ...DEFAULT_CONTACT_EMAILS, support: bad }).ok,
      ).toBe(false);
    }
  });
});

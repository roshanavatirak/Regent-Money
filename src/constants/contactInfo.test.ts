import assert from 'node:assert';
import { test } from 'node:test';
import { DEFAULT_CONTACT_INFO, mailtoUrl, parseContactInfo } from './contactInfo.ts';
import { buildPrivacy, buildTerms, PRIVACY, TERMS } from './legalContent.ts';

const allText = (doc: ReturnType<typeof buildTerms>) =>
  JSON.stringify(doc.sections.map((s) => [s.paragraphs, s.points]));

test('defaults are the studio addresses, never a personal inbox', () => {
  assert.equal(DEFAULT_CONTACT_INFO.support, 'support@raodevstudios.in');
  assert.equal(DEFAULT_CONTACT_INFO.privacy, 'privacy@raodevstudios.in');
  assert.ok(!allText(TERMS).includes('gmail.com'));
  assert.ok(!allText(PRIVACY).includes('gmail.com'));
});

test('server values replace defaults field by field; bad ones are ignored', () => {
  const info = parseContactInfo({
    support: 'help@example.com',
    privacy: 'not an email',
    privacyUrl: 'http://insecure.example.com',
    grievanceOfficer: '  A. Person, Co  ',
  });
  assert.equal(info.support, 'help@example.com');
  assert.equal(info.privacy, DEFAULT_CONTACT_INFO.privacy);
  assert.equal(info.privacyUrl, DEFAULT_CONTACT_INFO.privacyUrl);
  assert.equal(info.grievanceOfficer, 'A. Person, Co');
  assert.deepEqual(parseContactInfo(null), DEFAULT_CONTACT_INFO);
});

test('the Privacy policy and Terms show the current addresses', () => {
  const c = { ...DEFAULT_CONTACT_INFO, privacy: 'p@x.in', grievance: 'g@x.in', support: 's@x.in', grievanceOfficer: 'Officer Name' };
  const privacy = allText(buildPrivacy(c));
  assert.ok(privacy.includes('p@x.in'));
  assert.ok(privacy.includes('g@x.in'));
  assert.ok(privacy.includes('Grievance Officer: Officer Name'));
  assert.ok(allText(buildTerms(c)).includes('Questions about these terms: s@x.in'));
});

test('mailto links are encoded', () => {
  assert.equal(mailtoUrl('a@b.in'), 'mailto:a@b.in');
  assert.equal(mailtoUrl('a@b.in', 'Hi & bye', 'Line 1\nLine 2'), 'mailto:a@b.in?subject=Hi%20%26%20bye&body=Line%201%0ALine%202');
});

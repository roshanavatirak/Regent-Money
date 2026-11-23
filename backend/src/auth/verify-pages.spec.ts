import { renderVerifyPage } from './verify-pages';

describe('verification link pages', () => {
  const token = 'a'.repeat(64);

  it('verified: greets by first name, shows the email and opens the app by itself', () => {
    const html = renderVerifyPage({
      kind: 'verified',
      name: 'Aarav Sharma',
      email: 'aarav.s@gmail.com',
    });
    expect(html).toContain('You’re verified');
    expect(html).toContain('Welcome to Regent Money, Aarav.');
    expect(html).toContain('aarav.s@gmail.com');
    expect(html).toContain('Open Regent Money');
    expect(html).toContain('setTimeout(function(){openApp();},400)');
  });

  it('verified without a name still reads well', () => {
    expect(
      renderVerifyPage({ kind: 'verified', name: '', email: '' }),
    ).toContain('Welcome to Regent Money. Your account');
  });

  it('expired: posts the token to the resend endpoint and does not open the app by itself', () => {
    const html = renderVerifyPage({ kind: 'expired', token });
    expect(html).toContain('This link expired');
    expect(html).toContain('action="/auth/verify/resend"');
    expect(html).toContain(`name="token" value="${token}"`);
    expect(html).toContain('Email me a new link');
    expect(html).not.toContain('openApp();},400)');
  });

  it('invalid: says the link was used and points to log in, never "failed"', () => {
    const html = renderVerifyPage({ kind: 'invalid' });
    expect(html).toContain('Link already used');
    expect(html).toContain('Log in to Regent Money');
    expect(html).not.toMatch(/failed/i);
  });

  it('resent and notSent pages', () => {
    expect(renderVerifyPage({ kind: 'resent' })).toContain('Check your inbox');
    const html = renderVerifyPage({
      kind: 'notSent',
      message: 'Please wait 30 seconds before asking for another link.',
    });
    expect(html).toContain('Couldn’t send a new link');
    expect(html).toContain('Please wait 30 seconds');
  });

  it('escapes everything that comes from the account or the request', () => {
    const html = renderVerifyPage({
      kind: 'verified',
      name: '<script>x</script>',
      email: '"><img src=x>',
    });
    expect(html).not.toContain('<script>x</script>');
    expect(html).not.toContain('"><img src=x>');
    const exp = renderVerifyPage({ kind: 'expired', token: '"><b>' });
    expect(exp).not.toContain('"><b>');
  });

  it('is marked noindex and fits phones', () => {
    const html = renderVerifyPage({ kind: 'invalid' });
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('width=device-width');
  });
});

describe('verification pages: support link', () => {
  it('shows "Contact support" on pages that need help, not on the verified page', () => {
    const opts = { supportEmail: 'support@raodevstudios.in' };
    expect(renderVerifyPage({ kind: 'invalid' }, opts)).toContain(
      'href="mailto:support@raodevstudios.in">Contact support</a>',
    );
    expect(
      renderVerifyPage({ kind: 'expired', token: 'a'.repeat(64) }, opts),
    ).toContain('Contact support');
    expect(
      renderVerifyPage({ kind: 'verified', name: 'A', email: 'a@b.co' }, opts),
    ).not.toContain('Contact support');
  });

  it('leaves the link out without a usable address', () => {
    expect(renderVerifyPage({ kind: 'invalid' })).not.toContain(
      'Contact support',
    );
    expect(
      renderVerifyPage({ kind: 'invalid' }, { supportEmail: '"><x>' }),
    ).not.toContain('Contact support');
  });
});

import { markdownToEmailHtml, renderEmail } from './email-layout';

describe('email layout', () => {
  it('escapes HTML so a name or message cannot inject markup', () => {
    const html = markdownToEmailHtml('Hi <script>alert(1)</script>,');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('turns a [button: …](url) line into a button and ignores unsafe links', () => {
    expect(markdownToEmailHtml('[button: Update now](https://play.google.com/store/apps/details?id=com.regentmoney)')).toContain(
      'href="https://play.google.com/store/apps/details?id=com.regentmoney"',
    );
    const bad = markdownToEmailHtml('[click](javascript:alert(1))');
    expect(bad).not.toContain('javascript:');
  });

  it('renders "- " lines as one bordered list with bold text', () => {
    const html = markdownToEmailHtml('- **Faster SMS sync** New messages sooner\n- **Cash wallet** Track cash');
    expect(html.match(/<tr>/g)?.length).toBe(2);
    expect(html).toContain('<strong');
  });

  it('shows the unsubscribe link only when one is given', () => {
    const base = { logoUrl: 'https://x/logo.png', title: 'T', bodyHtml: '', footerReason: 'Why' };
    expect(renderEmail({ ...base, unsubscribeUrl: 'https://x/u' })).toContain('Unsubscribe');
    expect(renderEmail(base)).not.toContain('Unsubscribe');
    expect(renderEmail(base)).toContain('© ');
    expect(renderEmail(base)).toContain('Regent Money');
  });
});

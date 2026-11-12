/**
 * One clean layout for every Regent Money email (sign-in and broadcast):
 * logo row on a light grey ground, a single white card, small grey footer.
 * Table-based with inline styles so it holds up in Gmail, Outlook and Apple Mail.
 */

export const EMAIL_COLORS = {
  ground: '#F3F6F4',
  card: '#FFFFFF',
  line: '#E1E9E4',
  divider: '#EEF3F0',
  ink: '#0E1F17',
  body: '#3C4A43',
  sub: '#5B6B63',
  muted: '#6B7A72',
  forest: '#0B3D2C',
  link: '#0B6B3A',
  soft: '#F7FAF8',
};

const FONT = "Figtree,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const isSafeUrl = (u: string) => /^(https?:\/\/|mailto:)/i.test(u.trim());

/* ---------------- building blocks ---------------- */

export function paragraph(html: string, opts: { size?: number; color?: string } = {}): string {
  return `<p style="margin:0 0 18px;font-family:${FONT};font-size:${opts.size ?? 15}px;line-height:${(opts.size ?? 15) + 9}px;color:${opts.color ?? EMAIL_COLORS.body};">${html}</p>`;
}

export function button(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;"><tr>
<td style="border-radius:8px;background:${EMAIL_COLORS.forest};">
<a href="${escapeHtml(url)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:8px;">${escapeHtml(text)}</a>
</td></tr></table>`;
}

/** Grey box with a short note (used for "Didn't ask for this?" and Markdown "> " quotes). */
export function noteBox(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;"><tr>
<td style="background:${EMAIL_COLORS.ground};border-radius:10px;padding:14px 16px;font-family:${FONT};font-size:13px;line-height:20px;color:${EMAIL_COLORS.body};">${html}</td>
</tr></table>`;
}

/** Bordered list, one row per item (Markdown "- " lists). */
export function itemList(itemsHtml: string[]): string {
  const rows = itemsHtml
    .map(
      (item, i) => `<tr><td style="padding:13px 16px;${i > 0 ? `border-top:1px solid ${EMAIL_COLORS.divider};` : ''}font-family:${FONT};font-size:14px;line-height:22px;color:${EMAIL_COLORS.body};">${item}</td></tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;border:1px solid ${EMAIL_COLORS.line};border-radius:10px;border-collapse:separate;">${rows}</table>`;
}

export function divider(): string {
  return `<div style="height:1px;background:${EMAIL_COLORS.divider};margin:4px 0 18px;line-height:1px;font-size:1px;">&nbsp;</div>`;
}

/** "Button not working? Paste this link…" block for sign-in emails. */
export function fallbackLink(url: string): string {
  return (
    divider() +
    paragraph('Button not working? Paste this link into your browser:', { size: 13, color: EMAIL_COLORS.sub }).replace('margin:0 0 18px', 'margin:0 0 4px') +
    `<p style="margin:0 0 18px;font-family:${FONT};font-size:13px;line-height:20px;word-break:break-all;"><a href="${escapeHtml(url)}" style="color:${EMAIL_COLORS.link};">${escapeHtml(url)}</a></p>`
  );
}

/* ---------------- Markdown for broadcasts ---------------- */

function inline(text: string): string {
  // text is already HTML-escaped
  return text
    .replace(/\*\*(.+?)\*\*/g, `<strong style="font-weight:600;color:${EMAIL_COLORS.ink};">$1</strong>`)
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+?)\]\(([^)\s]+?)\)/g, (_m, label, url) => {
      const raw = url.replace(/&amp;/g, '&');
      return isSafeUrl(raw) ? `<a href="${url}" style="color:${EMAIL_COLORS.link};font-weight:600;">${label}</a>` : label;
    });
}

/**
 * Markdown subset used by the admin composer:
 *  - blank line = new paragraph, single newline = line break
 *  - "## Heading"
 *  - "- item" lines = bordered list
 *  - "> note" = grey note box
 *  - "[button: Text](https://…)" on its own line = green button
 *  - **bold**, *italic*, [link](https://…)
 * Everything is HTML-escaped first.
 */
export function markdownToEmailHtml(md: string): string {
  if (!md) return '';
  const blocks = md.replace(/\r\n/g, '\n').trim().split(/\n\s*\n/);
  return blocks
    .map((block) => {
      const lines = block.split('\n').map((l) => l.trimEnd());
      const trimmed = block.trim();

      const btn = trimmed.match(/^\[button:\s*(.+?)\]\((\S+?)\)$/i);
      if (btn && isSafeUrl(btn[2])) return button(btn[1], btn[2]);

      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
        return itemList(lines.map((l) => inline(escapeHtml(l.replace(/^\s*[-*]\s+/, '')))));
      }

      if (lines.every((l) => /^\s*>\s?/.test(l))) {
        return noteBox(lines.map((l) => inline(escapeHtml(l.replace(/^\s*>\s?/, '')))).join('<br>'));
      }

      const heading = trimmed.match(/^#{1,3}\s+(.+)$/);
      if (heading && lines.length === 1) {
        return `<h2 style="margin:6px 0 12px;font-family:${FONT};font-size:18px;line-height:26px;font-weight:700;color:${EMAIL_COLORS.ink};">${inline(escapeHtml(heading[1]))}</h2>`;
      }

      return paragraph(lines.map((l) => inline(escapeHtml(l))).join('<br>'));
    })
    .join('\n');
}

/* ---------------- full email ---------------- */

export interface EmailFrameOptions {
  logoUrl: string;
  /** Hidden inbox preview text. */
  preheader?: string;
  /** Small uppercase label above the title, e.g. "Product update". */
  label?: string | null;
  labelTone?: 'brand' | 'neutral';
  title: string;
  /** Inner HTML of the card below the title. */
  bodyHtml: string;
  /** Why the person got this email (first footer line, plain text). */
  footerReason: string;
  unsubscribeUrl?: string | null;
  termsUrl?: string | null;
  privacyUrl?: string | null;
}

export function renderEmail(o: EmailFrameOptions): string {
  const c = EMAIL_COLORS;
  const label = o.label
    ? `<p style="margin:0 0 8px;font-family:${FONT};font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:${o.labelTone === 'neutral' ? c.sub : c.link};">${escapeHtml(o.label)}</p>`
    : '';
  const unsub = o.unsubscribeUrl
    ? ` <a href="${escapeHtml(o.unsubscribeUrl)}" style="color:${c.muted};text-decoration:underline;">Unsubscribe</a>`
    : '';
  const legalLinks = [
    o.privacyUrl ? `<a href="${escapeHtml(o.privacyUrl)}" style="color:${c.muted};">Privacy policy</a>` : '',
    o.termsUrl ? `<a href="${escapeHtml(o.termsUrl)}" style="color:${c.muted};">Terms</a>` : '',
  ]
    .filter(Boolean)
    .join('&nbsp;&nbsp;·&nbsp;&nbsp;');
  const year = new Date().getFullYear();
  const copyright = `© ${year} Regent Money`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(o.title)}</title>
</head>
<body style="margin:0;padding:0;background:${c.ground};-webkit-font-smoothing:antialiased;">
${o.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(o.preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${c.ground};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

<tr><td style="padding:0 4px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="vertical-align:middle;"><img src="${escapeHtml(o.logoUrl)}" width="32" height="32" alt="Regent Money" style="display:block;width:32px;height:32px;border-radius:8px;border:0;"></td>
<td style="vertical-align:middle;padding-left:10px;font-family:${FONT};font-size:16px;font-weight:700;color:${c.ink};">Regent Money</td>
</tr></table>
</td></tr>

<tr><td style="background:${c.card};border:1px solid ${c.line};border-radius:12px;padding:36px 36px 18px;">
${label}
<h1 style="margin:0 0 18px;font-family:${FONT};font-size:24px;line-height:32px;font-weight:700;letter-spacing:-0.3px;color:${c.ink};">${escapeHtml(o.title)}</h1>
${o.bodyHtml}
</td></tr>

<tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${c.muted};">
<p style="margin:0 0 6px;">${escapeHtml(o.footerReason)}${unsub}</p>
${legalLinks ? `<p style="margin:0 0 6px;">${legalLinks}</p>` : ''}
<p style="margin:0;">${copyright}</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Backend and logo address, from env. Legal links live in core.email_settings (EmailAccountsService.getLegalLinks). */
export function emailEnv(get: (k: string) => string | undefined) {
  const clean = (v?: string) => (v || '').replace(/^["']|["']$/g, '').trim();
  const backendUrl = (clean(get('BACKEND_URL')) || clean(process.env.RENDER_EXTERNAL_URL) || 'http://localhost:3000').replace(/\/+$/, '');
  return {
    backendUrl,
    logoUrl: clean(get('EMAIL_LOGO_URL')) || `${backendUrl}/auth/email-logo.png`,
  };
}

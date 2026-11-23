/**
 * The pages a verification link opens in the browser, in the app's look ("Mint Calm"):
 * mint page, forest and lime, Bricolage headings, Figtree text, one glowing orb, one button.
 *
 *  verified   the email is confirmed; also tries to open the app by itself
 *  expired    older than 15 minutes; offers "Email me a new link" (POST /auth/verify/resend)
 *  invalid    already used, replaced by a newer email, or not a real link
 *  resent     a fresh link is on its way
 *  notSent    the fresh link was refused (too soon, daily limit, link no longer valid)
 */
import { escapeHtml } from '../mail/email-layout';

export type VerifyPage =
  | { kind: 'verified'; name: string; email: string }
  | { kind: 'expired'; token: string }
  | { kind: 'invalid' }
  | { kind: 'resent' }
  | { kind: 'notSent'; message: string };

const APP_LOGIN_INTENT =
  'intent://login#Intent;scheme=regentmoney;package=com.regentmoney;end';
const APP_LOGIN_URL = 'regentmoney://login';

type Tone = 'lime' | 'amber' | 'mint';

const ORB: Record<
  Tone,
  { outer: string; middle: string; inner: string; stroke: string }
> = {
  lime: {
    outer: 'rgba(184,243,107,.18)',
    middle: 'rgba(184,243,107,.38)',
    inner: '#B8F36B',
    stroke: '#0B3D2C',
  },
  amber: {
    outer: 'rgba(242,184,75,.14)',
    middle: 'rgba(242,184,75,.26)',
    inner: '#FFE3A6',
    stroke: '#7A4F00',
  },
  mint: {
    outer: 'rgba(11,61,44,.05)',
    middle: 'rgba(11,61,44,.08)',
    inner: '#E3F2E8',
    stroke: '#0B3D2C',
  },
};

const ICONS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7l8 6 8-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16v.5"/>',
};

const ARROW =
  '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#B8F36B" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

function orb(tone: Tone, icon: keyof typeof ICONS): string {
  const o = ORB[tone];
  const width = icon === 'check' ? 3 : 2.1;
  return `<div class="orb" style="background:${o.outer}"><div class="orb2" style="background:${o.middle}"><div class="orb3" style="background:${o.inner}"><svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="${o.stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${ICONS[icon]}</svg></div></div></div>`;
}

const openAppButton = (label: string) =>
  `<a class="cta" href="${APP_LOGIN_INTENT}" onclick="return openApp(event)">${escapeHtml(label)}${ARROW}</a>`;

function body(page: VerifyPage): {
  title: string;
  html: string;
  autoOpen: boolean;
} {
  switch (page.kind) {
    case 'verified': {
      const first = (page.name || '').trim().split(/\s+/)[0];
      return {
        title: 'Email verified',
        autoOpen: true,
        html:
          orb('lime', 'check') +
          `<h1>You’re verified</h1>` +
          `<p class="lead">Welcome to Regent Money${first ? `, ${escapeHtml(first)}` : ''}. Your account is ready to use.</p>` +
          (page.email
            ? `<div class="pill"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#2F7A3D" stroke-width="3" stroke-linecap="round"><path d="M5 12l5 5 9-10"/></svg>${escapeHtml(page.email)}</div>`
            : '') +
          `<div class="grow"></div>` +
          openAppButton('Open Regent Money') +
          `<p class="small" id="opening">Opening the app for you…</p>`,
      };
    }
    case 'expired':
      return {
        title: 'Link expired',
        autoOpen: false,
        html:
          orb('amber', 'clock') +
          `<h1>This link expired</h1>` +
          `<p class="lead">Links last 15 minutes to keep your account safe. A fresh one takes seconds.</p>` +
          `<div class="grow"></div>` +
          `<form method="post" action="/auth/verify/resend">` +
          `<input type="hidden" name="token" value="${escapeHtml(page.token)}">` +
          `<button class="cta" type="submit">Email me a new link${ARROW}</button>` +
          `</form>` +
          `<p class="small">We’ll send it to the same address.</p>`,
      };
    case 'resent':
      return {
        title: 'New link sent',
        autoOpen: false,
        html:
          orb('lime', 'mail') +
          `<h1>Check your inbox</h1>` +
          `<p class="lead">We sent a new verification link. It works for 15 minutes. Can’t find it? Check Spam or Promotions.</p>` +
          `<div class="grow"></div>` +
          openAppButton('Open Regent Money'),
      };
    case 'notSent':
      return {
        title: 'Couldn’t send a new link',
        autoOpen: false,
        html:
          orb('amber', 'info') +
          `<h1>Couldn’t send a new link</h1>` +
          `<p class="lead">${escapeHtml(page.message)}</p>` +
          `<div class="grow"></div>` +
          openAppButton('Open Regent Money'),
      };
    case 'invalid':
    default:
      return {
        title: 'Link already used',
        autoOpen: false,
        html:
          orb('mint', 'link') +
          `<h1>Link already used</h1>` +
          `<p class="lead">If you’ve confirmed your email, you’re all set. Asked for a new email? Use the newest link.</p>` +
          `<div class="grow"></div>` +
          openAppButton('Log in to Regent Money'),
      };
  }
}

/**
 * `supportEmail` adds "Need help? Contact support" under the button on every page except the
 * verified one (nothing to fix there).
 */
export function renderVerifyPage(
  page: VerifyPage,
  opts: { supportEmail?: string | null } = {},
): string {
  const { title, html, autoOpen } = body(page);
  const support =
    page.kind !== 'verified' &&
    opts.supportEmail &&
    /^[^\s@<>"]+@[^\s@<>"]+$/.test(opts.supportEmail)
      ? `<p class="small">Need help? <a href="mailto:${escapeHtml(opts.supportEmail)}">Contact support</a></p>`
      : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#F3F6F4">
<title>${escapeHtml(title)} · Regent Money</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}
html,body{margin:0;min-height:100%;background:#F3F6F4}
body{font-family:Figtree,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0B1F17;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.ring{position:fixed;border-radius:50%;border:1px solid rgba(11,61,44,.07);pointer-events:none}
main{position:relative;min-height:100vh;min-height:100dvh;max-width:440px;margin:0 auto;padding:calc(env(safe-area-inset-top) + 40px) 24px calc(env(safe-area-inset-bottom) + 28px);display:flex;flex-direction:column;align-items:center;text-align:center}
.logo{font-family:'Bricolage Grotesque',Figtree,sans-serif;font-weight:800;font-size:17px;color:#0B1F17}
.logo span{color:#3E9B4F}
.orb{margin-top:clamp(40px,10vh,84px);width:168px;height:168px;border-radius:84px;display:flex;align-items:center;justify-content:center;animation:pop .5s cubic-bezier(.34,1.56,.64,1) both}
.orb2{width:120px;height:120px;border-radius:60px;display:flex;align-items:center;justify-content:center}
.orb3{width:78px;height:78px;border-radius:39px;display:flex;align-items:center;justify-content:center}
h1{font-family:'Bricolage Grotesque',Figtree,sans-serif;font-weight:800;font-size:34px;line-height:1.05;letter-spacing:-.5px;margin:34px 0 0}
.lead{font-size:15.5px;line-height:1.5;color:#5B6B63;margin:12px 8px 0;max-width:340px}
.pill{margin-top:18px;display:inline-flex;align-items:center;gap:8px;max-width:100%;padding:9px 14px;border-radius:999px;background:#fff;border:1px solid #E1E9E4;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.grow{flex:1;min-height:40px}
form{width:100%;margin:0}
.cta{width:100%;height:56px;border:0;border-radius:999px;background:#0B3D2C;color:#B8F36B;font:700 16px Figtree,sans-serif;text-decoration:none;display:flex;align-items:center;justify-content:center;gap:10px;cursor:pointer;box-shadow:0 14px 26px -14px rgba(11,61,44,.75);transition:transform .15s ease}
.cta:active{transform:scale(.98)}
.cta:focus-visible{outline:3px solid #B8F36B;outline-offset:3px}
.small{margin:14px 0 0;font-size:13px;color:#5B6B63}
.small a{color:#0B3D2C;font-weight:700}
@keyframes pop{from{transform:scale(.7)}to{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.orb{animation:none}}
</style>
</head>
<body>
<div class="ring" style="width:360px;height:360px;right:-170px;top:-170px"></div>
<div class="ring" style="width:300px;height:300px;left:-170px;bottom:-130px"></div>
<main>
<div class="logo">Regent <span>Money</span></div>
${html}
${support}
</main>
<script>
function openApp(e){
  if(e&&e.preventDefault)e.preventDefault();
  var ua=navigator.userAgent;
  if(/Android/i.test(ua)){
    var chrome=/Chrome|CriOS/i.test(ua)&&!/SamsungBrowser|Firefox|EdgA/i.test(ua);
    if(chrome){location.href=${JSON.stringify(APP_LOGIN_INTENT)};}
    else{location.href=${JSON.stringify(APP_LOGIN_URL)};setTimeout(function(){location.href=${JSON.stringify(APP_LOGIN_INTENT)};},600);}
  }else{location.href=${JSON.stringify(APP_LOGIN_URL)};}
  return false;
}
${autoOpen ? `window.addEventListener('load',function(){setTimeout(function(){openApp();},400);setTimeout(function(){var o=document.getElementById('opening');if(o)o.textContent='Didn’t open? Tap the button above.';},3000);});` : ''}
</script>
</body>
</html>`;
}

// Ready-made email broadcasts for the admin Email tab.
// Body is the composer's Markdown: blank line = new paragraph, "- " = list, "> " = note,
// "[button: Text](https://…)" = button, {{name}} = recipient's first name.
// Text in [CAPS IN BRACKETS] must be filled in before sending (the composer blocks sending until it is).

export type EmailCategory = 'announcement' | 'policy_update' | 'security_tip' | 'service_notice';

export interface EmailTemplate {
  id: string;
  name: string;
  group: 'Updates' | 'Service' | 'Engagement' | 'Security';
  category: EmailCategory;
  /** Small label above the title. '' = none. */
  label: string;
  subject: string;
  bodyMarkdown: string;
}

const PLAY_STORE = 'https://play.google.com/store/apps/details?id=com.regentmoney';
const SIGN_OFF = 'RAO DEV STUDIOS';

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'announcement',
    name: 'Announcement',
    group: 'Updates',
    category: 'announcement',
    label: 'Product update',
    subject: 'Savings goals now pace themselves',
    bodyMarkdown: `Hi {{name}},

Each goal now shows how much to set aside every month to finish on time, based on what you've already saved. If you fall behind, Regent Money tells you early and suggests a new monthly amount.

- **Monthly target** for every goal
- **Early heads-up** when a goal slips
- **Change the date or amount** any time

[button: Update the app](${PLAY_STORE})

Thanks for using Regent Money,
${SIGN_OFF}`,
  },
  {
    id: 'app_update',
    name: 'App update',
    group: 'Updates',
    category: 'announcement',
    label: 'App update',
    subject: 'Version [VERSION] is ready',
    bodyMarkdown: `Hi {{name}},

A new version of Regent Money is on Google Play. Here's what's in it:

- **[WHAT'S NEW 1].** [One line about it.]
- **[WHAT'S NEW 2].** [One line about it.]
- **Fixes.** Smoother sign-in and fewer sync hiccups.

[button: Update on Google Play](${PLAY_STORE})

Updating keeps all your transactions, budgets and goals.

Thanks for using Regent Money,
${SIGN_OFF}`,
  },
  {
    id: 'maintenance',
    name: 'Maintenance',
    group: 'Service',
    category: 'service_notice',
    label: 'Service notice',
    subject: 'Scheduled maintenance on [DATE]',
    bodyMarkdown: `Hi {{name}},

We're upgrading our servers. For a short time, some parts of Regent Money won't work.

- **When:** [DATE], [START] to [END] IST
- **Not available:** Signing in, syncing and Regent AI chat
- **Your data:** Safe. Nothing is deleted or changed.

You can keep adding transactions in the app. They'll sync once we're back.

Sorry for the interruption,
${SIGN_OFF}`,
  },
  {
    id: 'policy_update',
    name: 'Policy update',
    group: 'Service',
    category: 'policy_update',
    label: 'Policy update',
    subject: "We've updated our Terms and Privacy Policy",
    bodyMarkdown: `Hi {{name}},

We're updating our Terms of Service and Privacy Policy. The changes take effect on **[EFFECTIVE DATE]**.

- Stronger encryption for your transaction data
- Clearer separation of your data from other accounts
- [ANY OTHER CHANGE]

You don't need to do anything. If you keep using Regent Money after that date, the updated terms apply.

[button: Read the updated terms]([TERMS LINK])

${SIGN_OFF}`,
  },
  {
    id: 'monthly_tip',
    name: 'Monthly tip',
    group: 'Engagement',
    category: 'announcement',
    label: 'Money tip',
    subject: 'Try the 50/30/20 split this month',
    bodyMarkdown: `Hi {{name}},

A simple way to plan your salary: half for needs, a third for wants, and a fifth saved before you spend anything else. On a ₹60,000 monthly income:

- **Needs, 50%: ₹30,000.** Rent, bills, groceries
- **Wants, 30%: ₹18,000.** Eating out, shopping
- **Savings, 20%: ₹12,000.** Goals, emergency fund

Set these three as budgets in Regent Money and it will tell you when a category is running ahead.

${SIGN_OFF}`,
  },
  {
    id: 'come_back',
    name: 'We miss you',
    group: 'Engagement',
    category: 'announcement',
    label: '',
    subject: 'Your money picture is a few taps away',
    bodyMarkdown: `Hi {{name}},

It's been a while since you opened Regent Money. When you do, it reads the bank messages that came in since your last visit and turns them into transactions, so your budgets catch up on their own.

[button: Get Regent Money](${PLAY_STORE})

${SIGN_OFF}`,
  },
  {
    id: 'feedback',
    name: 'Feedback',
    group: 'Engagement',
    category: 'announcement',
    label: '',
    subject: 'How is Regent Money working for you?',
    bodyMarkdown: `Hi {{name}},

We'd love to know what's working and what isn't. It takes about a minute.

[button: Share feedback]([SURVEY LINK])

Rather tell us in your own words? Just reply to this email. We read every reply.

Thank you,
${SIGN_OFF}`,
  },
  {
    id: 'security_tip',
    name: 'Security tip',
    group: 'Security',
    category: 'security_tip',
    label: 'Security tip',
    subject: 'Lock Regent Money with your fingerprint',
    bodyMarkdown: `Hi {{name}},

App lock keeps your balances and bank messages private, even if someone else picks up your phone. It takes a few seconds to turn on:

- **1.** Open Regent Money and go to **Settings**
- **2.** Tap **Security**
- **3.** Turn on **Biometric app lock**

> We'll never ask for your password, PIN or OTP by email or phone.

${SIGN_OFF}`,
  },
];

export const TEMPLATE_GROUPS = ['All', 'Updates', 'Service', 'Engagement', 'Security'] as const;

/** Placeholders like [DATE] or [SURVEY LINK] that still need filling in. */
export const findPlaceholders = (...texts: string[]): string[] => {
  const found = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/\[([A-Z][A-Z0-9 '’\-]{1,30})\]/g)) found.add(`[${m[1]}]`);
  return [...found];
};

/** Label shown above the title when a template doesn't set one (matches the backend). */
export const DEFAULT_EMAIL_LABEL: Record<EmailCategory, string> = {
  announcement: 'Product update',
  policy_update: 'Policy update',
  security_tip: 'Security tip',
  service_notice: 'Service notice',
};

/** Required notices go to everyone and have no unsubscribe link. */
export const isRequiredCategory = (c: string) => c === 'policy_update' || c === 'service_notice';

/** Plain text of the Markdown, for small previews. */
export const markdownToPlain = (md: string, name = 'Aarav') =>
  md
    .replace(/\{\{\s*name\s*\}\}/gi, name)
    .replace(/^\s*\[button:\s*(.+?)\]\(.*?\)\s*$/gim, '')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/^\s*[-*>]\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Text of the first [button: …] line, if any. */
export const firstButtonText = (md: string): string | null => {
  const m = md.match(/^\s*\[button:\s*(.+?)\]\(.*?\)\s*$/im);
  return m ? m[1] : null;
};

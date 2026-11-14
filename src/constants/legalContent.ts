// src/constants/legalContent.ts
//
// All Terms of service and Privacy policy wording lives here.
// Edit this file to change the documents; the screens only display it.
//
// IMPORTANT: have this wording reviewed by a lawyer before release, and keep it
// true to how the app actually works.

export interface LegalPoint {
  title: string;
  text: string;
}

export interface LegalSection {
  heading: string;
  paragraphs?: string[];
  points?: LegalPoint[];
}

export interface LegalDocument {
  title: string;
  version: string;
  effective: string;
  /** Three or four plain lines shown first, in the "In short" card. */
  summary: string[];
  sections: LegalSection[];
}

export const LEGAL_CONTACT = 'roshanawatirak@gmail.com';
export const LEGAL_PUBLISHER = 'Regent Money by Rao Dev Studios';
export const PRIVACY_POLICY_URL = 'https://raodevstudios.in/privacy';
export const TERMS_URL = 'https://raodevstudios.in/terms';
export const DELETE_ACCOUNT_URL = 'https://raodevstudios.in/regent-money/delete-account';

export const TERMS: LegalDocument = {
  title: 'Terms of service',
  version: '2.2',
  effective: 'November 2026',
  summary: [
    'Regent tracks your money. It can’t move it.',
    'Insights are for information, not financial advice.',
    'You keep your login safe; we keep your data private.',
  ],
  sections: [
    {
      heading: 'Using Regent',
      paragraphs: [
        'By creating an account or using Regent Money, you agree to these terms and to our privacy policy. If you don’t agree, please don’t use Regent.',
        'Regent is for people aged 18 and over. By using it, you confirm you are at least 18.',
      ],
    },
    {
      heading: 'What Regent does',
      paragraphs: [
        'Regent reads bank transaction messages from the senders you add and turns them into a record of your spending, income and balances.',
      ],
      points: [
        { title: 'Not a bank', text: 'Regent is not a bank, broker or payment app. It never moves, holds or withdraws your money.' },
        { title: 'Bank messages only', text: 'Regent reads only transaction alerts from bank senders you add. It does not read personal messages or OTPs.' },
        { title: 'Your imports', text: 'Statements and screenshots you choose to import are processed to find transactions.' },
      ],
    },
    {
      heading: 'Your account and security',
      paragraphs: [
        'Keep your login details and phone passcode safe. You are responsible for activity on your account.',
        'If you turn on fingerprint or face unlock, it is checked by your phone. Regent never receives your biometric data.',
      ],
    },
    {
      heading: 'Not financial advice',
      paragraphs: [
        'Balances, categories, budgets, insights and Regent chat answers are for your information only. They are not financial, tax, legal or investment advice. Talk to a qualified professional before big money decisions.',
        'Automatic tracking can miss or misread a transaction. Check important figures with your bank.',
      ],
    },
    {
      heading: 'Your data',
      paragraphs: [
        `How we collect, use and protect your data is explained in our privacy policy (${PRIVACY_POLICY_URL}).`,
        `To delete your account and its data, go to Settings, then Delete account, or email ${LEGAL_CONTACT} from your registered email address. Full steps: ${DELETE_ACCOUNT_URL}.`,
      ],
    },
    {
      heading: 'Changes to these terms',
      paragraphs: [
        'We may update these terms as Regent changes. We will tell you in the app when we do. Continuing to use Regent after an update means you accept the new terms.',
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [`Questions about these terms: ${LEGAL_CONTACT}`],
    },
  ],
};

export const PRIVACY: LegalDocument = {
  title: 'Privacy policy',
  version: '2.5',
  effective: 'November 2026',
  summary: [
    'We read only bank messages, on your phone. The message text never leaves it.',
    'Your accounts and transactions sync to your Regent account.',
    'We never sell your data or show ads.',
  ],
  sections: [
    {
      heading: 'What we collect',
      points: [
        { title: 'Account details', text: 'Your name, email and, if you add it, your phone number. Regent never reads your phone number or SIM details from your device.' },
        {
          title: 'Bank messages',
          text: 'With your permission, Regent reads SMS from known bank senders and any you add, including in the background as they arrive. Each message is read on your phone; only the amount, type, merchant, date, last digits of the account, available balance and bank reference number are sent to your account. The message text never leaves your phone. Personal messages and OTPs are skipped.',
        },
        { title: 'Files you import', text: 'Statements and screenshots you choose to upload, to find the transactions in them. If a statement PDF is password protected, the password you enter is sent with it only to open that file; on your phone it is kept in the device’s secure keystore.' },
        { title: 'Profile photo', text: 'A photo, if you choose to add one.' },
        { title: 'Profile details', text: 'Things you add yourself, like date of birth, gender, occupation and income.' },
        { title: 'Device and security', text: 'A push notification token so we can send you alerts, device details in bug reports you choose to send, and a bot-protection check when you sign in.' },
        {
          title: 'How you found Regent',
          text: 'Once, after you sign in, the app records how it was installed: from a friend’s invite link, a promotion link, an ad, or the Play Store directly. This comes from Google Play’s install referrer. For invite and promotion links, Google Play Integrity also confirms the request came from the genuine app on a genuine device. We do not store your IP address, advertising ID or any device identifier for this. If a friend invited you, they see only a total number of friends who joined, never your name. There is no reward for inviting.',
        },
      ],
    },
    {
      heading: 'How we use it',
      paragraphs: [
        'To track your spending, income and balances; to answer your questions in Regent chat, which uses your balances, budgets and recent transactions; and to send the alerts you turn on.',
      ],
    },
    {
      heading: 'Where it’s stored',
      paragraphs: [
        'Your data is kept on your phone and in your Regent account on our servers, so it’s there if you change phones. It travels over encrypted connections, and data on your phone is encrypted with keys held in the Android Keystore.',
        'We keep your data while your account is active. Transactions you delete are permanently erased from our servers after 30 days.',
      ],
    },
    {
      heading: 'Who we share it with',
      paragraphs: [
        'We never sell your data or share it with advertisers. We use these service providers only to run Regent for you:',
        'Render (servers and database hosting); Google Gemini, Groq and Mistral (AI processing of Regent chat messages and of statements and screenshots you import, together with the balances and transactions needed to answer); Cloudinary (profile photos); Brevo and Gmail (account emails such as verification and password reset); Expo and Firebase Cloud Messaging (push notifications); Google Sign-In (if you choose to sign in with Google); Google Play (the install referrer and the Play Integrity check described above); Cloudflare Turnstile (bot protection at sign-in).',
        'Some of these providers may process data outside India.',
      ],
    },
    {
      heading: 'Your choices',
      points: [
        { title: 'SMS access', text: 'Turn off auto-tracking for a bank in the app, or revoke SMS access any time in your phone’s settings.' },
        { title: 'Regent chat', text: 'Clear your conversation from Privacy in the app.' },
        { title: 'Delete your account', text: `Go to Settings, then Delete account, or email ${LEGAL_CONTACT} from your registered email address. Your account and its data are permanently deleted after 7 days; signing back in before then cancels it.` },
        { title: 'Your rights', text: 'Under India’s Digital Personal Data Protection Act, 2023, you can ask for a summary of your data, correct it, erase it, withdraw consent, and nominate someone to act for you.' },
      ],
    },
    {
      heading: 'Age',
      paragraphs: ['Regent is for people aged 18 and over. We don’t knowingly collect data from anyone younger; if you think a minor has an account, contact us and we will delete it.'],
    },
    {
      heading: 'Contact and grievances',
      paragraphs: [
        `Privacy questions, requests or complaints: ${LEGAL_CONTACT}. Grievance Officer: Roshan Avatirak, RAO Dev Studios. We aim to reply within 30 days.`,
        `Full policy: ${PRIVACY_POLICY_URL}`,
      ],
    },
  ],
};
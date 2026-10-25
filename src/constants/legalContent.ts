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

export const LEGAL_CONTACT = 'privacy@regentmoney.com';
export const LEGAL_PUBLISHER = 'Regent Money by Rao Dev Studios';

export const TERMS: LegalDocument = {
  title: 'Terms of service',
  version: '2.1',
  effective: 'October 2026',
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
        `How we collect, use and protect your data is explained in our privacy policy. To delete your account and its data, email ${LEGAL_CONTACT}.`,
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
  version: '2.1',
  effective: 'October 2026',
  summary: [
    'We read only bank messages from senders you add.',
    'Your accounts and transactions sync to your Regent account.',
    'We never sell your data or show ads.',
  ],
  sections: [
    {
      heading: 'What we collect',
      points: [
        { title: 'Account details', text: 'Your name, email and, if you add it, your phone number.' },
        { title: 'Bank messages', text: 'From bank senders you add: the amount, merchant, date and last digits of the account. We do not read personal messages or OTPs.' },
        { title: 'Files you import', text: 'Statements and screenshots you choose to upload, to find the transactions in them.' },
        { title: 'Profile details', text: 'Things you add yourself, like date of birth, occupation and income.' },
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
        'Your data is kept on your phone and in your Regent account on our servers, so it’s there if you change phones. It travels over encrypted connections.',
      ],
    },
    {
      heading: 'Who we share it with',
      paragraphs: [
        'We never sell your data or share it with advertisers. We use service providers, such as hosting and AI processing, only to run Regent for you.',
      ],
    },
    {
      heading: 'Your choices',
      points: [
        { title: 'SMS access', text: 'Turn it off any time in your phone’s settings.' },
        { title: 'Regent chat', text: 'Clear your conversation from Privacy in the app.' },
        { title: 'Delete your account', text: `Email ${LEGAL_CONTACT} and we will delete your account and its data.` },
      ],
    },
    {
      heading: 'Contact',
      paragraphs: [`Privacy questions or requests: ${LEGAL_CONTACT}`],
    },
  ],
};
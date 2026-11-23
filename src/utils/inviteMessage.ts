// The text people send when they share their Regent Money invite link.
// Every line describes something the app really does; keep it that way.

/** First word of the sender's name, if it looks like a real name. */
const firstName = (name?: string | null): string | null => {
  const first = (name || '').trim().split(/\s+/)[0];
  return first && /^\p{L}/u.test(first) ? first : null;
};

export function buildInviteMessage(link: string, senderName?: string | null): string {
  const sender = firstName(senderName);
  return [
    'Hey! I use Regent Money to keep track of my money. Thought you’d like it too.',
    '',
    '• Logs your spending from bank SMS by itself, no typing',
    '• Budgets and savings goals that show where you stand',
    '• Ask Regent anything about your money, in plain words',
    '• Keeps track of money you lend and borrow',
    '',
    'Your bank messages are read on your phone. The text never leaves it.',
    '',
    'Get it with my invite link:',
    link,
    ...(sender ? ['', `– ${sender}`] : []),
  ].join('\n');
}

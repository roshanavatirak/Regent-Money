/**
 * Counterparty fields on transactions and income records.
 *
 * - Key: read from the bank SMS by the phone's parser (all three parsers agree, see
 *   src/services/__fixtures__/sms-parity-cases.json): "vpa:<upi id>" or "acct:<last 3-4 digits>".
 * - Id: the person or merchant the user linked the row to. Made on the phone; opaque here.
 */
export const COUNTERPARTY_KEY_PATTERN = /^(?:vpa:[a-z0-9][a-z0-9._-]{1,40}@[a-z0-9-]{2,}(?:\.[a-z0-9-]+)*|acct:\d{3,4})$/;
export const COUNTERPARTY_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;

/** The key in its stored form, or undefined when it isn't one. Never throws. */
export function cleanCounterpartyKey(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase();
  return key.length <= 120 && COUNTERPARTY_KEY_PATTERN.test(key) ? key : undefined;
}

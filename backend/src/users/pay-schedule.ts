// How a user is paid, beyond a single monthly salary day. Stored as bounded JSON text on
// core.users.pay_schedule; anything the phone sends is checked field by field.

export type PayKind = 'monthly' | 'weekly' | 'fortnightly' | 'irregular';

export interface PaySchedule {
  kind: PayKind;
  /** Weekly: 0 = Sunday … 6 = Saturday. */
  weekday?: number | null;
  /** Every 2 weeks: a past payday, epoch ms. */
  anchor?: number | null;
  /** Monthly: a second salary day 1–31 (partner's salary, or second part of a split salary). */
  secondPayday?: number | null;
  secondLabel?: string | null;
}

const KINDS: PayKind[] = ['monthly', 'weekly', 'fortnightly', 'irregular'];

/** A valid schedule from untrusted input, or null when it can't be one. */
export function cleanPaySchedule(input: unknown): PaySchedule | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const kind = raw.kind as PayKind;
  if (!KINDS.includes(kind)) return null;
  const out: PaySchedule = { kind };

  if (kind === 'weekly') {
    const weekday = Number(raw.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
    out.weekday = weekday;
  }
  if (kind === 'fortnightly') {
    const anchor = Number(raw.anchor);
    // Any date from 2000 up to a year ahead.
    if (!Number.isFinite(anchor) || anchor < 946_684_800_000 || anchor > Date.now() + 366 * 86_400_000) return null;
    out.anchor = Math.round(anchor);
  }
  if (kind === 'monthly' && raw.secondPayday !== undefined && raw.secondPayday !== null) {
    const second = Number(raw.secondPayday);
    if (Number.isInteger(second) && second >= 1 && second <= 31) {
      out.secondPayday = second;
      if (typeof raw.secondLabel === 'string' && raw.secondLabel.trim()) out.secondLabel = raw.secondLabel.trim().slice(0, 40);
    }
  }
  return out;
}

/** The stored text as a schedule; null when empty or damaged. */
export function parsePaySchedule(text: string | null | undefined): PaySchedule | null {
  if (!text) return null;
  try {
    return cleanPaySchedule(JSON.parse(text));
  } catch {
    return null;
  }
}

// Fixed monthly commitments (rent, EMI, SIP, insurance, utilities, subscriptions) found in
// past debits, and where each one falls in a cycle.
//
// A merchant counts as a bill when it was paid in at least 2 of the last few months, about
// once a month, for a steady amount (or it is in a bill category). Frequent merchants such
// as food delivery are left out even if they show up every month.

import { paydayInMonth } from './payday';

const DAY_MS = 24 * 60 * 60 * 1000;
const LOOKBACK_MONTHS = 4;
/** A bill paid up to this many days before its usual day still belongs to that day's cycle. */
export const EARLY_PAY_DAYS = 7;

export type BillKind = 'emi' | 'rent' | 'sip' | 'insurance' | 'utility' | 'subscription' | 'other';

export interface RecurringBill {
  key: string;
  merchant: string;
  category: string;
  kind: BillKind;
  /** Usual amount (median of monthly payments). */
  amount: number;
  /** Usual day of the month it is paid, 1–31 (clamped in short months). */
  dueDay: number;
  /** Distinct months it was seen in. */
  months: number;
  /** Account it was last paid from, when known. */
  bankProfileId: string | null;
  lastPaidAt: number;
}

export interface BillTx {
  id?: string;
  merchant?: string;
  category?: string;
  amount: number | string;
  type?: string;
  timestamp: number | string;
  isDeleted?: boolean;
  bankProfileId?: string | null;
}

const kindOf = (category: string, merchant: string): BillKind | null => {
  const t = `${category} ${merchant}`.toLowerCase();
  if (/\bemi\b|\bloan|bajaj fin|home ?credit|\bnach\b|\becs\b/.test(t)) return 'emi';
  if (/\brent\b|landlord|nobroker|housing/.test(t)) return 'rent';
  if (/\bsip\b|mutual fund|groww|zerodha|coin by|kuvera|etmoney|\bnps\b|\bppf\b|recurring deposit/.test(t)) return 'sip';
  if (/insurance|\blic\b|premium|policy/.test(t)) return 'insurance';
  if (/electric|bescom|msedcl|tata power|\bwater\b|\bgas\b|broadband|wifi|fibre|airtel|\bjio\b|\bvi\b|recharge|\bdth\b|utilit|\bbill/.test(t)) return 'utility';
  if (/subscri|netflix|prime|hotstar|spotify|youtube|ott/.test(t)) return 'subscription';
  return null;
};

const normalize = (merchant: string) =>
  merchant.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Bills from debits up to `now`. */
export function detectRecurringBills(txs: BillTx[], now: number = Date.now()): RecurringBill[] {
  const from = new Date(new Date(now).getFullYear(), new Date(now).getMonth() - LOOKBACK_MONTHS, 1).getTime();
  const groups = new Map<
    string,
    { merchant: string; category: string; count: number; perMonth: Map<string, { amount: number; day: number; ts: number; bank: string | null }> }
  >();

  for (const tx of txs) {
    if (!tx || tx.isDeleted || (tx.type && tx.type !== 'debit')) continue;
    const ts = Number(tx.timestamp);
    if (!ts || ts < from || ts > now) continue;
    const merchant = (tx.merchant || '').trim();
    const key = normalize(merchant);
    if (key.length < 3 || key === 'spends') continue;
    const amount = Math.abs(Number(String(tx.amount).replace(/,/g, '')));
    if (!(amount >= 99)) continue;

    const d = new Date(ts);
    const month = `${d.getFullYear()}-${d.getMonth()}`;
    const g = groups.get(key) ?? { merchant, category: (tx.category || '').toLowerCase(), count: 0, perMonth: new Map() };
    g.count += 1;
    const prev = g.perMonth.get(month);
    // Biggest payment of the month is the bill; small extras (late fee, top-up) are ignored.
    if (!prev || amount > prev.amount) g.perMonth.set(month, { amount, day: d.getDate(), ts, bank: tx.bankProfileId ?? null });
    groups.set(key, g);
  }

  const bills: RecurringBill[] = [];
  for (const [key, g] of groups) {
    const months = g.perMonth.size;
    if (months < 2) continue;
    // About once a month: food delivery, fuel, groceries are paid many times.
    if (g.count / months > 1.5) continue;
    const entries = [...g.perMonth.values()];
    const amounts = entries.map((e) => e.amount);
    const kind = kindOf(g.category, g.merchant);
    const steady = Math.max(...amounts) <= Math.min(...amounts) * 1.25;
    if (!kind && !steady) continue;
    // Usual day, wrapping month ends together (30, 31, 1 are close).
    const days = entries.map((e) => e.day);
    const dueDay = Math.round(median(days));
    const last = entries.reduce((a, b) => (b.ts > a.ts ? b : a));
    bills.push({
      key,
      merchant: g.merchant,
      category: g.category,
      kind: kind ?? 'other',
      amount: Math.round(median(amounts)),
      dueDay: Math.min(31, Math.max(1, dueDay)),
      months,
      bankProfileId: last.bank,
      lastPaidAt: last.ts,
    });
  }
  return bills.sort((a, b) => a.dueDay - b.dueDay);
}

/** Midnight dates the bill falls due within [from, to]. */
export function dueDatesBetween(bill: RecurringBill, from: number, to: number): number[] {
  const out: number[] = [];
  const start = new Date(from);
  for (let i = -1; i <= 13; i++) {
    const due = paydayInMonth(start.getFullYear(), start.getMonth() + i, bill.dueDay).getTime();
    if (due > to) break;
    if (due >= new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() && due <= to) out.push(due);
  }
  return out;
}

/** Does this debit look like a payment of `bill`? */
export function isPaymentOf(tx: BillTx, bill: RecurringBill): boolean {
  if (!tx || tx.isDeleted || (tx.type && tx.type !== 'debit')) return false;
  if (normalize(tx.merchant || '') !== bill.key) return false;
  const amount = Math.abs(Number(String(tx.amount).replace(/,/g, '')));
  return amount >= bill.amount * 0.5 && amount <= bill.amount * 1.5;
}

/**
 * When a bill payment counts, for putting it in the right cycle. A bill paid a few days
 * before its usual day (rent for November paid on 29 Oct) counts on that day, so each cycle
 * gets exactly one rent. Payments on time or late count when they were made.
 */
export function attributedTime(tx: BillTx, bills: RecurringBill[]): number {
  const ts = Number(tx.timestamp);
  for (const bill of bills) {
    if (!isPaymentOf(tx, bill)) continue;
    const due = dueDatesBetween(bill, ts, ts + EARLY_PAY_DAYS * DAY_MS)[0];
    if (due !== undefined && due > ts) return due;
    return ts;
  }
  return ts;
}

export interface BillDue {
  bill: RecurringBill;
  /** Midnight of the due day. */
  dueAt: number;
  /** A matching payment was already made for this due date. */
  paid: boolean;
}

/**
 * Each bill's due date(s) in [from, to], marked paid when a matching payment was made from
 * EARLY_PAY_DAYS before the due date onwards.
 */
export function billsDueBetween(bills: RecurringBill[], txs: BillTx[], from: number, to: number): BillDue[] {
  const out: BillDue[] = [];
  for (const bill of bills) {
    const payments = txs.filter((tx) => isPaymentOf(tx, bill)).map((tx) => Number(tx.timestamp));
    for (const dueAt of dueDatesBetween(bill, from, to)) {
      const windowStart = dueAt - EARLY_PAY_DAYS * DAY_MS;
      const windowEnd = dueAt + 20 * DAY_MS;
      out.push({ bill, dueAt, paid: payments.some((t) => t >= windowStart && t <= windowEnd) });
    }
  }
  return out.sort((a, b) => a.dueAt - b.dueAt);
}

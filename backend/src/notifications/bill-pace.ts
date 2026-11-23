// Fixed monthly bills (rent, EMI, SIP, insurance, utilities, subscriptions) found in past
// debits, and budget pacing that expects them. Server copy of the app's utils/recurringBills
// and utils/billPacing, in IST, so pace alerts don't fire right after rent and EMI go out.

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const EARLY_PAY_DAYS = 7;

export interface ServerBill {
  key: string;
  merchant: string;
  category: string;
  amount: number;
  /** Usual IST day of the month, 1–31. */
  dueDay: number;
}

export interface BillTx {
  merchant?: string | null;
  category?: string | null;
  amount: number | string;
  timestamp: number;
  isDeleted?: boolean;
  type?: string | null;
}

const BILL_WORDS =
  /\bemi\b|\bloan|\bnach\b|\becs\b|\brent\b|landlord|\bsip\b|mutual fund|insurance|\blic\b|premium|electric|broadband|wifi|\bjio\b|airtel|recharge|\bdth\b|utilit|\bbill|subscri|netflix|hotstar|spotify|emi_loans/;

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const istParts = (ts: number) => {
  const d = new Date(ts + IST_OFFSET_MS);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() };
};
const istMidnight = (y: number, m: number, d: number) => Date.UTC(y, m, d) - IST_OFFSET_MS;
const istMidnightOf = (ts: number) => {
  const p = istParts(ts);
  return istMidnight(p.y, p.m, p.d);
};
/** Due day in an IST month, clamped to its length. Month may be out of range. */
const dueIn = (y: number, m: number, day: number) => {
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return istMidnight(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, last));
};
const amountOf = (tx: BillTx) => Math.abs(Number(String(tx.amount).replace(/,/g, ''))) || 0;
const isDebit = (tx: BillTx) => !tx.isDeleted && (!tx.type || tx.type === 'debit');

/** Merchants paid in 2+ of the last 4 months, about once a month, for a steady amount or a bill category. */
export function detectBills(txs: BillTx[], now: number): ServerBill[] {
  const nowP = istParts(now);
  const from = istMidnight(nowP.y, nowP.m - 4, 1);
  const groups = new Map<string, { merchant: string; category: string; count: number; perMonth: Map<string, { amount: number; day: number }> }>();
  for (const tx of txs) {
    if (!tx || !isDebit(tx) || !tx.timestamp || tx.timestamp < from || tx.timestamp > now) continue;
    const merchant = (tx.merchant || '').trim();
    const key = normalize(merchant);
    const amount = amountOf(tx);
    if (key.length < 3 || amount < 99) continue;
    const p = istParts(tx.timestamp);
    const month = `${p.y}-${p.m}`;
    const g = groups.get(key) ?? { merchant, category: String(tx.category || '').toLowerCase(), count: 0, perMonth: new Map() };
    g.count += 1;
    const prev = g.perMonth.get(month);
    if (!prev || amount > prev.amount) g.perMonth.set(month, { amount, day: p.d });
    groups.set(key, g);
  }
  const bills: ServerBill[] = [];
  for (const [key, g] of groups) {
    const months = [...g.perMonth.values()];
    if (months.length < 2 || g.count / months.length > 1.5) continue;
    const amounts = months.map((m) => m.amount);
    const named = BILL_WORDS.test(`${g.category} ${key}`);
    const steady = Math.max(...amounts) <= Math.min(...amounts) * 1.25;
    if (!named && !steady) continue;
    bills.push({ key, merchant: g.merchant, category: g.category, amount: Math.round(median(amounts)), dueDay: Math.round(median(months.map((m) => m.day))) });
  }
  return bills;
}

export interface BillPace {
  billsTotal: number;
  billsUnpaid: number;
  /** A steady period's spend by now: bills due so far + an even share of the rest. */
  expectedByToday: number;
  everydayPerDay: number;
  /** Spent so far + bills still to pay + everyday spending at its current pace. */
  projectedSpend: number;
  totalDays: number;
  elapsedDays: number;
}

/** Pacing over a budget's dates [start, end] that expects the bills due in it. */
export function billAwarePace(limit: number, spent: number, start: number, end: number, now: number, bills: ServerBill[], txs: BillTx[]): BillPace {
  const startDay = istMidnightOf(start);
  const today = istMidnightOf(now);
  const totalDays = Math.max(1, Math.round((istMidnightOf(end) - startDay) / DAY_MS) + 1);
  const elapsedDays = Math.max(1, Math.min(totalDays, Math.round((today - startDay) / DAY_MS) + 1));

  let billsTotal = 0;
  let billsPaid = 0;
  let billsDueByToday = 0;
  const sp = istParts(start);
  for (const bill of bills) {
    for (let i = 0; i <= 2; i++) {
      const due = dueIn(sp.y, sp.m + i, bill.dueDay);
      if (due < startDay || due > end) continue;
      billsTotal += bill.amount;
      if (due <= today) billsDueByToday += bill.amount;
      const paid = txs.some(
        (tx) =>
          isDebit(tx) &&
          normalize(tx.merchant || '') === bill.key &&
          tx.timestamp >= due - EARLY_PAY_DAYS * DAY_MS &&
          tx.timestamp <= Math.min(now, due + 20 * DAY_MS) &&
          amountOf(tx) >= bill.amount * 0.5,
      );
      if (paid) billsPaid += bill.amount;
    }
  }
  const billsUnpaid = billsTotal - billsPaid;
  const everydayLimit = Math.max(0, limit - billsTotal);
  const everydayPerDay = Math.max(0, spent - billsPaid) / elapsedDays;
  return {
    billsTotal,
    billsUnpaid,
    expectedByToday: Math.round(billsDueByToday + (everydayLimit * elapsedDays) / totalDays),
    everydayPerDay,
    projectedSpend: Math.round(spent + billsUnpaid + everydayPerDay * (totalDays - elapsedDays)),
    totalDays,
    elapsedDays,
  };
}

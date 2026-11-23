/**
 * Net worth maths for the Net Worth screen and the Home hero.
 *
 * Net worth = every account balance (banks + cash) + money lent − money borrowed.
 *
 * History is worked out backwards: today's balances are known, so the value on an earlier
 * day is today's value minus everything that moved since. Server snapshots, where they exist,
 * are used as fixed points the curve must pass through; any gap between two fixed points that the
 * transactions do not explain is spread evenly between them and reported as "untracked".
 *
 * Everything is integer paise. Pure (no React Native imports) so it runs under `npm run test:unit`.
 */
import { toMinor } from './money';
import { isCashWithdrawalCategory } from '../services/cashTopups';

export const DAY_MS = 86_400_000;
/** History is never drawn further back than this. */
const MAX_HISTORY_DAYS = 730;

/** One movement on an account: positive is money arriving, negative is money leaving. */
export interface Flow {
  ts: number;
  minor: number;
  /** False for money that only moved (self transfer, Borrow & Lend, cash withdrawal, card bill). */
  counted: boolean;
  bankId: string;
}

/** A known total of all account balances at a moment (server snapshot). */
export interface Anchor {
  ts: number;
  minor: number;
}

/** A change to (money lent − money borrowed). */
export interface PeerDelta {
  ts: number;
  minor: number;
}

export interface SeriesPoint {
  ts: number;
  minor: number;
}

export const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** First millisecond of the month `offset` months away from the month containing `ts`. */
export const monthStartOf = (ts: number, offset = 0): number => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth() + offset, 1, 0, 0, 0, 0).getTime();
};

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

interface BuildFlowsInput {
  transactions: any[];
  incomeRecords: any[];
  /** Ids of the accounts that make up the balance today. */
  bankIds: Set<string>;
  cash?: { id: string; cashTrackingSince?: number } | null;
  /** Same rule Money in / Money out uses. */
  isExcluded: (tx: any) => boolean;
}

/**
 * Debits (transaction store) and credits (income store) of the linked accounts as signed flows,
 * oldest first. De-duplicated the same way the activity feed is.
 */
export function buildFlows({ transactions, incomeRecords, bankIds, cash, isExcluded }: BuildFlowsInput): Flow[] {
  const items: any[] = [];
  for (const tx of transactions || []) {
    if (tx && !tx.isDeleted) items.push({ ...tx, type: tx.type === 'credit' ? 'credit' : 'debit' });
  }
  for (const inc of incomeRecords || []) {
    if (inc && !inc.isDeleted) items.push({ ...inc, type: 'credit' });
  }
  items.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));

  const cashSince = Number(cash?.cashTrackingSince) || 0;
  const seenIds = new Set<string>();
  const seenRefs = new Set<string>();
  const flows: Flow[] = [];

  for (const item of items) {
    const bankId = item.bankProfileId ?? item.bank_profile_id;
    if (!bankId || !bankIds.has(bankId)) continue;
    const ts = Number(item.timestamp);
    const amount = Math.abs(toMinor(item.amount));
    if (!Number.isFinite(ts) || amount === 0) continue;

    if (item.id) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
    }
    const ref = item.referenceId || (typeof item.smsId === 'string' && item.smsId.startsWith('ref_') ? item.smsId : null);
    if (ref) {
      if (seenRefs.has(ref)) continue;
      seenRefs.add(ref);
    }

    const isDebit = item.type === 'debit';
    flows.push({ ts, minor: isDebit ? -amount : amount, counted: !isExcluded(item), bankId });

    // An ATM withdrawal after the cash wallet started tracking lands in the wallet: nothing was lost.
    if (isDebit && cash && cashSince > 0 && bankId !== cash.id && ts >= cashSince && isCashWithdrawalCategory(item.category)) {
      flows.push({ ts, minor: amount, counted: false, bankId: cash.id });
    }
  }

  return flows.sort((a, b) => a.ts - b.ts);
}

const PEER_SIGN: Record<string, number> = {
  LEND: 1,
  REPAY_RECEIVED: -1,
  FORGIVE_LENT: -1,
  BORROW: -1,
  REPAY_PAID: 1,
  FORGIVE_BORROWED: 1,
};

/**
 * Borrow & Lend entries as changes to (lent − borrowed), oldest first. Amounts are already paise.
 *
 * Loans marked "let go" are left out, and so is the part of any repayment that was matched to
 * them (`repaidToLetGo`, repayment id → paise): today's value leaves them out too, so counting
 * them here made every day before such a loan too low by its amount (a ₹7,200 dip below zero).
 */
export function buildPeerDeltas(entries: any[], repaidToLetGo?: Map<string, number>): PeerDelta[] {
  const out: PeerDelta[] = [];
  for (const e of entries || []) {
    if (!e || e.deletedAt) continue;
    if (e.kind === 'LEND' && e.notExpectedBack) continue;
    const sign = PEER_SIGN[e.kind];
    const amount = (Number(e.amount) || 0) - (repaidToLetGo?.get(e.id) || 0);
    const [y, m, d] = String(e.date || '').split('-').map(Number);
    if (!sign || !amount || !y || !m || !d) continue;
    out.push({ ts: new Date(y, m - 1, d, 12, 0, 0, 0).getTime(), minor: sign * amount });
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/* ------------------------------------------------------------------ */
/* Model                                                               */
/* ------------------------------------------------------------------ */

export interface ModelInput {
  now: number;
  /** Sum of every account balance right now. */
  accountsNowMinor: number;
  flows: Flow[];
  anchors: Anchor[];
  /** Money lent minus money borrowed, still pending, right now. */
  peerNowMinor: number;
  peerDeltas: PeerDelta[];
  /**
   * True when every account is one that can't go below zero (savings, current, salary, cash).
   * Then a past balance worked out below zero only means some old money in was never recorded,
   * so the rebuilt balance stops at zero instead of showing a fake negative net worth.
   */
  accountsNeverNegative?: boolean;
}

export interface NetWorthModel {
  now: number;
  liveMinor: number;
  /** Start of the first day there is anything to go on. */
  trackingStart: number;
  /** Whole days of history before today. */
  daysTracked: number;
  /** Opening value, one point per finished day, then the live value. */
  series: SeriesPoint[];
  /** Net worth at the end of the millisecond `ts`. */
  valueAt: (ts: number) => number;
  peerAt: (ts: number) => number;
}

/** Running totals with a "sum of everything up to ts" lookup. */
const cumulative = (items: { ts: number; minor: number }[]) => {
  const times = items.map((i) => i.ts);
  const sums: number[] = [];
  let run = 0;
  for (const i of items) {
    run += i.minor;
    sums.push(run);
  }
  const upTo = (ts: number): number => {
    let lo = 0;
    let hi = times.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= ts) lo = mid + 1;
      else hi = mid;
    }
    return lo === 0 ? 0 : sums[lo - 1];
  };
  return { upTo, total: run };
};

export function createNetWorthModel(input: ModelInput): NetWorthModel {
  const { now, accountsNowMinor, peerNowMinor } = input;
  const flows = input.flows.filter((f) => f.ts <= now);
  const flowSum = cumulative(flows);
  const peerSum = cumulative(input.peerDeltas.filter((p) => p.ts <= now));

  const anchors = input.anchors
    .filter((a) => Number.isFinite(a.ts) && Number.isFinite(a.minor) && a.ts < now)
    .sort((a, b) => a.ts - b.ts);
  anchors.push({ ts: now, minor: accountsNowMinor });

  const floorAt = input.accountsNeverNegative ? 0 : -Infinity;
  const accountsAt = (ts: number): number => {
    if (ts >= now) return accountsNowMinor;
    return Math.max(floorAt, rebuiltAccountsAt(ts));
  };
  const rebuiltAccountsAt = (ts: number): number => {
    // Before the first fixed point: work backwards from it.
    const first = anchors[0];
    if (ts < first.ts) return first.minor - (flowSum.upTo(first.ts) - flowSum.upTo(ts));
    // Between two fixed points: go forward from the earlier one, and spread whatever the
    // transactions do not explain evenly over the gap, so the curve has no invented cliff.
    let i = anchors.length - 2;
    while (anchors[i].ts > ts) i--;
    const from = anchors[i];
    const to = anchors[i + 1];
    const explained = flowSum.upTo(to.ts) - flowSum.upTo(from.ts);
    const unexplained = to.minor - from.minor - explained;
    const share = (ts - from.ts) / (to.ts - from.ts);
    return from.minor + (flowSum.upTo(ts) - flowSum.upTo(from.ts)) + Math.round(unexplained * share);
  };
  const peerAt = (ts: number): number => (ts >= now ? peerNowMinor : peerNowMinor - (peerSum.total - peerSum.upTo(ts)));

  const firstKnown = Math.min(flows.length ? flows[0].ts : now, anchors[0].ts);
  const trackingStart = startOfDay(Math.max(firstKnown, now - MAX_HISTORY_DAYS * DAY_MS));

  const valueAt = (ts: number): number => {
    const t = Math.max(ts, trackingStart - 1);
    return accountsAt(t) + peerAt(t);
  };

  const liveMinor = accountsNowMinor + peerNowMinor;
  const series: SeriesPoint[] = [{ ts: trackingStart, minor: valueAt(trackingStart - 1) }];
  const day = new Date(trackingStart);
  for (;;) {
    day.setDate(day.getDate() + 1);
    const endOfDay = day.getTime() - 1;
    if (endOfDay >= now) break;
    series.push({ ts: endOfDay, minor: valueAt(endOfDay) });
  }
  series.push({ ts: now, minor: liveMinor });

  return {
    now,
    liveMinor,
    trackingStart,
    daysTracked: Math.round((startOfDay(now) - trackingStart) / DAY_MS),
    series,
    valueAt,
    peerAt,
  };
}

/* ------------------------------------------------------------------ */
/* Derived numbers                                                     */
/* ------------------------------------------------------------------ */

/** Percentage change, or null when the starting value is zero or negative (a percentage would mislead). */
export const pctChange = (fromMinor: number, toMinorValue: number): number | null =>
  fromMinor > 0 ? ((toMinorValue - fromMinor) / fromMinor) * 100 : null;

export interface RangeStats {
  /** Where the comparison really starts (never before tracking began). */
  fromTs: number;
  startMinor: number;
  changeMinor: number;
  pct: number | null;
  high: SeriesPoint;
  low: SeriesPoint;
  points: SeriesPoint[];
}

export function rangeStats(model: NetWorthModel, rangeStartTs: number): RangeStats {
  const fromTs = Math.max(rangeStartTs, model.trackingStart);
  const startMinor = model.valueAt(fromTs - 1);
  const points: SeriesPoint[] = [{ ts: fromTs, minor: startMinor }, ...model.series.filter((p) => p.ts > fromTs)];
  let high = points[0];
  let low = points[0];
  for (const p of points) {
    if (p.minor >= high.minor) high = p;
    if (p.minor < low.minor) low = p;
  }
  return {
    fromTs,
    startMinor,
    changeMinor: model.liveMinor - startMinor,
    pct: pctChange(startMinor, model.liveMinor),
    high,
    low,
    points,
  };
}

export interface FlowTotals {
  inMinor: number;
  outMinor: number;
  /** Net of money that only moved between places (not income, not spending). */
  movedMinor: number;
}

/** Money in / out between two moments (both included). */
export function flowTotals(flows: Flow[], fromTs: number, toTs: number): FlowTotals {
  let inMinor = 0;
  let outMinor = 0;
  let movedMinor = 0;
  for (const f of flows) {
    if (f.ts < fromTs || f.ts > toTs) continue;
    if (!f.counted) movedMinor += f.minor;
    else if (f.minor >= 0) inMinor += f.minor;
    else outMinor -= f.minor;
  }
  return { inMinor, outMinor, movedMinor };
}

/** One period: a calendar month, or a salary cycle (salary day to the day before the next). */
export interface MonthRow {
  /** Period start (the 1st, or the day salary landed). Kept as `monthStart` for existing callers. */
  monthStart: number;
  /** Where this row's change is measured from (later than monthStart in the first, partial period). */
  fromTs: number;
  /** Last millisecond of the period (now for the current one). */
  endTs: number;
  /** Whole days in the period so far. */
  days: number;
  openMinor: number;
  closeMinor: number;
  changeMinor: number;
  pct: number | null;
  inMinor: number;
  outMinor: number;
  isCurrent: boolean;
  /** Tracking began part-way through this period. */
  isPartial: boolean;
}

/**
 * One row per period, oldest first. `starts` are period start times, ascending; the last one
 * is the current period. For salary cycles each start is the day salary landed, so a row runs
 * from just before one salary to just before the next: what was really saved, with no salary
 * landing on one side of the line and not the other.
 */
export function periodRows(model: NetWorthModel, flows: Flow[], starts: number[]): MonthRow[] {
  const rows: MonthRow[] = [];
  const list = starts.filter((s) => s <= model.now).sort((a, b) => a - b);
  // Periods that ended before tracking began have nothing to show.
  const firstIdx = Math.max(0, list.findIndex((s, i) => (list[i + 1] ?? Infinity) > model.trackingStart));
  for (let i = firstIdx; i < list.length; i++) {
    const start = list[i];
    const isCurrent = i === list.length - 1;
    const fromTs = Math.max(start, model.trackingStart);
    const endTs = isCurrent ? model.now : list[i + 1] - 1;
    const openMinor = model.valueAt(fromTs - 1);
    const closeMinor = isCurrent ? model.liveMinor : model.valueAt(endTs);
    const totals = flowTotals(flows, fromTs, endTs);
    rows.push({
      monthStart: start,
      fromTs,
      endTs,
      days: Math.max(1, Math.round((startOfDay(endTs) - startOfDay(fromTs)) / DAY_MS) + 1),
      openMinor,
      closeMinor,
      changeMinor: closeMinor - openMinor,
      pct: pctChange(openMinor, closeMinor),
      inMinor: totals.inMinor,
      outMinor: totals.outMinor,
      isCurrent,
      isPartial: fromTs > start,
    });
  }
  return rows;
}

/** Start of every calendar month from the one tracking began in up to the current one. */
export function monthStartsSince(model: NetWorthModel): number[] {
  const out: number[] = [];
  const currentStart = monthStartOf(model.now);
  for (let start = monthStartOf(model.trackingStart); start <= currentStart; start = monthStartOf(start, 1)) out.push(start);
  return out;
}

/** One row per calendar month since tracking began, oldest first. */
export function monthRows(model: NetWorthModel, flows: Flow[]): MonthRow[] {
  return periodRows(model, flows, monthStartsSince(model));
}

export interface Bridge {
  fromTs: number;
  startMinor: number;
  inMinor: number;
  outMinor: number;
  /** Self transfers, cash withdrawals, card bills and Borrow & Lend changes, net. */
  movedMinor: number;
  /** Balance change no transaction explains. */
  untrackedMinor: number;
  nowMinor: number;
}

/** start + in − out + moved + untracked = now, for the period from `sinceTs` to now. */
export function bridgeSince(model: NetWorthModel, flows: Flow[], sinceTs: number): Bridge {
  const fromTs = Math.max(sinceTs, model.trackingStart);
  const startMinor = model.valueAt(fromTs - 1);
  const totals = flowTotals(flows, fromTs, model.now);
  const peerChange = model.peerAt(model.now) - model.peerAt(fromTs - 1);
  const movedMinor = totals.movedMinor + peerChange;
  return {
    fromTs,
    startMinor,
    inMinor: totals.inMinor,
    outMinor: totals.outMinor,
    movedMinor,
    untrackedMinor: model.liveMinor - startMinor - totals.inMinor + totals.outMinor - movedMinor,
    nowMinor: model.liveMinor,
  };
}

export interface PacePoint {
  day: number;
  /** Change since the month began. */
  minor: number;
}

/** Day-by-day change since the start of the month containing `monthTs` (stops at today). */
export function monthPace(model: NetWorthModel, monthTs: number): PacePoint[] {
  return periodPace(model, monthStartOf(monthTs), monthStartOf(monthTs, 1), true);
}

/**
 * Day-by-day change through a period [start, next). `day` is the day of the month when
 * `byDate`, else the day of the period (1 on its first day), for salary cycles.
 */
export function periodPace(model: NetWorthModel, start: number, next: number, byDate = false): PacePoint[] {
  if (next <= model.trackingStart) return [];
  const base = model.valueAt(Math.max(start, model.trackingStart) - 1);
  const out: PacePoint[] = [];
  const day = new Date(start);
  let index = 0;
  while (day.getTime() < next) {
    const dayStart = day.getTime();
    const dayNumber = day.getDate();
    index += 1;
    day.setDate(dayNumber + 1);
    if (dayStart > model.now) break;
    if (day.getTime() <= model.trackingStart) continue;
    out.push({ day: byDate ? dayNumber : index, minor: model.valueAt(Math.min(day.getTime() - 1, model.now)) - base });
  }
  return out;
}

export interface AccountChange {
  id: string;
  thenMinor: number;
  nowMinor: number;
  changeMinor: number;
}

/** Each account's balance at `refTs`, worked back from its balance today. */
export function accountChanges(accounts: { id: string; balanceMinor: number }[], flows: Flow[], refTs: number): AccountChange[] {
  const since = new Map<string, number>();
  for (const f of flows) {
    if (f.ts > refTs) since.set(f.bankId, (since.get(f.bankId) ?? 0) + f.minor);
  }
  return accounts.map((a) => {
    const changeMinor = since.get(a.id) ?? 0;
    return { id: a.id, thenMinor: a.balanceMinor - changeMinor, nowMinor: a.balanceMinor, changeMinor };
  });
}

export interface Health {
  /** Average change over finished, full periods (months or salary cycles); null until there is one. */
  avgGrowthMinor: number | null;
  /** How many full periods that average covers. */
  avgMonths: number;
  /**
   * Typical change per period for projections: the median of every full period, so one odd
   * period (a card bill, money moved to investments) can't drag it to nothing or inflate it.
   * Null until there is a full period; can be zero or negative.
   */
  typicalGrowthMinor: number | null;
  /** The biggest rise in any full period; null when none rose. */
  bestGrowthMinor: number | null;
  /** Periods in a row that ended higher than they began, counting the current one if it is up so far. */
  streakMonths: number;
  /** Share of this period's money in that is still there; null when nothing came in. */
  keptPct: number | null;
  /** Days of usual spending the current net worth covers; null without spending history. */
  runwayDays: number | null;
}

/**
 * @param isOdd rows to leave out of the averages (salary cycles stretched or squeezed by a job
 * change or a very late salary).
 */
export function health(model: NetWorthModel, rows: MonthRow[], isOdd?: (row: MonthRow) => boolean): Health {
  const full = rows.filter((r) => !r.isCurrent && !r.isPartial && !(isOdd && isOdd(r)));
  const avgGrowthMinor = full.length ? Math.round(full.reduce((s, r) => s + r.changeMinor, 0) / full.length) : null;
  const typicalGrowthMinor = full.length ? median(full.map((r) => r.changeMinor)) : null;
  const best = full.length ? Math.max(...full.map((r) => r.changeMinor)) : 0;
  const bestGrowthMinor = best > 0 ? best : null;

  let streakMonths = 0;
  for (let i = rows.length - 1; i >= 0 && rows[i].changeMinor > 0; i--) streakMonths++;

  const current = rows[rows.length - 1];
  // Share of what came in that stayed: the period's real change (after spending AND money moved
  // out), so it matches "₹19,454 stayed with you" on the steps card
  const keptPct = current && current.inMinor > 0 ? (current.changeMinor / current.inMinor) * 100 : null;

  // Usual daily spending from the real length of the last 3 full periods (28 to 31 days, or
  // whatever a salary cycle ran), not a flat 30.
  let dailyOut = 0;
  const recent = full.slice(-3);
  if (recent.length) {
    const days = recent.reduce((s, r) => s + (r.days || 30), 0);
    dailyOut = recent.reduce((s, r) => s + r.outMinor, 0) / Math.max(1, days);
  } else if (current) {
    const days = (model.now - current.fromTs) / DAY_MS;
    if (days >= 7) dailyOut = current.outMinor / days;
  }
  const runwayDays = dailyOut > 0 && model.liveMinor > 0 ? Math.floor(model.liveMinor / dailyOut) : null;

  return { avgGrowthMinor, avgMonths: full.length, typicalGrowthMinor, bestGrowthMinor, streakMonths, keptPct, runwayDays };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2);
}

/** Full periods of history the person asked for before a "how long at your pace" estimate. */
export const MIN_ESTIMATE_PERIODS = 3;

/** Whole months from the month containing `nowTs` to the month containing `byTs` (at least 1). */
export function monthsUntil(nowTs: number, byTs: number): number {
  const a = new Date(nowTs);
  const b = new Date(byTs);
  return Math.max(1, (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()));
}

export interface MilestonePlan {
  targetMinor: number;
  /** 0 to 1. */
  progress: number;
  toGoMinor: number;
  reached: boolean;
  /** Full periods behind the estimate. */
  historyPeriods: number;
  /** True until there are MIN_ESTIMATE_PERIODS full periods. */
  needsHistory: boolean;
  /** Periods to go at the typical pace; null without enough history or when the pace isn't growing. */
  periodsAtPace: number | null;
  /** The date the person wants it by, or null. */
  byTs: number | null;
  /** Periods left until byTs. */
  periodsLeft: number | null;
  /** What each remaining period needs to add to make byTs. */
  requiredPerPeriodMinor: number | null;
}

/**
 * The person's own net worth milestone: how far along, how long at their usual pace (only with
 * enough history), and the pace needed to make an optional month they picked.
 */
export function milestonePlan(opts: {
  liveMinor: number;
  targetMinor: number;
  typicalGrowthMinor: number | null;
  historyPeriods: number;
  byTs?: number | null;
  nowTs: number;
}): MilestonePlan {
  const { liveMinor, targetMinor, typicalGrowthMinor, historyPeriods, nowTs } = opts;
  const toGoMinor = Math.max(0, targetMinor - Math.max(0, liveMinor));
  const reached = toGoMinor === 0;
  const needsHistory = historyPeriods < MIN_ESTIMATE_PERIODS;
  const periodsAtPace =
    reached || needsHistory || typicalGrowthMinor === null || typicalGrowthMinor <= 0 ? null : Math.ceil(toGoMinor / typicalGrowthMinor);
  const byTs = opts.byTs ?? null;
  const periodsLeft = byTs === null ? null : monthsUntil(nowTs, byTs);
  return {
    targetMinor,
    progress: targetMinor > 0 ? Math.min(1, Math.max(0, liveMinor / targetMinor)) : 0,
    toGoMinor,
    reached,
    historyPeriods,
    needsHistory,
    periodsAtPace,
    byTs,
    periodsLeft,
    requiredPerPeriodMinor: periodsLeft === null || reached ? null : Math.ceil(toGoMinor / periodsLeft),
  };
}

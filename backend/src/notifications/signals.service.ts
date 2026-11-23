import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import * as crypto from 'crypto';

import { User } from '../users/entities/user.entity';
import { parsePaySchedule, type PaySchedule } from '../users/pay-schedule';
import { billAwarePace, detectBills } from './bill-pace';
import { PUSH_CHANNEL_ID } from './push-channel';
import { Transaction } from '../sync/entities/transaction.entity';
import { BudgetDeclaration } from '../sync/entities/budget-declaration.entity';
import { SavingsGoal } from '../sync/entities/savings-goal.entity';
import { BankProfile } from '../sync/entities/bank-profile.entity';
import { IncomeRecord } from '../sync/entities/income-record.entity';
import { NotificationLog } from './entities/notification-log.entity';
import { UserSignals } from './entities/user-signals.entity';
import { Notification } from './entities/notification.entity';
import {
  SignalType,
  SignalTone,
  SignalFacts,
  selectTemplate,
} from './signal-templates';

/* IST calendar helpers: the server may run in UTC, users live in IST. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC ms of 00:00 IST on the given IST calendar date (month may be out of range). */
const istMidnight = (y: number, m: number, d: number): number => Date.UTC(y, m, d) - IST_OFFSET_MS;

const istMidnightOf = (ts: number): number => {
  const ist = new Date(ts + IST_OFFSET_MS);
  return istMidnight(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
};

const istDaysBetween = (a: number, b: number): number => Math.round((istMidnightOf(b) - istMidnightOf(a)) / DAY_MS);

const ordinal = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const isPayday = (day: number | null | undefined): day is number =>
  typeof day === 'number' && Number.isInteger(day) && day >= 1 && day <= 31;

/** Payday in an IST month, clamped to its last day (31 → 28 Feb). Month may be out of range. */
const istPaydayIn = (y: number, m: number, payday: number): number => {
  const first = new Date(Date.UTC(y, m, 1));
  const yy = first.getUTCFullYear();
  const mm = first.getUTCMonth();
  const last = new Date(Date.UTC(yy, mm + 1, 0)).getUTCDate();
  return istMidnight(yy, mm, Math.min(payday, last));
};

/** Whole days until the next payday after today (today's payday counts as received); at least 1. */
export const daysToNextPaydayIST = (payday: number, now: number): number => {
  const today = istMidnightOf(now);
  const ist = new Date(now + IST_OFFSET_MS);
  let next = istPaydayIn(ist.getUTCFullYear(), ist.getUTCMonth(), payday);
  if (next <= today) next = istPaydayIn(ist.getUTCFullYear(), ist.getUTCMonth() + 1, payday);
  return Math.max(1, Math.round((next - today) / DAY_MS));
};

/**
 * Days to the next weekly or every-2-weeks payout (at least 1; today's payout counts as received).
 * Null for monthly or irregular pay, which use the salary day or month end.
 */
export const daysToNextPayoutIST = (schedule: PaySchedule | null, now: number): number | null => {
  if (!schedule) return null;
  const today = istMidnightOf(now);
  if (schedule.kind === 'weekly' && typeof schedule.weekday === 'number') {
    const dow = new Date(today + IST_OFFSET_MS).getUTCDay();
    const ahead = (schedule.weekday - dow + 7) % 7;
    return ahead === 0 ? 7 : ahead;
  }
  if (schedule.kind === 'fortnightly' && schedule.anchor) {
    const since = Math.round((today - istMidnightOf(schedule.anchor)) / DAY_MS);
    const into = ((since % 14) + 14) % 14;
    return 14 - into;
  }
  return null;
};

export interface EmiRisk {
  merchant: string;
  amount: number;
  /** Whole IST days until the due date (0 = today). */
  daysLeft: number;
  balance: number;
  shortBy: number;
}

const EMI_WORDS = /\bemi\b|\bloan|\bnach\b|\becs\b|bajaj fin|home ?credit/;

/**
 * EMIs due in the next `withinDays` IST days that the paying account can't cover. An EMI is
 * a merchant in an EMI/loan category paid in 2+ months, about once a month. Paid already
 * (from 7 days before the due date) → no warning. The balance is the account it was last
 * paid from, or all accounts when that isn't known.
 */
export function upcomingEmiRisks(
  txs: Array<{ merchant?: string | null; category?: string | null; amount: number; timestamp: number; bankProfileId?: string | null; isDeleted?: boolean }>,
  banks: Array<{ id: string; currentBalance?: number | string | null; accountType?: string | null }>,
  now: number,
  withinDays = 3,
): EmiRisk[] {
  const groups = new Map<string, { merchant: string; count: number; perMonth: Map<string, { amount: number; day: number; ts: number; bank: string | null }> }>();
  for (const tx of txs) {
    if (!tx || tx.isDeleted) continue;
    const merchant = (tx.merchant || '').trim();
    const text = `${tx.category || ''} ${merchant}`.toLowerCase();
    if (!EMI_WORDS.test(text) && !/emi_loans/.test(text)) continue;
    const key = merchant.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    const amount = Math.abs(Number(tx.amount)) || 0;
    if (key.length < 3 || amount < 99 || !tx.timestamp) continue;
    const ist = new Date(Number(tx.timestamp) + IST_OFFSET_MS);
    const month = `${ist.getUTCFullYear()}-${ist.getUTCMonth()}`;
    const g = groups.get(key) ?? { merchant, count: 0, perMonth: new Map() };
    g.count += 1;
    const prev = g.perMonth.get(month);
    if (!prev || amount > prev.amount) {
      g.perMonth.set(month, { amount, day: ist.getUTCDate(), ts: Number(tx.timestamp), bank: tx.bankProfileId ?? null });
    }
    groups.set(key, g);
  }

  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const spendable = (b: { currentBalance?: number | string | null; accountType?: string | null }) => {
    const type = String(b.accountType || '').toLowerCase();
    return type.includes('credit') || type.includes('overdraft') ? 0 : Number(b.currentBalance) || 0;
  };
  const totalBalance = banks.reduce((s, b) => s + spendable(b), 0);
  const today = istMidnightOf(now);
  const ist = new Date(now + IST_OFFSET_MS);
  const risks: EmiRisk[] = [];

  for (const [, g] of groups) {
    const months = [...g.perMonth.values()];
    if (months.length < 2 || g.count / months.length > 1.5) continue;
    const amount = Math.round(median(months.map((m) => m.amount)));
    const dueDay = median(months.map((m) => m.day));
    let due = istPaydayIn(ist.getUTCFullYear(), ist.getUTCMonth(), dueDay);
    if (due < today) due = istPaydayIn(ist.getUTCFullYear(), ist.getUTCMonth() + 1, dueDay);
    const daysLeft = Math.round((due - today) / DAY_MS);
    if (daysLeft > withinDays) continue;
    const paid = months.some((m) => m.ts >= due - 7 * DAY_MS);
    if (paid) continue;
    const last = months.reduce((a, b) => (b.ts > a.ts ? b : a));
    const bank = last.bank ? banks.find((b) => b.id === last.bank) : undefined;
    const balance = bank ? spendable(bank) : totalBalance;
    if (balance >= amount) continue;
    risks.push({ merchant: g.merchant, amount, daysLeft, balance, shortBy: amount - balance });
  }
  return risks.sort((a, b) => a.daysLeft - b.daysLeft);
}

export interface SignalCandidate {
  type: SignalType;
  score: number;
  urgency: number;
  moneyImpact: number;
  freshness: number;
  confidence: number;
  facts: SignalFacts;
  tone: SignalTone;
  deepLink: string;
}

@Injectable()
export class SignalsService {
  private readonly logger = new Logger(SignalsService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Transaction)
    private readonly transactionRepository: Repository<Transaction>,
    @InjectRepository(BudgetDeclaration)
    private readonly budgetRepository: Repository<BudgetDeclaration>,
    @InjectRepository(SavingsGoal)
    private readonly goalRepository: Repository<SavingsGoal>,
    @InjectRepository(BankProfile)
    private readonly bankRepository: Repository<BankProfile>,
    @InjectRepository(IncomeRecord)
    private readonly incomeRepository: Repository<IncomeRecord>,
    @InjectRepository(NotificationLog)
    private readonly logRepository: Repository<NotificationLog>,
    @InjectRepository(UserSignals)
    private readonly signalsRepository: Repository<UserSignals>,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
  ) {}

  /**
   * Evaluates all 6 core financial signals for a specific user from existing data.
   */
  async computeSignalsForUser(user: User): Promise<SignalCandidate[]> {
    const candidates: SignalCandidate[] = [];
    // Calendar day in IST, whatever timezone the server runs in (UTC is a day behind until 05:30 IST).
    const istNow = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
    const dayOfMonth = istNow.getUTCDate();
    const daysInMonth = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth() + 1, 0)).getUTCDate();
    const userName = (user.name || '').trim().split(' ')[0] || 'there';

    try {
      /* ------------------------------------------------------------------ */
      /* 1. PACE SIGNAL: Spending speed vs monthly budget                  */
      /* ------------------------------------------------------------------ */
      const budgets = await this.budgetRepository.find({
        where: { userId: user.id, isDeleted: false },
      });

      const nowMs = Date.now();
      // Last ~4 months of debits: fixed bills for pacing below, and the EMI check further down.
      const recentDebits = await this.transactionRepository.find({
        where: { userId: user.id, isDeleted: false, timestamp: MoreThanOrEqual(nowMs - 125 * DAY_MS) },
      });
      const bills = detectBills(recentDebits as any, nowMs);
      for (const b of budgets) {
        const limit = Number(b.limitAmount) || 0;
        const spent = Number(b.spentAmount) || 0;

        // Measure each budget over its own dates (a salary-cycle budget runs e.g. 31 Oct – 29 Nov);
        // budgets that have ended or not started yet are skipped.
        const bStart = Number(b.startDate) || 0;
        const bEnd = Number(b.endDate) || 0;
        let elapsedDays = dayOfMonth;
        let totalDays = daysInMonth;
        let periodStart = istMidnight(istNow.getUTCFullYear(), istNow.getUTCMonth(), 1);
        if (bStart && bEnd) {
          if (nowMs < bStart || nowMs > bEnd) continue;
          periodStart = istMidnightOf(bStart);
          totalDays = istDaysBetween(bStart, bEnd) + 1;
          elapsedDays = istDaysBetween(bStart, nowMs) + 1;
        }

        if (limit > 500 && spent > 200 && elapsedDays >= 3) {
          // Rent, EMI and SIP land early in the period: expect them instead of spreading evenly.
          const isOverall = !!(b as any).isOverall || (b.category || '').toLowerCase() === 'all';
          const budgetBills = isOverall ? bills : bills.filter((x) => x.category === (b.category || '').toLowerCase());
          const periodEnd = bStart && bEnd ? bEnd : periodStart + totalDays * DAY_MS - 1;
          const bp = budgetBills.length > 0 ? billAwarePace(limit, spent, periodStart, periodEnd, nowMs, budgetBills, recentDebits as any) : null;

          const dailySpend = bp ? bp.everydayPerDay : spent / elapsedDays;
          const projectedTotal = bp ? bp.projectedSpend : dailySpend * totalDays;
          // Room for everyday spending once the bills still to come are set aside.
          const room = limit - spent - (bp ? bp.billsUnpaid : 0);
          const burnoutDay = bp
            ? room <= 0
              ? elapsedDays
              : dailySpend > 0
                ? Math.min(totalDays, elapsedDays + Math.floor(room / dailySpend))
                : totalDays
            : Math.min(totalDays, Math.ceil(limit / dailySpend));
          const daysEarly = totalDays - burnoutDay;

          if (projectedTotal > limit && daysEarly >= 3) {
            const remainingDays = Math.max(1, totalDays - elapsedDays);
            const remainingBudget = Math.max(0, room);
            const safePerDay = remainingBudget / remainingDays;
            const burnoutDate = new Date(periodStart + (burnoutDay - 1) * DAY_MS + IST_OFFSET_MS).getUTCDate();

            const urgency = burnoutDay - elapsedDays <= 3 ? 9 : burnoutDay - elapsedDays <= 7 ? 7 : 5;
            const moneyImpact = limit >= 10000 ? 9 : limit >= 3000 ? 7 : 5;

            candidates.push({
              type: 'pace',
              score: urgency * 2.5 + moneyImpact * 2.0 + 8 * 1.5,
              urgency,
              moneyImpact,
              freshness: 9,
              confidence: 9,
              tone: 'nudging',
              deepLink: 'budgets',
              facts: {
                name: userName,
                category: b.category || b.name || 'Monthly',
                amount: spent,
                burnoutDate: ordinal(burnoutDate),
                daysEarly,
                perDay: safePerDay,
              },
            });
          }
        }
      }

      /* ------------------------------------------------------------------ */
      /* 2. HABIT SIGNAL: Frequent merchant visits in the past 7 days       */
      /* ------------------------------------------------------------------ */
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recentTx = await this.transactionRepository.find({
        where: {
          userId: user.id,
          isDeleted: false,
          timestamp: MoreThanOrEqual(sevenDaysAgo),
        },
        order: { timestamp: 'DESC' },
      });

      const merchantCounts = new Map<string, { count: number; total: number }>();
      for (const tx of recentTx) {
        const m = (tx.merchant || '').trim();
        if (!m || m.toLowerCase() === 'transfer' || m.toLowerCase() === 'unknown') continue;
        const current = merchantCounts.get(m) || { count: 0, total: 0 };
        current.count += 1;
        current.total += Number(tx.amount) || 0;
        merchantCounts.set(m, current);
      }

      for (const [merchant, data] of merchantCounts.entries()) {
        if (data.count >= 3 && data.total >= 500) {
          const urgency = data.count >= 4 ? 7 : 5;
          const moneyImpact = data.total >= 2500 ? 8 : 6;

          candidates.push({
            type: 'habit',
            score: urgency * 2.5 + moneyImpact * 2.0 + 7 * 1.5,
            urgency,
            moneyImpact,
            freshness: 8,
            confidence: 8,
            tone: 'playful',
            deepLink: 'transactions',
            facts: {
              name: userName,
              merchant,
              count: data.count,
              amount: data.total,
            },
          });
        }
      }

      /* ------------------------------------------------------------------ */
      /* 3. RUNWAY SIGNAL: Liquid bank balance / days until month end       */
      /* ------------------------------------------------------------------ */
      const banks = await this.bankRepository.find({
        where: { userId: user.id },
      });
      const totalLiquid = banks.reduce((sum, b) => sum + (Number(b.currentBalance) || 0), 0);
      // Days to the user's payday when they've set one, otherwise to month end.
      const schedule = parsePaySchedule(user.paySchedule);
      const scheduleDays = daysToNextPayoutIST(schedule, nowMs);
      const daysLeft =
        scheduleDays ??
        (isPayday(user.salaryDay) ? daysToNextPaydayIST(user.salaryDay, nowMs) : Math.max(1, daysInMonth - dayOfMonth + 1));

      if (totalLiquid > 0 && daysLeft <= 15) {
        const perDay = totalLiquid / daysLeft;
        const urgency = perDay < 150 ? 10 : perDay < 400 ? 8 : 4;
        const moneyImpact = totalLiquid < 5000 ? 8 : 5;

        candidates.push({
          type: 'runway',
          score: urgency * 2.5 + moneyImpact * 2.0 + 8 * 1.5,
          urgency,
          moneyImpact,
          freshness: 7,
          confidence: 9,
          tone: perDay < 200 ? 'straight' : 'playful',
          deepLink: 'banks',
          facts: {
            name: userName,
            runwayAmount: totalLiquid,
            daysLeft,
            perDay,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* 3b. EMI BOUNCE RISK: EMI due in ≤3 days, account can't cover it    */
      /* ------------------------------------------------------------------ */
      // A bounced EMI costs a ₹500+ charge and a credit score hit: this outranks everything else.
      const emiRisk = upcomingEmiRisks(recentDebits as any, banks as any, nowMs)[0];
      if (emiRisk) {
        candidates.push({
          type: 'bill_risk',
          score: 10 * 2.5 + 10 * 2.0 + 10 * 1.5,
          urgency: 10,
          moneyImpact: 10,
          freshness: 10,
          confidence: 8,
          tone: 'straight',
          deepLink: 'banks',
          facts: {
            name: userName,
            category: 'emi',
            merchant: emiRisk.merchant,
            amount: emiRisk.amount,
            daysLeft: emiRisk.daysLeft,
            runwayAmount: emiRisk.balance,
            gap: emiRisk.shortBy,
            dueWhen: emiRisk.daysLeft === 0 ? 'today' : emiRisk.daysLeft === 1 ? 'tomorrow' : `in ${emiRisk.daysLeft} days`,
          },
        });
      }

      /* ------------------------------------------------------------------ */
      /* 4. SPIKE SIGNAL: Category 1.8x+ higher than historic average       */
      /* ------------------------------------------------------------------ */
      const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
      const monthlyTx = await this.transactionRepository.find({
        where: {
          userId: user.id,
          isDeleted: false,
          timestamp: MoreThanOrEqual(thirtyDaysAgo),
        },
      });

      const catCurrent = new Map<string, number>();
      const catHistoric = new Map<string, { total: number; count: number }>();

      for (const tx of monthlyTx) {
        const cat = (tx.category || '').trim();
        if (!cat) continue;
        const amt = Number(tx.amount) || 0;
        if (Number(tx.timestamp) >= sevenDaysAgo) {
          catCurrent.set(cat, (catCurrent.get(cat) || 0) + amt);
        } else {
          const h = catHistoric.get(cat) || { total: 0, count: 0 };
          h.total += amt;
          h.count += 1;
          catHistoric.set(cat, h);
        }
      }

      for (const [cat, currentAmt] of catCurrent.entries()) {
        const h = catHistoric.get(cat);
        if (h && h.count >= 2) {
          const historicWeeklyAvg = (h.total / 23) * 7; // Average per 7 days
          if (historicWeeklyAvg >= 400 && currentAmt >= 1500) {
            const ratio = currentAmt / historicWeeklyAvg;
            if (ratio >= 1.8) {
              const urgency = ratio >= 2.5 ? 8 : 6;
              const moneyImpact = currentAmt >= 5000 ? 8 : 6;

              candidates.push({
                type: 'spike',
                score: urgency * 2.5 + moneyImpact * 2.0 + 8 * 1.5,
                urgency,
                moneyImpact,
                freshness: 8,
                confidence: 8,
                tone: 'playful',
                deepLink: 'transactions',
                facts: {
                  name: userName,
                  category: cat,
                  amount: currentAmt,
                  ratio: Math.round(ratio * 10) / 10,
                },
              });
            }
          }
        }
      }

      /* ------------------------------------------------------------------ */
      /* 5. WIN SIGNAL: Savings goal milestone or no-spend streaks          */
      /* ------------------------------------------------------------------ */
      const goals = await this.goalRepository.find({
        where: { userId: user.id },
      });

      for (const g of goals) {
        const target = Number(g.targetAmount) || 0;
        const current = Number(g.currentAmount) || 0;
        if (target > 0 && current > 0) {
          const pct = Math.round((current / target) * 100);
          if (pct >= 50 && pct <= 100) {
            const gap = Math.max(0, target - current);
            candidates.push({
              type: 'win',
              score: 7 * 2.5 + 7 * 2.0 + 8 * 1.5,
              urgency: 6,
              moneyImpact: 7,
              freshness: 8,
              confidence: 9,
              tone: 'playful',
              deepLink: 'goals',
              facts: {
                name: userName,
                goalName: g.name,
                pct,
                gap,
              },
            });
          }
        }
      }

      /* ------------------------------------------------------------------ */
      /* 6. SALARY / INFLOW: Major credit in the last 24h                   */
      /* ------------------------------------------------------------------ */
      const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const recentIncome = await this.incomeRepository.find({
        where: {
          userId: user.id,
          isDeleted: false,
          timestamp: MoreThanOrEqual(oneDayAgo),
        },
        order: { timestamp: 'DESC' },
      });

      for (const inc of recentIncome) {
        const amt = Number(inc.amount) || 0;
        const cat = (inc.category || '').toLowerCase();
        const src = (inc.source || '').toLowerCase();
        // Only credits tagged as salary: a large refund, FD maturity or repayment is not payday.
        const isSalary = amt > 0 && /salary|payroll|stipend/.test(`${cat} ${src}`);

        if (isSalary) {
          candidates.push({
            type: 'salary',
            score: 9 * 2.5 + 9 * 2.0 + 10 * 1.5,
            urgency: 9,
            moneyImpact: 9,
            freshness: 10,
            confidence: 9,
            tone: 'playful',
            deepLink: 'banks',
            facts: {
              name: userName,
              amount: amt,
            },
          });
        }
      }

      /* ------------------------------------------------------------------ */
      /* 7. SUMMARY SIGNAL: Weekly spend pulse when no strong alerts fire   */
      /* ------------------------------------------------------------------ */
      if (candidates.length === 0 && recentTx && recentTx.length > 0) {
        const totalRecentSpend = recentTx.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
        if (totalRecentSpend > 0) {
          const categoryTotals = new Map<string, number>();
          for (const tx of recentTx) {
            const cat = (tx.category || 'General').trim();
            categoryTotals.set(cat, (categoryTotals.get(cat) || 0) + (Number(tx.amount) || 0));
          }
          let topCategory = 'daily expenses';
          let maxCatAmount = 0;
          for (const [cat, amt] of categoryTotals.entries()) {
            if (amt > maxCatAmount) {
              maxCatAmount = amt;
              topCategory = cat;
            }
          }

          candidates.push({
            type: 'summary',
            score: 20, // Clears threshold >= 18
            urgency: 4,
            moneyImpact: 5,
            freshness: 7,
            confidence: 8,
            tone: 'playful',
            deepLink: 'transactions',
            facts: {
              name: userName,
              amount: totalRecentSpend,
              category: topCategory,
              count: recentTx.length,
            },
          });
        }
      }
    } catch (err: any) {
      this.logger.error(`Error computing signals for user ${user.id}: ${err.message}`, err.stack);
    }

    return candidates;
  }

  /**
   * Filters candidates according to frequency caps, quiet hours, cooldowns,
   * and picks the single top-scoring candidate.
   */
  async scoreAndPickTopCandidate(
    userId: string,
    candidates: SignalCandidate[],
  ): Promise<SignalCandidate | null> {
    if (!candidates || candidates.length === 0) return null;

    // 1. Guardrail: Quiet Hours (10:00 PM to 8:00 AM IST) - Timezone-safe UTC offset
    const istOffsetMs = 5.5 * 60 * 60 * 1000;
    const nowUtc = Date.now();
    const istNow = new Date(nowUtc + istOffsetMs);
    const istHour = istNow.getUTCHours();
    if (istHour >= 22 || istHour < 8) {
      this.logger.log(`[Delivery] Suppressing notification for user ${userId}: quiet hours (${istHour}:00 IST).`);
      return null;
    }

    // 2. Guardrail: Max 2 notifications per user per day (00:00 IST today)
    const startOfTodayMs = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()) - istOffsetMs;

    const todayCount = await this.logRepository.count({
      where: {
        userId,
        sentAt: MoreThanOrEqual(startOfTodayMs),
      },
    });

    if (todayCount >= 2) {
      this.logger.log(`[Delivery] Suppressing notification for user ${userId}: daily cap reached (${todayCount}/2).`);
      return null;
    }

    // 3. Guardrail: Cooldowns & Deduplication
    const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
    const recentLogs = await this.logRepository.find({
      where: {
        userId,
        sentAt: MoreThanOrEqual(threeDaysAgo),
      },
    });

    const recentTypes = new Set(recentLogs.map((l) => l.signalType));
    const recentNumbers = recentLogs.map((l) => JSON.stringify(l.numbersUsed || {}));

    const validCandidates = candidates.filter((c) => {
      // Cooldown: No pace, habit, or summary within 3 days
      if ((c.type === 'pace' || c.type === 'habit' || c.type === 'summary') && recentTypes.has(c.type)) {
        return false;
      }
      // Never send the exact same numbers twice
      const numbersKey = JSON.stringify(c.facts);
      if (recentNumbers.includes(numbersKey)) {
        return false;
      }
      return true;
    });

    if (validCandidates.length === 0) return null;

    // Sort by highest score
    validCandidates.sort((a, b) => b.score - a.score);
    const top = validCandidates[0];

    // Silence beats weak notifications: must clear minimum score of 18
    if (top.score < 18) {
      this.logger.log(`[Delivery] Top signal for user ${userId} (${top.type}) scored ${top.score} < 18 threshold. Skipping.`);
      return null;
    }

    return top;
  }

  /**
   * Evaluates user signals, picks the top candidate, renders template,
   * dispatches push notification, and logs to database.
   */
  async processAndDispatchForUser(
    user: User,
  ): Promise<{ sent: boolean; signal?: string; title?: string }> {
    if (!user.pushToken) {
      return { sent: false };
    }

    const candidates = await this.computeSignalsForUser(user);

    // Persist computed signals in core.user_signals
    try {
      const signalRecord = this.signalsRepository.create({
        id: 'sig_' + crypto.randomBytes(8).toString('hex'),
        userId: user.id,
        signals: candidates,
        computedAt: Date.now(),
      });
      await this.signalsRepository.save(signalRecord);
    } catch (saveErr: any) {
      this.logger.warn(`Could not save user_signals snapshot: ${saveErr.message}`);
    }

    const winner = await this.scoreAndPickTopCandidate(user.id, candidates);
    if (!winner) {
      return { sent: false };
    }

    // Select non-repeating template respecting safety guardrails
    const recentLogs = await this.logRepository.find({
      where: { userId: user.id },
      order: { sentAt: 'DESC' },
      take: 15,
    });
    const recentBodies = recentLogs.map((l) => l.body);

    const templateResult = selectTemplate(winner.type, winner.tone, winner.facts, recentBodies);
    const notifId = 'notif_' + crypto.randomBytes(8).toString('hex');
    const now = Date.now();

    // 1. Dispatch Push Notification via Expo
    const pushPayload = [
      {
        token: user.pushToken,
        title: templateResult.title,
        body: templateResult.body,
        payload: {
          notificationId: notifId,
          type: winner.type,
          deepLink: winner.deepLink,
        },
      },
    ];

    try {
      // 2. Save in core.notifications (In-App notification inbox)
      const inAppNotif = this.notificationRepository.create({
        id: notifId,
        userId: user.id,
        agentId: 'regent_signal',
        title: templateResult.title,
        body: templateResult.body,
        type: winner.type,
        readStatus: false,
        payload: {
          signalType: winner.type,
          deepLink: winner.deepLink,
          numbersUsed: winner.facts,
        },
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
      });
      await this.notificationRepository.save(inAppNotif);

      // 3. Log in core.notification_log (Open & analytics tracking)
      const logEntry = this.logRepository.create({
        id: notifId,
        userId: user.id,
        signalType: winner.type,
        numbersUsed: winner.facts,
        title: templateResult.title,
        body: templateResult.body,
        tone: templateResult.tone,
        deepLink: winner.deepLink,
        sentAt: now,
        isOpened: false,
      });
      await this.logRepository.save(logEntry);

      // 4. Send Expo Push
      const pushRes = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify([
          {
            to: user.pushToken,
            sound: 'default',
            title: templateResult.title,
            body: templateResult.body,
            channelId: PUSH_CHANNEL_ID,
            priority: 'high',
            data: {
              notificationId: notifId,
              type: winner.type,
              deepLink: winner.deepLink,
            },
          },
        ]),
      });

      this.logger.log(
        `[Signals] Dispatched "${templateResult.title}" (${winner.type}) to user ${user.id}. Push HTTP ${pushRes.status}`,
      );

      return {
        sent: true,
        signal: winner.type,
        title: templateResult.title,
      };
    } catch (err: any) {
      this.logger.error(`Failed to dispatch signal notification: ${err.message}`, err.stack);
      return { sent: false };
    }
  }

  /**
   * Nightly & Scheduled Signal Dispatch Job for all active users.
   */
  async runSignalsDispatchJob(): Promise<{ totalUsers: number; sentCount: number }> {
    this.logger.log('[SignalsJob] Running autonomous signals detection and dispatch...');
    // Only people who can actually receive a notification (a push token, not banned), loaded
    // 100 at a time instead of the whole users table. A short pause after each person lets
    // requests from the app through: this job runs at 9:30 AM and 8:30 PM, when people are
    // using the app, on a small shared CPU.
    const PAGE = 100;
    const PAUSE_MS = 150;
    let sentCount = 0;
    let totalUsers = 0;
    let afterId = '';

    for (;;) {
      const users = await this.userRepository
        .createQueryBuilder('u')
        .where('u.isDeleted = false')
        .andWhere('COALESCE(u.isBanned, false) = false')
        .andWhere("u.pushToken IS NOT NULL AND u.pushToken <> ''")
        .andWhere('u.id > :afterId', { afterId })
        .orderBy('u.id', 'ASC')
        .take(PAGE)
        .getMany();
      if (users.length === 0) break;

      for (const u of users) {
        try {
          const res = await this.processAndDispatchForUser(u);
          if (res.sent) sentCount++;
        } catch (userErr: any) {
          this.logger.warn(`Failed signal processing for user ${u.id}: ${userErr.message}`);
        }
        await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
      }

      totalUsers += users.length;
      afterId = users[users.length - 1].id;
      if (users.length < PAGE) break;
    }

    // Computed-signal snapshots are only read for the newest run: keep 30 days
    await this.signalsRepository
      .createQueryBuilder()
      .delete()
      .where('computed_at < :cutoff', { cutoff: Date.now() - 30 * 24 * 60 * 60 * 1000 })
      .execute()
      .catch((err: any) => this.logger.warn(`Could not purge old signal snapshots: ${err?.message || err}`));

    this.logger.log(`[SignalsJob] Finished. Processed ${totalUsers} users, dispatched ${sentCount} notifications.`);
    return { totalUsers, sentCount };
  }

  /**
   * Helper to evaluate signals for a specific user ID directly.
   */
  async evaluateUserSignals(userId: string): Promise<SignalCandidate[]> {
    const user = await this.userRepository.findOne({ where: { id: userId, isDeleted: false } });
    if (!user) return [];
    return this.computeSignalsForUser(user);
  }

  /**
   * Helper to trigger signal dispatch for a specific user ID directly.
   */
  async triggerUserDispatch(userId: string): Promise<{ sent: boolean; signal?: string; title?: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId, isDeleted: false } });
    if (!user) return { sent: false };
    return this.processAndDispatchForUser(user);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import * as crypto from 'crypto';

import { User } from '../users/entities/user.entity';
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
    const now = new Date();
    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const userName = (user.name || '').trim().split(' ')[0] || 'there';

    try {
      /* ------------------------------------------------------------------ */
      /* 1. PACE SIGNAL: Spending speed vs monthly budget                  */
      /* ------------------------------------------------------------------ */
      const budgets = await this.budgetRepository.find({
        where: { userId: user.id, isDeleted: false },
      });

      for (const b of budgets) {
        const limit = Number(b.limitAmount) || 0;
        const spent = Number(b.spentAmount) || 0;

        if (limit > 500 && spent > 200 && dayOfMonth >= 3) {
          const dailySpend = spent / dayOfMonth;
          const projectedTotal = dailySpend * daysInMonth;
          const burnoutDay = Math.min(daysInMonth, Math.ceil(limit / dailySpend));
          const daysEarly = daysInMonth - burnoutDay;

          if (projectedTotal > limit && daysEarly >= 3) {
            const remainingDays = Math.max(1, daysInMonth - dayOfMonth);
            const remainingBudget = Math.max(0, limit - spent);
            const safePerDay = remainingBudget / remainingDays;

            const urgency = burnoutDay - dayOfMonth <= 3 ? 9 : burnoutDay - dayOfMonth <= 7 ? 7 : 5;
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
                burnoutDate: `${burnoutDay}th`,
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
      const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);

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
        const isSalary = cat.includes('salary') || src.includes('salary') || amt >= 15000;

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

    // 1. Guardrail: Quiet Hours (10:00 PM to 8:00 AM IST)
    const istTimeStr = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istHour = new Date(istTimeStr).getHours();
    if (istHour >= 22 || istHour < 8) {
      this.logger.log(`[Delivery] Suppressing notification for user ${userId}: quiet hours (${istHour}:00 IST).`);
      return null;
    }

    // 2. Guardrail: Max 2 notifications per user per day (00:00 IST today)
    const istToday = new Date(istTimeStr);
    istToday.setHours(0, 0, 0, 0);
    const startOfTodayMs = istToday.getTime();

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
      // Cooldown: No pace or habit within 3 days
      if ((c.type === 'pace' || c.type === 'habit') && recentTypes.has(c.type)) {
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
            channelId: 'daily_alerts',
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
    const users = await this.userRepository.find({
      where: { isDeleted: false },
    });

    let sentCount = 0;
    for (const u of users) {
      try {
        const res = await this.processAndDispatchForUser(u);
        if (res.sent) sentCount++;
      } catch (userErr: any) {
        this.logger.warn(`Failed signal processing for user ${u.id}: ${userErr.message}`);
      }
    }

    this.logger.log(`[SignalsJob] Finished. Processed ${users.length} users, dispatched ${sentCount} notifications.`);
    return { totalUsers: users.length, sentCount };
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

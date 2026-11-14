import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { extractQueryRows } from './email-broadcast.service';
import { EmailAccountsService, DAILY_LIMIT } from './email-accounts.service';
import { MailService } from './mail.service';
import { EmailQueueRedis } from './email-queue-redis';
import { renderEmail, paragraph, button, itemList, noteBox, escapeHtml, emailEnv, EMAIL_COLORS } from './email-layout';

/**
 * Thank-you email for new users, sent right away:
 *  - email signups: the moment they verify their email
 *  - Google signups: the moment the account is created
 *
 * Durable queue in the dedicated email-queue Redis (no cron, nothing polls):
 *  - welcome:user:<id>   set once per user (SET NX), so nobody gets two and users who joined
 *                        before this existed never get one
 *  - welcome:queue       jobs waiting to send (LPUSH in, LMOVE out: first in, first out)
 *  - welcome:processing  jobs being sent; moved back to the queue on startup if the server died
 *  - welcome:retry       sorted set of jobs to try again later (score = when)
 *
 * A new job wakes the worker at once. Jobs that must wait (every account full, or a failed send)
 * are picked up by a single timer set for exactly when they are due, and again on every startup.
 *
 * Sending: welcome account -> broadcast account -> sign-in account (only down to its 200 reserve).
 */

/** A thank-you that couldn't go out within 3 days is no longer timely: it is dropped. */
export const WELCOME_EXPIRY_MS = 3 * 24 * 60 * 60_000;
export const WELCOME_MAX_ATTEMPTS = 5;
export const RETRY_STEP_MS = 15 * 60_000;

export const Q = {
  user: (id: string) => `welcome:user:${id}`,
  queue: 'welcome:queue',
  processing: 'welcome:processing',
  retry: 'welcome:retry',
};

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.regentmoney';

export type WelcomeSource = 'email_verified' | 'google';

export interface WelcomeJob {
  userId: string;
  email: string;
  name: string | null;
  source: WelcomeSource;
  attempts: number;
  queuedAt: number;
}

/** Milliseconds until a little after the next UTC midnight, when Brevo's daily limits reset. */
export function msUntilQuotaReset(now: number): number {
  const d = new Date(now);
  d.setUTCHours(24, 2, 0, 0);
  return d.getTime() - now;
}

/** Builds the welcome email. Pure, so tests and the design preview use exactly what users get. */
export function buildWelcomeEmail(p: {
  name?: string | null;
  logoUrl: string;
  appUrl?: string;
  termsUrl?: string | null;
  privacyUrl?: string | null;
}): { subject: string; html: string; text: string } {
  const first = (p.name || '').trim().split(/\s+/)[0] || 'there';
  const appUrl = p.appUrl || PLAY_STORE_URL;
  const strong = (t: string) => `<strong style="font-weight:600;color:${EMAIL_COLORS.ink};">${t}</strong>`;
  const sub = (t: string) => `<br><span style="color:${EMAIL_COLORS.sub};font-size:13px;line-height:20px;">${t}</span>`;

  const subject = `Thanks for joining Regent Money, ${first}`;
  const html = renderEmail({
    logoUrl: p.logoUrl,
    preheader: 'Your account is ready. Three quick steps to get the most out of your first week.',
    label: 'Welcome',
    labelTone: 'brand',
    title: `Thanks for joining, ${first}`,
    bodyHtml:
      paragraph(
        "We're glad you're here. Regent Money shows you where your money goes each month, so you can spend with confidence and save without spreadsheets.",
      ) +
      paragraph(strong('Three things to set up first'), { size: 15 }).replace('margin:0 0 18px', 'margin:4px 0 10px') +
      itemList([
        strong('1. Turn on SMS tracking') + sub('Bank and UPI messages become transactions on their own, so you never type an expense.'),
        strong('2. Set a monthly budget') + sub('Pick a limit per category and get a heads-up before you go over.'),
        strong('3. Add your cash wallet') + sub('Log cash spends next to your accounts for one honest total.'),
      ]) +
      button('Open Regent Money', appUrl) +
      noteBox(
        `${strong('You stay in control.')} See what Regent Money stores and how it is used, any time, in ${strong('Privacy Center')} in the app.`,
      ) +
      paragraph('Questions or ideas? Just reply to this email. A real person reads every one.', {
        size: 13,
        color: EMAIL_COLORS.sub,
      }) +
      paragraph(`Warmly,<br>${strong('RAO DEV STUDIOS')}`, { size: 14 }),
    footerReason: "You're receiving this one-time email because you created a Regent Money account.",
    termsUrl: p.termsUrl,
    privacyUrl: p.privacyUrl,
  });

  const text = [
    `Hi ${first},`,
    '',
    "Thanks for joining Regent Money. We're glad you're here.",
    '',
    'Three things to set up first:',
    '1. Turn on SMS tracking: bank and UPI messages become transactions on their own.',
    '2. Set a monthly budget: get a heads-up before a category goes over.',
    '3. Add your cash wallet: log cash spends next to your accounts.',
    '',
    `Open Regent Money: ${appUrl}`,
    '',
    'See what Regent Money stores and how it is used, any time, in Privacy Center in the app.',
    'Questions or ideas? Just reply to this email.',
    '',
    'Warmly,',
    'RAO DEV STUDIOS',
  ].join('\n');

  return { subject, html, text };
}


@Injectable()
export class WelcomeEmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WelcomeEmailService.name);
  private readonly redis: EmailQueueRedis | null;
  private draining = false;
  private drainAgain = false;
  private wakeTimer: NodeJS.Timeout | null = null;
  private wakeAt = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly accounts: EmailAccountsService,
    private readonly mailService: MailService,
  ) {
    this.redis = EmailQueueRedis.fromEnv((k) => this.configService.get<string>(k));
  }

  async onModuleInit() {
    if (!this.redis) {
      this.logger.warn('[WelcomeEmail] EMAIL_QUEUE_REDIS_REST_URL/TOKEN not set: welcome emails send directly, without a durable queue.');
      return;
    }
    try {
      // Jobs left mid-send by a restart go back to the front of the queue.
      let moved = 0;
      while ((await this.redis.cmd('LMOVE', Q.processing, Q.queue, 'RIGHT', 'RIGHT')) !== null) moved++;
      if (moved) this.logger.log(`[WelcomeEmail] Recovered ${moved} welcome email(s) after restart.`);
    } catch (err: any) {
      this.logger.warn(`[WelcomeEmail] Queue recovery failed: ${err.message}`);
    }
    this.kick();
  }

  onModuleDestroy() {
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
  }

  /**
   * Queues the thank-you email for a user who just joined and wakes the worker. Safe to call more
   * than once: a user gets at most one welcome email ever. Never throws and never waits for the
   * send, so sign-in is never slowed or broken by it.
   */
  async schedule(user: { id: string; email?: string | null; name?: string | null }, source: WelcomeSource): Promise<void> {
    if (!user?.id || !user.email) return;
    const job: WelcomeJob = {
      userId: user.id,
      email: user.email.trim().toLowerCase(),
      name: user.name || null,
      source,
      attempts: 0,
      queuedAt: Date.now(),
    };
    try {
      if (!this.redis) {
        // No queue configured: best effort, straight away.
        void this.process(job).catch(() => undefined);
        return;
      }
      const first = await this.redis.cmd('SET', Q.user(user.id), source, 'NX');
      if (first !== 'OK') return; // already welcomed (or queued)
      await this.redis.cmd('LPUSH', Q.queue, JSON.stringify(job));
      this.kick();
    } catch (err: any) {
      this.logger.warn(`[WelcomeEmail] Could not queue welcome email for ${user.id}: ${err.message}`);
    }
  }

  /** Starts draining now (or right after the current drain finishes). */
  private kick(): void {
    if (this.draining) {
      this.drainAgain = true;
      return;
    }
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (!this.redis) return;
    this.draining = true;
    try {
      do {
        this.drainAgain = false;
        await this.promoteDueRetries();
        await this.drainOnce();
      } while (this.drainAgain);
      await this.armRetryTimer();
    } catch (err: any) {
      this.logger.error(`[WelcomeEmail] Worker error: ${err?.message || err}`);
      this.wakeIn(RETRY_STEP_MS); // Redis or DB hiccup: look again later
    } finally {
      this.draining = false;
    }
  }

  /** Moves retry jobs whose time has come back into the queue. */
  private async promoteDueRetries(): Promise<void> {
    const redis = this.redis!;
    const due: string[] = (await redis.cmd('ZRANGEBYSCORE', Q.retry, '-inf', Date.now(), 'LIMIT', 0, 100)) || [];
    for (const raw of due) {
      // ZREM returns 1 for exactly one caller, so two servers never both requeue it.
      if (Number(await redis.cmd('ZREM', Q.retry, raw)) === 1) await redis.cmd('LPUSH', Q.queue, raw);
    }
  }

  private async drainOnce(): Promise<void> {
    const redis = this.redis!;
    while (true) {
      const chain = await this.accounts.getChain('welcome');
      if (chain.reduce((n, s) => n + s.left, 0) <= 0) {
        const waiting = Number(await redis.cmd('LLEN', Q.queue));
        if (waiting > 0) {
          this.logger.warn(`[WelcomeEmail] All email accounts are full today; ${waiting} welcome email(s) wait for the reset.`);
          this.wakeIn(msUntilQuotaReset(Date.now()));
        }
        return;
      }

      const raw: string | null = await redis.cmd('LMOVE', Q.queue, Q.processing, 'RIGHT', 'LEFT');
      if (raw === null) return;

      let job: WelcomeJob;
      try {
        job = JSON.parse(raw);
      } catch {
        await redis.cmd('LREM', Q.processing, 1, raw);
        continue;
      }

      const outcome = await this.process(job);
      await redis.cmd('LREM', Q.processing, 1, raw);

      if (outcome === 'quota') {
        // Every account refused: put it back at the front and wait for the reset.
        await redis.cmd('RPUSH', Q.queue, raw);
        this.wakeIn(msUntilQuotaReset(Date.now()));
        return;
      }
      if (outcome === 'retry') {
        const next: WelcomeJob = { ...job, attempts: job.attempts + 1 };
        await redis.cmd('ZADD', Q.retry, Date.now() + next.attempts * RETRY_STEP_MS, JSON.stringify(next));
      }
    }
  }

  /** Sends one job. 'done' covers sent, skipped and given up. */
  private async process(job: WelcomeJob): Promise<'done' | 'retry' | 'quota'> {
    if (Date.now() - job.queuedAt > WELCOME_EXPIRY_MS) {
      this.logger.warn(`[WelcomeEmail] Dropped welcome email for ${job.userId}: older than 3 days.`);
      return 'done';
    }

    const user = extractQueryRows<{ email: string; name: string | null; ok: boolean }>(
      await this.dataSource.query(
        `SELECT email, name,
           (NOT COALESCE(is_deleted, false) AND NOT COALESCE(is_banned, false)
            AND NOT COALESCE(is_scheduled_for_deletion, false) AND COALESCE(is_verified, false)) AS ok
         FROM core.users WHERE id = $1;`,
        [job.userId],
      ),
    )[0];
    if (!user || !user.ok || !user.email) return 'done';

    const env = emailEnv((k) => this.configService.get<string>(k));
    const links = await this.accounts.getLegalLinks();
    const mail = buildWelcomeEmail({ name: user.name || job.name, logoUrl: env.logoUrl, ...links });
    const res = await this.accounts.sendWithFallback('welcome', {
      toEmail: user.email,
      toName: user.name || undefined,
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
    });

    if (res.success) {
      await this.mailService.logEmailSent(user.email, 'welcome', 'sent', res.messageId, undefined, res.account);
      return 'done';
    }
    if (res.isQuotaError) return 'quota';

    await this.mailService.logEmailSent(user.email, 'welcome', 'failed', undefined, res.errorMessage, res.account);
    if (job.attempts + 1 >= WELCOME_MAX_ATTEMPTS) {
      this.logger.error(`[WelcomeEmail] Gave up on welcome email for ${job.userId}: ${res.errorMessage}`);
      return 'done';
    }
    return 'retry';
  }

  /** One timer for the earliest waiting retry, so nothing polls. */
  private async armRetryTimer(): Promise<void> {
    const first: string[] = (await this.redis!.cmd('ZRANGE', Q.retry, 0, 0, 'WITHSCORES')) || [];
    if (first.length === 2) this.wakeIn(Math.max(1_000, Number(first[1]) - Date.now()));
  }

  /** Wakes the worker after `ms`, keeping only the earliest pending wake-up. */
  private wakeIn(ms: number): void {
    const at = Date.now() + ms;
    if (this.wakeTimer && this.wakeAt <= at) return;
    if (this.wakeTimer) clearTimeout(this.wakeTimer);
    this.wakeAt = at;
    // setTimeout caps at ~24.8 days; our waits are at most a day.
    this.wakeTimer = setTimeout(() => {
      this.wakeTimer = null;
      this.kick();
    }, ms);
    this.wakeTimer.unref?.();
  }

  /** For the admin email overview. */
  async getStats(): Promise<{
    isConfigured: boolean;
    queueConfigured: boolean;
    senderEmail: string;
    sentToday: number;
    remainingToday: number;
    dailyLimit: number;
    queued: number;
    welcomesSentToday: number;
  }> {
    const [usage, remaining] = await Promise.all([this.accounts.getUsageToday(), this.accounts.getRemaining()]);
    let queued = 0;
    let welcomesSentToday = 0;
    try {
      if (this.redis) {
        const [waiting, retrying, sending] = await Promise.all([
          this.redis.cmd('LLEN', Q.queue),
          this.redis.cmd('ZCARD', Q.retry),
          this.redis.cmd('LLEN', Q.processing),
        ]);
        queued = Number(waiting) + Number(retrying) + Number(sending);
      }
      const start = new Date();
      start.setUTCHours(0, 0, 0, 0);
      const row = extractQueryRows<{ n: number }>(
        await this.dataSource.query(
          `SELECT COUNT(*)::int AS n FROM core.auth_email_logs WHERE type = 'welcome' AND status = 'sent' AND sent_at >= $1;`,
          [start.getTime()],
        ),
      )[0];
      welcomesSentToday = Number(row?.n || 0);
    } catch {
      /* stats are best effort */
    }
    return {
      isConfigured: this.accounts.isConfigured('welcome'),
      queueConfigured: !!this.redis,
      senderEmail: this.accounts.getAccountConfig('welcome').senderEmail,
      sentToday: usage.welcome.sent,
      remainingToday: remaining.welcome,
      dailyLimit: DAILY_LIMIT,
      queued,
      welcomesSentToday,
    };
  }
}

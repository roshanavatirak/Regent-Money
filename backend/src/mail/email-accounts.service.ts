import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

/**
 * Two Brevo sender accounts, each with its own free daily limit:
 *  - primary:   sign-in mail (verification, password reset)
 *  - broadcast: announcements and updates
 *
 * When "fallback" is on (the default), a sender that hits its daily limit borrows the other one:
 *  - sign-in mail may use all of the broadcast account's remaining emails;
 *  - broadcasts may use the primary account only down to PRIMARY_RESERVE, so sign-in mail
 *    always keeps some room for the rest of the day.
 *
 * Usage is counted per account (not per purpose), from both log tables.
 */
export type EmailAccount = 'primary' | 'broadcast';

export const DAILY_LIMIT = 300;
export const PRIMARY_RESERVE = 50;

const SETTINGS_KEY = 'email_fallback_enabled';
const TERMS_KEY = 'legal_terms_url';
const PRIVACY_KEY = 'legal_privacy_url';
/** First values written to the database; change them there afterwards. */
const DEFAULT_LINKS: Record<string, string> = {
  [TERMS_KEY]: 'https://raodevstudios.in/terms',
  [PRIVACY_KEY]: 'https://raodevstudios.in/privacy',
};
const CACHE_MS = 30_000;

export interface BrevoSendResult {
  success: boolean;
  messageId?: string;
  isQuotaError?: boolean;
  errorMessage?: string;
}

const clean = (v?: string | null) => (v || '').replace(/^["']|["']$/g, '').trim();

@Injectable()
export class EmailAccountsService implements OnModuleInit {
  private readonly logger = new Logger(EmailAccountsService.name);
  private fallbackCache: { value: boolean; at: number } | null = null;
  private linksCache: { value: { termsUrl: string | null; privacyUrl: string | null }; at: number } | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.email_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at BIGINT NOT NULL,
          updated_by TEXT
        );
      `);
      // Seed the legal links once; an existing row (edited later) is never overwritten.
      for (const [key, url] of Object.entries(DEFAULT_LINKS)) {
        await this.dataSource.query(
          `INSERT INTO core.email_settings (key, value, updated_at, updated_by)
           VALUES ($1, $2::jsonb, $3, 'system') ON CONFLICT (key) DO NOTHING;`,
          [key, JSON.stringify(url), Date.now()],
        );
      }
    } catch (err: any) {
      this.logger.warn(`Could not verify email_settings table: ${err.message}`);
    }
  }

  /* ---------------- account credentials ---------------- */

  getAccountConfig(account: EmailAccount): { apiKey: string; senderEmail: string; senderName: string } {
    if (account === 'primary') {
      return {
        apiKey: clean(this.configService.get<string>('BREVO_API_KEY')),
        senderEmail: clean(this.configService.get<string>('BREVO_SENDER_EMAIL')),
        senderName: clean(this.configService.get<string>('BREVO_SENDER_NAME')) || 'Regent Money',
      };
    }
    return {
      apiKey: clean(this.configService.get<string>('BREVO_BROADCAST_API_KEY')),
      senderEmail: clean(this.configService.get<string>('BREVO_BROADCAST_SENDER_EMAIL')),
      senderName: clean(this.configService.get<string>('BREVO_BROADCAST_SENDER_NAME')) || 'Regent Money',
    };
  }

  isConfigured(account: EmailAccount): boolean {
    const c = this.getAccountConfig(account);
    return c.apiKey.length > 10 && !!c.senderEmail;
  }

  /** Fallback only makes sense when both accounts exist and are actually different accounts. */
  canFallBack(): boolean {
    return (
      this.isConfigured('primary') &&
      this.isConfigured('broadcast') &&
      this.getAccountConfig('primary').apiKey !== this.getAccountConfig('broadcast').apiKey
    );
  }

  /* ---------------- fallback setting ---------------- */

  async isFallbackEnabled(): Promise<boolean> {
    if (this.fallbackCache && Date.now() - this.fallbackCache.at < CACHE_MS) return this.fallbackCache.value;
    let value = true; // default on
    try {
      const rows = await this.dataSource.query(`SELECT value FROM core.email_settings WHERE key = $1;`, [SETTINGS_KEY]);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row && typeof row.value === 'boolean') value = row.value;
    } catch {
      // table missing on a fresh boot: keep the default
    }
    this.fallbackCache = { value, at: Date.now() };
    return value;
  }

  async setFallbackEnabled(enabled: boolean, adminId: string): Promise<boolean> {
    await this.dataSource.query(
      `INSERT INTO core.email_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at, updated_by = EXCLUDED.updated_by;`,
      [SETTINGS_KEY, JSON.stringify(!!enabled), Date.now(), adminId],
    );
    this.fallbackCache = { value: !!enabled, at: Date.now() };
    return !!enabled;
  }

  /* ---------------- legal links (email footers) ---------------- */

  /** Privacy policy and Terms links shown in every email footer, read from core.email_settings. */
  async getLegalLinks(): Promise<{ termsUrl: string | null; privacyUrl: string | null }> {
    if (this.linksCache && Date.now() - this.linksCache.at < CACHE_MS * 2) return this.linksCache.value;
    const value = { termsUrl: DEFAULT_LINKS[TERMS_KEY] as string | null, privacyUrl: DEFAULT_LINKS[PRIVACY_KEY] as string | null };
    try {
      const rows = await this.dataSource.query(`SELECT key, value FROM core.email_settings WHERE key = ANY($1);`, [[TERMS_KEY, PRIVACY_KEY]]);
      for (const r of Array.isArray(rows) ? rows : []) {
        const url = typeof r.value === 'string' && /^https:\/\//i.test(r.value) ? r.value : null;
        if (r.key === TERMS_KEY) value.termsUrl = url;
        if (r.key === PRIVACY_KEY) value.privacyUrl = url;
      }
    } catch {
      // table missing on a fresh boot: use the defaults
    }
    this.linksCache = { value, at: Date.now() };
    return value;
  }

  /* ---------------- usage ---------------- */

  private startOfTodayUtc(): number {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  }

  /**
   * Emails sent today by each account, whatever they were for.
   * `borrowed` = emails this account sent on behalf of the other purpose.
   */
  async getUsageToday(): Promise<{
    primary: { sent: number; borrowed: number };
    broadcast: { sent: number; borrowed: number };
  }> {
    const start = this.startOfTodayUtc();
    let auth = { primary: 0, broadcast: 0 };
    let bulk = { primary: 0, broadcast: 0 };
    try {
      const rows = await this.dataSource.query(
        `SELECT COALESCE(account, 'primary') AS account, COUNT(*)::int AS n
         FROM core.auth_email_logs WHERE status = 'sent' AND sent_at >= $1
         GROUP BY 1;`,
        [start],
      );
      for (const r of rows || []) if (r.account === 'primary' || r.account === 'broadcast') auth[r.account as EmailAccount] = Number(r.n) || 0;
    } catch {
      /* table not created yet */
    }
    try {
      const rows = await this.dataSource.query(
        `SELECT COALESCE(sent_via, 'broadcast') AS account, COUNT(*)::int AS n
         FROM core.email_recipients WHERE status = 'sent' AND sent_at >= $1
         GROUP BY 1;`,
        [start],
      );
      for (const r of rows || []) if (r.account === 'primary' || r.account === 'broadcast') bulk[r.account as EmailAccount] = Number(r.n) || 0;
    } catch {
      /* table not created yet */
    }
    return {
      primary: { sent: auth.primary + bulk.primary, borrowed: bulk.primary },
      broadcast: { sent: auth.broadcast + bulk.broadcast, borrowed: auth.broadcast },
    };
  }

  async getRemaining(): Promise<{ primary: number; broadcast: number }> {
    const u = await this.getUsageToday();
    return {
      primary: Math.max(0, DAILY_LIMIT - u.primary.sent),
      broadcast: Math.max(0, DAILY_LIMIT - u.broadcast.sent),
    };
  }

  /** How many emails broadcasts may still send today, including what they may borrow. */
  async getBroadcastCapacity(): Promise<{ own: number; borrowable: number }> {
    const [remaining, fallback] = await Promise.all([this.getRemaining(), this.isFallbackEnabled()]);
    const primarySpare = Math.max(0, remaining.primary - PRIMARY_RESERVE);
    // No separate broadcast account set up: broadcasts have always used the primary one.
    // Keep doing that, but never below the sign-in reserve.
    if (!this.isConfigured('broadcast')) {
      return { own: 0, borrowable: this.isConfigured('primary') ? primarySpare : 0 };
    }
    const borrowable = fallback && this.canFallBack() ? primarySpare : 0;
    return { own: remaining.broadcast, borrowable };
  }

  /* ---------------- sending ---------------- */

  async sendVia(
    account: EmailAccount,
    options: {
      toEmail: string;
      toName?: string;
      subject: string;
      htmlContent: string;
      textContent?: string;
      headers?: Record<string, string>;
    },
  ): Promise<BrevoSendResult> {
    const cfg = this.getAccountConfig(account);
    if (!cfg.apiKey || !cfg.senderEmail) {
      return { success: false, errorMessage: `${account} email account is not configured` };
    }
    const payload: any = {
      sender: { name: cfg.senderName, email: cfg.senderEmail },
      to: [{ email: options.toEmail, name: options.toName || options.toEmail }],
      subject: options.subject,
      htmlContent: options.htmlContent,
    };
    if (options.textContent) payload.textContent = options.textContent;
    if (options.headers) payload.headers = options.headers;

    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { accept: 'application/json', 'api-key': cfg.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.status === 402 || res.status === 429) {
        return { success: false, isQuotaError: true, errorMessage: `Brevo daily limit reached (HTTP ${res.status})` };
      }
      if (!res.ok) {
        const text = await res.text();
        return { success: false, errorMessage: `Brevo error ${res.status}: ${text}` };
      }
      const json: any = await res.json().catch(() => ({}));
      return { success: true, messageId: json?.messageId || 'ok' };
    } catch (err: any) {
      return { success: false, errorMessage: err?.message || 'Network error' };
    }
  }

  /**
   * Sends sign-in mail. Uses the primary account; if it is out of emails (by our count or by
   * Brevo's answer) and fallback is on, sends through the broadcast account instead.
   */
  async sendAuthEmail(options: {
    toEmail: string;
    toName?: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
  }): Promise<BrevoSendResult & { account: EmailAccount }> {
    const [remaining, fallback] = await Promise.all([this.getRemaining(), this.isFallbackEnabled()]);
    const mayBorrow = fallback && this.canFallBack();

    let first: EmailAccount = 'primary';
    if (remaining.primary <= 0 && mayBorrow && remaining.broadcast > 0) first = 'broadcast';

    const res = await this.sendVia(first, options);
    if (res.success || first === 'broadcast' || !mayBorrow) return { ...res, account: first };

    // Primary refused because of its daily limit: try the broadcast account once.
    if (res.isQuotaError && remaining.broadcast > 0) {
      this.logger.warn('[EmailFallback] Primary account hit its daily limit; sending sign-in mail via broadcast account.');
      const retry = await this.sendVia('broadcast', options);
      return { ...retry, account: 'broadcast' };
    }
    return { ...res, account: first };
  }
}

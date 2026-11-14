import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

/**
 * Three Brevo sender accounts, each with its own free daily limit (300):
 *  - primary:   sign-in mail (verification, password reset)
 *  - broadcast: announcements and updates ("custom" emails sent from the admin console)
 *  - welcome:   the thank-you email new users get right after they verify or sign up with Google
 *
 * When "fallback" is on (the default), a sender that hits its daily limit borrows the next one in
 * its chain (FALLBACK_CHAIN). The sign-in account is always last, and other purposes may use it
 * only down to PRIMARY_RESERVE, so verification and password reset keep 200 emails for the day.
 *
 * Usage is counted per account (not per purpose), from both log tables.
 */
export type EmailAccount = 'primary' | 'broadcast' | 'welcome';
export type EmailPurpose = 'auth' | 'broadcast' | 'welcome';

export const DAILY_LIMIT = 300;
/** Emails the sign-in account always keeps for verification/password reset (others may use only 300 - 200 = 100). */
export const PRIMARY_RESERVE = 200;

export const ACCOUNTS: EmailAccount[] = ['primary', 'broadcast', 'welcome'];

/** Order in which each kind of email tries the accounts. The first one is the purpose's own account. */
export const FALLBACK_CHAIN: Record<EmailPurpose, EmailAccount[]> = {
  auth: ['primary', 'broadcast', 'welcome'],
  broadcast: ['broadcast', 'welcome', 'primary'],
  welcome: ['welcome', 'broadcast', 'primary'],
};

export const OWN_ACCOUNT: Record<EmailPurpose, EmailAccount> = {
  auth: 'primary',
  broadcast: 'broadcast',
  welcome: 'welcome',
};

/** One step of a purpose's chain with how many emails it may still send for that purpose today. */
export interface ChainStep {
  account: EmailAccount;
  left: number;
}

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
    const prefix = account === 'primary' ? 'BREVO' : account === 'broadcast' ? 'BREVO_BROADCAST' : 'BREVO_WELCOME';
    return {
      apiKey: clean(this.configService.get<string>(`${prefix}_API_KEY`)),
      senderEmail: clean(this.configService.get<string>(`${prefix}_SENDER_EMAIL`)),
      senderName: clean(this.configService.get<string>(`${prefix}_SENDER_NAME`)) || 'Regent Money',
    };
  }

  isConfigured(account: EmailAccount): boolean {
    const c = this.getAccountConfig(account);
    return c.apiKey.length > 10 && !!c.senderEmail;
  }

  /**
   * Accounts that really exist, each counted once: an account whose API key repeats an earlier
   * account's key is the same Brevo account (same daily limit), so it is left out.
   */
  private distinctAccounts(order: EmailAccount[]): EmailAccount[] {
    const seen = new Set<string>();
    const out: EmailAccount[] = [];
    for (const a of order) {
      if (!this.isConfigured(a)) continue;
      const key = this.getAccountConfig(a).apiKey;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(a);
    }
    return out;
  }

  /** Fallback only makes sense when at least two different accounts exist. */
  canFallBack(): boolean {
    return this.distinctAccounts(ACCOUNTS).length >= 2;
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
   * `borrowed` = emails this account sent on behalf of another purpose.
   */
  async getUsageToday(): Promise<Record<EmailAccount, { sent: number; borrowed: number }>> {
    const start = this.startOfTodayUtc();
    const usage: Record<EmailAccount, { sent: number; borrowed: number }> = {
      primary: { sent: 0, borrowed: 0 },
      broadcast: { sent: 0, borrowed: 0 },
      welcome: { sent: 0, borrowed: 0 },
    };
    const isAccount = (v: any): v is EmailAccount => ACCOUNTS.includes(v);
    try {
      // Sign-in and welcome emails. Welcome rows have type 'welcome'; every other type is sign-in mail.
      const rows = await this.dataSource.query(
        `SELECT COALESCE(account, 'primary') AS account, (type = 'welcome') AS is_welcome, COUNT(*)::int AS n
         FROM core.auth_email_logs WHERE status = 'sent' AND sent_at >= $1
         GROUP BY 1, 2;`,
        [start],
      );
      for (const r of rows || []) {
        if (!isAccount(r.account)) continue;
        const n = Number(r.n) || 0;
        const own: EmailAccount = r.is_welcome === true ? 'welcome' : 'primary';
        usage[r.account].sent += n;
        if (r.account !== own) usage[r.account].borrowed += n;
      }
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
      for (const r of rows || []) {
        if (!isAccount(r.account)) continue;
        const n = Number(r.n) || 0;
        usage[r.account].sent += n;
        if (r.account !== 'broadcast') usage[r.account].borrowed += n;
      }
    } catch {
      /* table not created yet */
    }
    return usage;
  }

  async getRemaining(): Promise<Record<EmailAccount, number>> {
    const u = await this.getUsageToday();
    return {
      primary: Math.max(0, DAILY_LIMIT - u.primary.sent),
      broadcast: Math.max(0, DAILY_LIMIT - u.broadcast.sent),
      welcome: Math.max(0, DAILY_LIMIT - u.welcome.sent),
    };
  }

  /**
   * The accounts a purpose may use right now, in order, with how many emails each may still send
   * for it today. Only steps with room are returned.
   *  - its own account: everything left today
   *  - another account (when fallback is on, or when the purpose has no account of its own):
   *    everything left, except the sign-in account, which keeps PRIMARY_RESERVE for itself
   */
  async getChain(purpose: EmailPurpose): Promise<ChainStep[]> {
    const [remaining, fallback] = await Promise.all([this.getRemaining(), this.isFallbackEnabled()]);
    const own = OWN_ACCOUNT[purpose];
    const mayBorrow = fallback || !this.isConfigured(own);
    const steps: ChainStep[] = [];
    for (const account of this.distinctAccounts(FALLBACK_CHAIN[purpose])) {
      const isOwn = account === own;
      if (!isOwn && !mayBorrow) continue;
      const left =
        isOwn || account !== 'primary' ? remaining[account] : Math.max(0, remaining.primary - PRIMARY_RESERVE);
      if (left > 0) steps.push({ account, left });
    }
    return steps;
  }

  /** How many emails broadcasts may still send today: own account, plus what they may borrow. */
  async getBroadcastCapacity(): Promise<{ own: number; borrowable: number }> {
    const chain = await this.getChain('broadcast');
    const own = chain.find((s) => s.account === 'broadcast')?.left ?? 0;
    const borrowable = chain.filter((s) => s.account !== 'broadcast').reduce((n, s) => n + s.left, 0);
    return { own, borrowable };
  }

  /* ---------------- sending ---------------- */

  async sendVia(account: EmailAccount, options: SendOptions): Promise<BrevoSendResult> {
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
   * Sends one email for a purpose, walking its chain until an account takes it. Moves on when an
   * account is full or fails (wrong sender, Brevo down, network error).
   * `account` is the one that sent it, or the last one tried. On failure, `isQuotaError` means
   * every account it could use is out of emails today, so the caller should try again later.
   */
  async sendWithFallback(purpose: EmailPurpose, options: SendOptions): Promise<BrevoSendResult & { account: EmailAccount }> {
    const chain = await this.getChain(purpose);
    // Our count can drift from Brevo's: with nothing left by our count, still ask the own account once.
    if (chain.length === 0 && this.isConfigured(OWN_ACCOUNT[purpose])) chain.push({ account: OWN_ACCOUNT[purpose], left: 0 });
    if (chain.length === 0) {
      return { success: false, isQuotaError: true, errorMessage: 'No emails left today on any account', account: OWN_ACCOUNT[purpose] };
    }
    let last: BrevoSendResult & { account: EmailAccount } = { success: false, errorMessage: 'Not sent', account: chain[0].account };
    let allQuota = true;
    for (const step of chain) {
      const res = await this.sendVia(step.account, options);
      if (res.success) return { ...res, account: step.account };
      if (!res.isQuotaError) allQuota = false;
      this.logger.warn(`[EmailFallback] ${purpose} email not sent via ${step.account} (${res.errorMessage}).`);
      last = { ...res, account: step.account };
    }
    return { ...last, isQuotaError: allQuota };
  }

  /** Sign-in mail (verification, password reset): primary, then broadcast, then welcome. */
  async sendAuthEmail(options: SendOptions): Promise<BrevoSendResult & { account: EmailAccount }> {
    return this.sendWithFallback('auth', options);
  }
}

export interface SendOptions {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  headers?: Record<string, string>;
}

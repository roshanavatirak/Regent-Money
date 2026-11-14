import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import * as nodemailer from 'nodemailer';
import * as crypto from 'crypto';
import { extractQueryRows } from './email-broadcast.service';
import { EmailAccountsService, EmailAccount, DAILY_LIMIT } from './email-accounts.service';
import { renderEmail, paragraph, button, noteBox, fallbackLink, escapeHtml, emailEnv } from './email-layout';

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    private readonly accounts: EmailAccountsService,
  ) {
    this.initializeTransporter();
  }

  async onModuleInit() {
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS core.auth_email_logs (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          email_hmac TEXT NOT NULL,
          type TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'sent',
          message_id TEXT,
          error_message TEXT,
          sent_at BIGINT NOT NULL,
          created_at BIGINT NOT NULL,
          account TEXT DEFAULT 'primary'
        );
        ALTER TABLE core.auth_email_logs ADD COLUMN IF NOT EXISTS account TEXT DEFAULT 'primary';
        CREATE INDEX IF NOT EXISTS idx_auth_email_logs_sent_at 
          ON core.auth_email_logs (sent_at DESC);
      `);
      this.logger.log('Auth email logs table verified in core schema.');
    } catch (err: any) {
      this.logger.warn(`Could not verify auth_email_logs schema: ${err.message}`);
    }
  }

  private initializeTransporter() {
    const user = this.configService.get<string>('SMTP_USER')?.replace(/^["']|["']$/g, '').trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.replace(/^["']|["']$/g, '').trim();

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
      this.logger.log('SMTP Direct Transporter initialized for fallback sending.');
    }
  }

  private emailEnv() {
    return emailEnv((k) => this.configService.get<string>(k));
  }

  private getEffectiveBackendUrl(): string {
    const configuredUrl = (this.configService.get<string>('BACKEND_URL') || process.env.RENDER_EXTERNAL_URL || '')
      ?.replace(/^["']|["']$/g, '')
      .trim();

    if (configuredUrl) {
      return configuredUrl.replace(/\/+$/, '');
    }

    return 'http://localhost:3000';
  }

  async logEmailSent(
    email: string,
    type: 'verification' | 'password_reset' | 'test' | 'welcome',
    status: 'sent' | 'failed',
    messageId?: string,
    errorMessage?: string,
    account: EmailAccount = 'primary',
  ): Promise<void> {
    try {
      const hmacSecret =
        this.configService.get<string>('AUDIT_HMAC_SECRET') ||
        this.configService.get<string>('JWT_SECRET') ||
        'regent_hmac_secret';
      const emailHmac = crypto
        .createHmac('sha256', hmacSecret)
        .update(email.toLowerCase().trim())
        .digest('hex');
      const id = 'aelog_' + crypto.randomBytes(8).toString('hex');
      const now = Date.now();
      await this.dataSource.query(
        `INSERT INTO core.auth_email_logs (id, email, email_hmac, type, status, message_id, error_message, sent_at, created_at, account)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);`,
        [id, email, emailHmac, type, status, messageId || null, errorMessage || null, now, now, account],
      );
    } catch (err: any) {
      this.logger.warn(`Failed to log auth email event: ${err.message}`);
    }
  }

  /**
   * Dispatches email via Brevo HTTPS REST API (Port 443 - 100% cloud firewall proof)
   */
  private async sendViaBrevo(options: {
    toEmail: string;
    toName: string;
    subject: string;
    htmlContent: string;
    textContent?: string;
  }): Promise<{ success: boolean; messageId?: string; errorMessage?: string }> {
    const rawKey = this.configService.get<string>('BREVO_API_KEY');
    const apiKey = rawKey?.replace(/^["']|["']$/g, '').trim();
    if (!apiKey) {
      this.logger.warn('[Brevo API] BREVO_API_KEY is not configured in environment variables.');
      return { success: false, errorMessage: 'BREVO_API_KEY is not configured' };
    }

    const senderEmail = this.configService
      .get<string>('BREVO_SENDER_EMAIL')
      ?.replace(/^["']|["']$/g, '')
      .trim();
    if (!senderEmail) {
      this.logger.warn('[Brevo API] BREVO_SENDER_EMAIL is not configured in environment variables.');
      return { success: false, errorMessage: 'BREVO_SENDER_EMAIL is not configured' };
    }

    const senderName =
      this.configService
        .get<string>('BREVO_SENDER_NAME')
        ?.replace(/^["']|["']$/g, '')
        .trim() || 'Regent Money';

    try {
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: senderName, email: senderEmail },
          to: [{ email: options.toEmail, name: options.toName || options.toEmail }],
          subject: options.subject,
          htmlContent: options.htmlContent,
          textContent: options.textContent,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        this.logger.error(`[Brevo API Error ${response.status}]: ${errorBody}`);
        return { success: false, errorMessage: `Brevo error ${response.status}: ${errorBody}` };
      }

      const result: any = await response.json();
      this.logger.log(`[Brevo API] Email successfully delivered to ${options.toEmail} (MessageId: ${result.messageId || 'ok'})`);
      return { success: true, messageId: result?.messageId || 'ok' };
    } catch (err: any) {
      this.logger.error(`[Brevo API Exception] Failed to send email to ${options.toEmail}: ${err.message}`);
      return { success: false, errorMessage: err.message };
    }
  }

  async sendVerificationEmail(email: string, name: string, token: string): Promise<string> {
    const backendUrl = this.getEffectiveBackendUrl();
    const verificationLink = `${backendUrl}/auth/verify?token=${token}`;

    this.logger.log(`Dispatching verification email to ${email}`);

    const subject = 'Confirm your email for Regent Money';
    const env = this.emailEnv();
    const first = (name || '').trim().split(/\s+/)[0] || 'there';
    const htmlContent = renderEmail({
      logoUrl: env.logoUrl,
      preheader: 'Confirm your email to finish setting up Regent Money.',
      title: 'Confirm your email',
      bodyHtml:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(`Confirm <strong style="font-weight:600;color:#0E1F17;">${escapeHtml(email)}</strong> to finish setting up your Regent Money account.`) +
        button('Confirm email', verificationLink) +
        fallbackLink(verificationLink) +
        paragraph("Didn't create an account? You can ignore this email.", { size: 13, color: '#5B6B63' }),
      footerReason: "You're receiving this because someone signed up for Regent Money with this address.",
      ...(await this.accounts.getLegalLinks()),
    });
    const textContent = `Hi ${first},\n\nConfirm your email to finish setting up Regent Money:\n${verificationLink}\n\nDidn't create an account? You can ignore this email.`;

    // 1. Brevo (primary account, or the broadcast account if primary is out of emails and fallback is on)
    const brevoRes = await this.accounts.sendAuthEmail({
      toEmail: email,
      toName: name,
      subject,
      htmlContent,
      textContent,
    });

    if (brevoRes.success) {
      await this.logEmailSent(email, 'verification', 'sent', brevoRes.messageId, undefined, brevoRes.account);
      return verificationLink;
    }

    // 2. Fallback to direct SMTP (for local dev)
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: `"Regent Money" <${this.configService.get<string>('SMTP_USER')}>`,
          to: email,
          subject,
          html: htmlContent,
          text: textContent,
        });
        this.logger.log(`Verification email sent via SMTP fallback to ${email}.`);
        await this.logEmailSent(email, 'verification', 'sent', info?.messageId);
        return verificationLink;
      } catch (err: any) {
        this.logger.error(`SMTP fallback failed for ${email}: ${err.message}`);
        await this.logEmailSent(email, 'verification', 'failed', undefined, err.message);
      }
    } else {
      await this.logEmailSent(email, 'verification', 'failed', undefined, brevoRes.errorMessage);
    }

    // 3. Fallback warning if no mail service succeeds (never log the secret link)
    this.logger.warn(`No email transport succeeded for verification email to: ${email}`);
    return verificationLink;
  }

  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<string> {
    const backendUrl = this.getEffectiveBackendUrl();
    const resetLink = `${backendUrl}/auth/reset-password-page?token=${token}`;

    this.logger.log(`Dispatching password reset email to ${email}`);

    const subject = 'Reset your Regent Money password';
    const env = this.emailEnv();
    const first = (name || '').trim().split(/\s+/)[0] || 'there';
    const htmlContent = renderEmail({
      logoUrl: env.logoUrl,
      preheader: 'Use this link within 15 minutes to reset your password.',
      title: 'Reset your password',
      bodyHtml:
        paragraph(`Hi ${escapeHtml(first)},`) +
        paragraph(`We got a request to reset the password for <strong style="font-weight:600;color:#0E1F17;">${escapeHtml(email)}</strong>. Resetting it also unlocks your account if it was locked after too many sign-in attempts.`) +
        button('Reset password', resetLink) +
        paragraph('This link expires in 15 minutes.', { size: 13, color: '#5B6B63' }) +
        noteBox(`<strong style="font-weight:600;color:#0E1F17;">Didn't ask for this?</strong> Your password hasn't changed. You can ignore this email, and no one can reset it without this link.`) +
        fallbackLink(resetLink),
      footerReason: "You're receiving this because a password reset was requested for your Regent Money account.",
      ...(await this.accounts.getLegalLinks()),
    });
    const textContent = `Hi ${first},\n\nWe got a request to reset your Regent Money password. Open this link within 15 minutes to reset it (this also unlocks your account):\n${resetLink}\n\nDidn't ask for this? Your password hasn't changed. You can ignore this email.`;

    // 1. Brevo (primary account, or the broadcast account if primary is out of emails and fallback is on)
    const brevoRes = await this.accounts.sendAuthEmail({
      toEmail: email,
      toName: name,
      subject,
      htmlContent,
      textContent,
    });

    if (brevoRes.success) {
      await this.logEmailSent(email, 'password_reset', 'sent', brevoRes.messageId, undefined, brevoRes.account);
      return resetLink;
    }

    // 2. Fallback to direct SMTP
    if (this.transporter) {
      try {
        const info = await this.transporter.sendMail({
          from: `"Regent Money Security" <${this.configService.get<string>('SMTP_USER')}>`,
          to: email,
          subject,
          html: htmlContent,
          text: textContent,
        });
        this.logger.log(`Password reset email sent via SMTP fallback to ${email}.`);
        await this.logEmailSent(email, 'password_reset', 'sent', info?.messageId);
        return resetLink;
      } catch (err: any) {
        this.logger.error(`SMTP fallback failed for ${email}: ${err.message}`);
        await this.logEmailSent(email, 'password_reset', 'failed', undefined, err.message);
      }
    } else {
      await this.logEmailSent(email, 'password_reset', 'failed', undefined, brevoRes.errorMessage);
    }

    // 3. Fallback warning if no mail service succeeds (never log the secret link)
    this.logger.warn(`No email transport succeeded for password reset email to: ${email}`);
    return resetLink;
  }

  async getPrimaryEmailStats(): Promise<{
    sentToday: number;
    remainingToday: number;
    dailyLimit: number;
    verificationsToday: number;
    passwordResetsToday: number;
    /** Sign-in emails sent today through the broadcast account because this one was full. */
    sentViaFallbackToday: number;
    /** Broadcast emails this account sent today on behalf of broadcasts. */
    lentToBroadcastsToday: number;
    senderEmail: string;
    senderName: string;
    isConfigured: boolean;
  }> {
    const startOfTodayUtc = new Date();
    startOfTodayUtc.setUTCHours(0, 0, 0, 0);
    const startMs = startOfTodayUtc.getTime();

    let verificationsToday = 0;
    let passwordResetsToday = 0;

    try {
      const rawRows = await this.dataSource.query(
        `SELECT 
           COUNT(CASE WHEN type = 'verification' THEN 1 END)::int as verif_cnt,
           COUNT(CASE WHEN type = 'password_reset' THEN 1 END)::int as reset_cnt
         FROM core.auth_email_logs
         WHERE status = 'sent' AND sent_at >= $1;`,
        [startMs],
      );

      const rows = extractQueryRows<{ verif_cnt: number; reset_cnt: number }>(rawRows);
      const row = rows[0] || ({} as any);
      verificationsToday = Number(row.verif_cnt || 0);
      passwordResetsToday = Number(row.reset_cnt || 0);
    } catch {
      // fresh boot
    }

    const usage = await this.accounts.getUsageToday();
    const cfg = this.accounts.getAccountConfig('primary');

    return {
      sentToday: usage.primary.sent,
      remainingToday: Math.max(0, DAILY_LIMIT - usage.primary.sent),
      dailyLimit: DAILY_LIMIT,
      verificationsToday,
      passwordResetsToday,
      sentViaFallbackToday: usage.broadcast.borrowed,
      lentToBroadcastsToday: usage.primary.borrowed,
      senderEmail: cfg.senderEmail,
      senderName: cfg.senderName,
      isConfigured: this.accounts.isConfigured('primary'),
    };
  }

  async sendTestPrimaryEmail(toEmail: string): Promise<{ success: boolean; message: string }> {
    const now = new Date().toLocaleTimeString('en-IN');
    const subject = 'Test email: sign-in sender';
    const env = this.emailEnv();
    const htmlContent = renderEmail({
      logoUrl: env.logoUrl,
      title: 'Sign-in sender works',
      bodyHtml:
        paragraph('This test came from the sender Regent Money uses for verification and password reset emails.') +
        noteBox(`From: ${escapeHtml(this.accounts.getAccountConfig('primary').senderEmail)}<br>Sent: ${escapeHtml(now)}<br>To: ${escapeHtml(toEmail)}`),
      footerReason: 'Sent from the Regent Money admin console.',
    });

    const res = await this.sendViaBrevo({
      toEmail,
      toName: 'Admin',
      subject,
      htmlContent,
      textContent: `Regent Money sign-in sender test, sent at ${now}`,
    });

    if (res.success) {
      await this.logEmailSent(toEmail, 'test', 'sent', res.messageId);
      return { success: true, message: `Primary test email delivered to ${toEmail}` };
    } else {
      await this.logEmailSent(toEmail, 'test', 'failed', undefined, res.errorMessage);
      return { success: false, message: res.errorMessage || 'Primary dispatch failed' };
    }
  }
}

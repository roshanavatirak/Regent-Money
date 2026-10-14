import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    private readonly configService: ConfigService,
  ) {
    this.initializeTransporter();
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

  private getEffectiveBackendUrl(): string {
    const configuredUrl = (this.configService.get<string>('BACKEND_URL') || process.env.RENDER_EXTERNAL_URL || '')
      ?.replace(/^["']|["']$/g, '')
      .trim();

    if (configuredUrl) {
      return configuredUrl.replace(/\/+$/, '');
    }

    return 'http://localhost:3000';
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
  }): Promise<boolean> {
    const rawKey = this.configService.get<string>('BREVO_API_KEY');
    const apiKey = rawKey?.replace(/^["']|["']$/g, '').trim();
    if (!apiKey) {
      this.logger.warn('[Brevo API] BREVO_API_KEY is not configured in environment variables.');
      return false;
    }

    const senderEmail = this.configService
      .get<string>('BREVO_SENDER_EMAIL')
      ?.replace(/^["']|["']$/g, '')
      .trim();
    if (!senderEmail) {
      this.logger.warn('[Brevo API] BREVO_SENDER_EMAIL is not configured in environment variables.');
      return false;
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
        return false;
      }

      const result = await response.json();
      this.logger.log(`[Brevo API] Email successfully delivered to ${options.toEmail} (MessageId: ${result.messageId || 'ok'})`);
      return true;
    } catch (err: any) {
      this.logger.error(`[Brevo API Exception] Failed to send email to ${options.toEmail}: ${err.message}`);
      return false;
    }
  }

  async sendVerificationEmail(email: string, name: string, token: string): Promise<string> {
    const backendUrl = this.getEffectiveBackendUrl();
    const verificationLink = `${backendUrl}/auth/verify?token=${token}`;

    this.logger.log(`Generated verification link for ${email}: ${verificationLink}`);

    const subject = 'Verify your Regent Money Account';
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 540px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0; font-size: 22px;">Welcome to Regent Money!</h2>
        <p style="font-size: 15px; line-height: 24px;">Hello ${name || 'there'},</p>
        <p style="font-size: 15px; line-height: 24px;">Thank you for signing up. Please confirm your email address by tapping the button below:</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${verificationLink}" style="background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Verify My Account
          </a>
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 20px;">Or copy and paste this verification URL into your browser:</p>
        <p style="font-size: 13px; word-break: break-all;"><a href="${verificationLink}" style="color: #0284c7;">${verificationLink}</a></p>
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">If you did not create a Regent Money account, you can safely ignore this message.</p>
      </div>
    `;
    const textContent = `Hello ${name || 'there'},\n\nWelcome to Regent Money! Please verify your account using this link:\n${verificationLink}\n\nIf you did not sign up, please ignore this email.`;

    // 1. Try Brevo HTTPS API (recommended for cloud & production)
    const sentViaBrevo = await this.sendViaBrevo({
      toEmail: email,
      toName: name,
      subject,
      htmlContent,
      textContent,
    });

    if (sentViaBrevo) return verificationLink;

    // 2. Fallback to direct SMTP (for local dev)
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"Regent Money" <${this.configService.get<string>('SMTP_USER')}>`,
          to: email,
          subject,
          html: htmlContent,
          text: textContent,
        });
        this.logger.log(`Verification email sent via SMTP fallback to ${email}.`);
        return verificationLink;
      } catch (err: any) {
        this.logger.error(`SMTP fallback failed for ${email}: ${err.message}`);
      }
    }

    // 3. Simulated console output if no mail service succeeds
    this.logger.warn(`[SIMULATED EMAIL - VERIFICATION] To: ${email}, Link: ${verificationLink}`);
    return verificationLink;
  }

  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<string> {
    const backendUrl = this.getEffectiveBackendUrl();
    const resetLink = `${backendUrl}/auth/reset-password-page?token=${token}`;

    this.logger.log(`Generated password reset link for ${email}: ${resetLink}`);

    const subject = 'Reset Password & Unlock Regent Money Account';
    const htmlContent = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #1e293b; max-width: 540px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #0f172a; margin-top: 0; font-size: 22px;">Password Reset Request</h2>
        <p style="font-size: 15px; line-height: 24px;">Hello ${name || 'Customer'},</p>
        <p style="font-size: 15px; line-height: 24px;">We received a request to reset your Regent Money password. Completing this reset will also <strong>instantly remove any active security lockout</strong> and restore full access.</p>
        <div style="margin: 28px 0; text-align: center;">
          <a href="${resetLink}" style="background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; display: inline-block;">
            Reset Password & Unlock
          </a>
        </div>
        <p style="font-size: 13px; color: #64748b; line-height: 20px;">Or copy and paste this link into your browser:</p>
        <p style="font-size: 13px; word-break: break-all;"><a href="${resetLink}" style="color: #0284c7;">${resetLink}</a></p>
        <hr style="border: 0; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
        <p style="font-size: 12px; color: #94a3b8; margin: 0;">This reset link expires in 15 minutes. If you did not request this, please secure your account.</p>
      </div>
    `;
    const textContent = `Hello ${name || 'Customer'},\n\nWe received a request to reset your Regent Money password.\nOpen this link to reset and unlock your account (expires in 15 minutes):\n${resetLink}\n\nIf you did not request this, please secure your account.`;

    // 1. Try Brevo HTTPS API
    const sentViaBrevo = await this.sendViaBrevo({
      toEmail: email,
      toName: name,
      subject,
      htmlContent,
      textContent,
    });

    if (sentViaBrevo) return resetLink;

    // 2. Fallback to direct SMTP
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"Regent Money Security" <${this.configService.get<string>('SMTP_USER')}>`,
          to: email,
          subject,
          html: htmlContent,
          text: textContent,
        });
        this.logger.log(`Password reset email sent via SMTP fallback to ${email}.`);
        return resetLink;
      } catch (err: any) {
        this.logger.error(`SMTP fallback failed for ${email}: ${err.message}`);
      }
    }

    // 3. Simulated console output if no mail service succeeds
    this.logger.warn(`[SIMULATED EMAIL - PASSWORD RESET] To: ${email}, Link: ${resetLink}`);
    return resetLink;
  }
}


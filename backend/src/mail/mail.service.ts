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
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (user && pass && user !== 'your_gmail_address@gmail.com') {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
      });
      this.logger.log('SMTP Direct Transporter initialized for fallback sending.');
    } else {
      this.logger.warn('SMTP credentials not configured. Emails will be logged to console only.');
    }
  }

  async sendVerificationEmail(email: string, name: string, token: string): Promise<string> {
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000';
    const verificationLink = `${backendUrl}/auth/verify?token=${token}`;

    this.logger.log(`Generated verification link for ${email}: ${verificationLink}`);

    // Send email directly via Gmail SMTP
    this.sendDirectEmail(email, name, verificationLink)
      .then(() => {
        this.logger.log(`Verification email dispatched successfully to ${email}.`);
      })
      .catch((err) => {
        this.logger.error(`Failed to send direct email to ${email}: ${err.message}`);
      });

    return verificationLink;
  }

  async sendPasswordResetEmail(email: string, name: string, token: string): Promise<string> {
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000';
    const resetLink = `${backendUrl}/auth/reset-password-page?token=${token}`;

    this.logger.log(`Generated password reset link for ${email}: ${resetLink}`);

    this.sendPasswordResetEmailDirect(email, name, resetLink)
      .then(() => {
        this.logger.log(`Password reset email dispatched successfully to ${email}.`);
      })
      .catch((err) => {
        this.logger.error(`Failed to send password reset email to ${email}: ${err.message}`);
      });

    return resetLink;
  }

  private async sendPasswordResetEmailDirect(email: string, name: string, link: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`No SMTP transporter configured. [SIMULATED EMAIL] To: ${email}, Reset Link: ${link}`);
      return;
    }

    const mailOptions = {
      from: `"Regent Money Security" <${this.configService.get<string>('SMTP_USER')}>`,
      to: email,
      subject: 'Reset Password & Unlock Regent Money Account',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 24px; color: #222; max-width: 540px; margin: 0 auto; border: 1px solid #e1e4e8; border-radius: 12px;">
          <h2 style="color: #0d1117; margin-top: 0;">Password Reset Request</h2>
          <p>Hello ${name || 'Customer'},</p>
          <p>We received a request to reset your Regent Money password. Completing this reset will also <strong>instantly remove any active account lockout</strong> and reactivate full access.</p>
          <p style="margin: 24px 0;">
            <a href="${link}" style="background-color: #2da44e; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Reset Password & Unlock
            </a>
          </p>
          <p style="font-size: 13px; color: #57606a;">Or copy and paste this link into your browser:</p>
          <p style="font-size: 13px; word-break: break-all;"><a href="${link}" style="color: #0969da;">${link}</a></p>
          <p style="font-size: 12px; color: #6e7781; margin-top: 24px; border-top: 1px solid #eee; padding-top: 12px;">This link will expire in 15 minutes. If you did not request this, please secure your account.</p>
        </div>
      `,
    };

    await this.transporter.sendMail(mailOptions);
    this.logger.log(`Password reset email sent to ${email}.`);
  }

  private async sendDirectEmail(email: string, name: string, link: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn(`No SMTP transporter configured. [SIMULATED EMAIL] To: ${email}, Link: ${link}`);
      return;
    }

    const mailOptions = {
      from: `"Regent Money" <${this.configService.get<string>('SMTP_USER')}>`,
      to: email,
      subject: 'Verify your Regent Money Account',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2>Hello, ${name}!</h2>
          <p>Thank you for signing up with Regent Money. Please verify your account by clicking the link below:</p>
          <p style="margin: 20px 0;">
            <a href="${link}" style="background-color: #2da44e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Verify Account
            </a>
          </p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${link}">${link}</a></p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #888;">If you did not sign up for this account, please ignore this email.</p>
        </div>
      `,
    };

    await this.transporter.sendMail(mailOptions);
    this.logger.log(`Direct fallback email sent successfully to ${email}.`);
  }
}

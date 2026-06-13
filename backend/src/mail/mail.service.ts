import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(
    @InjectQueue('mail') private readonly mailQueue: Queue,
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

    try {
      // Attempt to queue the email job asynchronously
      const job = await this.mailQueue.add(
        'sendVerification',
        { email, name, token, verificationLink },
        { removeOnComplete: true, removeOnFail: 100 },
      );
      this.logger.log(`Successfully queued verification email job (ID: ${job.id}) in Redis.`);
      return verificationLink;
    } catch (error: any) {
      this.logger.warn(
        `Failed to queue email job in Redis: ${error.message}. Falling back to synchronous direct sending...`,
      );

      // FALLBACK: Send email synchronously in the background thread
      this.sendDirectEmail(email, name, verificationLink).catch((err) => {
        this.logger.error(`Failed to send direct email fallback: ${err.message}`);
      });

      return verificationLink;
    }
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

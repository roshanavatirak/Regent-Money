import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Processor('mail')
export class MailProcessor {
  private readonly logger = new Logger(MailProcessor.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
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
      this.logger.log('SMTP Transporter initialized successfully inside Bull Queue Processor.');
    } else {
      this.logger.warn('SMTP credentials not configured. Queued emails will be logged to console only.');
    }
  }

  @Process('sendVerification')
  async handleSendVerification(job: Job<{ email: string; name: string; token: string; verificationLink: string }>) {
    const { email, name, verificationLink } = job.data;
    this.logger.log(`Queue Processor: Processing email job ${job.id} for recipient: ${email}`);

    if (!this.transporter) {
      this.logger.warn(`Queue Processor: No SMTP transporter configured. [SIMULATED EMAIL] To: ${email}, Link: ${verificationLink}`);
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
            <a href="${verificationLink}" style="background-color: #2da44e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Verify Account
            </a>
          </p>
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p><a href="${verificationLink}">${verificationLink}</a></p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #888;">If you did not sign up for this account, please ignore this email.</p>
        </div>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Queue Processor: Email sent successfully to ${email}.`);
    } catch (err: any) {
      this.logger.error(`Queue Processor: Failed to send email to ${email}: ${err.message}`);
      throw err; // Throwing error will cause Bull to mark the job as failed and retry if configured
    }
  }
}

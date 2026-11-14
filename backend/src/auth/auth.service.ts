import { Injectable, UnauthorizedException, BadRequestException, ConflictException, ForbiddenException, NotFoundException, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
import { CLAIM_SEND_SQL, refusal, utcDay, RESEND_GAP_MS } from './verification-limit';
import { TokenService } from './token.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { WelcomeEmailService } from '../mail/welcome-email.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
    private readonly tokenService: TokenService,
    private readonly welcomeEmails: WelcomeEmailService,
  ) { }

  async onModuleInit() {
    try {
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS biometrics_enabled BOOLEAN DEFAULT FALSE;
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS auto_lock_timeout INTEGER DEFAULT 1;
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS dob TEXT;
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS gender TEXT;
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS occupation TEXT;
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS current_income NUMERIC;
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS income_sources_count INTEGER DEFAULT 1;
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE;
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS banned_at BIGINT;
      `);
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS ban_reason TEXT;
      `);
      await this.userRepository.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_role') THEN
            ALTER TABLE core.users ADD CONSTRAINT chk_user_role CHECK (role IN ('user', 'admin', 'superadmin'));
          END IF;
        END $$;
      `);
      await this.userRepository.query(`
        CREATE INDEX IF NOT EXISTS idx_users_banned ON core.users(is_banned) WHERE is_banned = TRUE;
      `);
      await this.userRepository.query(`
        CREATE INDEX IF NOT EXISTS idx_users_role ON core.users(role) WHERE role != 'user';
      `);
      await this.userRepository.query(`
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
      `);
      await this.userRepository.query(`
        CREATE INDEX IF NOT EXISTS idx_users_search_trgm ON core.users USING gin (
          (COALESCE(name, '') || ' ' || COALESCE(email, '') || ' ' || COALESCE(phone, '')) gin_trgm_ops
        );
      `);

      // Account Deletion & 7-Day Recovery Migration
      await this.userRepository.query(`
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS is_scheduled_for_deletion BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS deletion_requested_at BIGINT;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS deletion_deadline BIGINT;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS deletion_feedback TEXT;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS restored_at BIGINT;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS deletion_cooldown_until BIGINT;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS tokens_valid_after BIGINT;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS verification_last_sent_at BIGINT;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS verification_send_day TEXT;
        ALTER TABLE core.users ADD COLUMN IF NOT EXISTS verification_send_count INT;
        CREATE INDEX IF NOT EXISTS idx_users_deletion_deadline ON core.users(deletion_deadline) WHERE is_scheduled_for_deletion = TRUE;
      `);

      await this.userRepository.query(`
        CREATE TABLE IF NOT EXISTS core.account_deletion_reasons (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id_hmac TEXT NOT NULL,
          reason_code TEXT NOT NULL,
          reason_label TEXT NOT NULL,
          custom_feedback TEXT,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_del_reasons_created ON core.account_deletion_reasons(created_at);
      `);

      // Create immutable audit log table
      await this.userRepository.query(`
        CREATE TABLE IF NOT EXISTS core.admin_audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          admin_id TEXT NOT NULL,
          target_user_id TEXT NOT NULL,
          target_email_hmac TEXT,
          action TEXT NOT NULL,
          reason TEXT NOT NULL,
          metadata JSONB DEFAULT '{}'::jsonb,
          created_at BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_target ON core.admin_audit_logs(target_user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_admin ON core.admin_audit_logs(admin_id);
      `);

      // Audit log mutation prevention triggers (UPDATE, DELETE, TRUNCATE)
      await this.userRepository.query(`
        CREATE OR REPLACE FUNCTION core.prevent_audit_log_mutation()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'Security Violation: Records in core.admin_audit_logs are immutable and cannot be updated, deleted, or truncated.';
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_prevent_audit_log_mutation ON core.admin_audit_logs;
        CREATE TRIGGER trg_prevent_audit_log_mutation
        BEFORE UPDATE OR DELETE ON core.admin_audit_logs
        FOR EACH ROW EXECUTE FUNCTION core.prevent_audit_log_mutation();

        DROP TRIGGER IF EXISTS trg_prevent_audit_log_truncate ON core.admin_audit_logs;
        CREATE TRIGGER trg_prevent_audit_log_truncate
        BEFORE TRUNCATE ON core.admin_audit_logs
        EXECUTE FUNCTION core.prevent_audit_log_mutation();
      `);

      console.log('[AuthService] Profile, security & admin moderation columns/tables verified.');
    } catch (err: any) {
      console.warn('[AuthService] Could not auto-migrate core.users columns/audit tables:', err?.message || err);
    }

    // One active account per email, enforced by the database (two signups at the same moment
    // can no longer both succeed). If old duplicates exist the index is not created: fix them,
    // then restart.
    try {
      await this.userRepository.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_active ON core.users (lower(email))
        WHERE is_deleted = false AND email IS NOT NULL AND email <> '';
      `);
    } catch (err: any) {
      console.warn('[AuthService] Could not create the unique email rule (duplicate emails exist?):', err?.message || err);
    }

    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET')?.trim();
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      console.log(`[AuthService] Cloudinary configured for cloud: ${cloudName}`);
    }
  }

  /** A short, single-line text field, or throws a 400. */
  private requireText(value: unknown, label: string, max: number): string {
    if (typeof value !== 'string' || !value.trim()) throw new BadRequestException(`${label} is required.`);
    const text = value.trim();
    if (text.length > max) throw new BadRequestException(`${label} is too long.`);
    return text;
  }

  /** Passwords: 6 to 128 characters (very long ones only slow the server down). */
  private checkPassword(value: unknown, required: boolean): string | undefined {
    if (value == null || value === '') {
      if (required) throw new BadRequestException('Password is required.');
      return undefined;
    }
    if (typeof value !== 'string' || value.length < 6 || value.length > 128) {
      throw new BadRequestException('Password must be 6 to 128 characters.');
    }
    return value;
  }

  async signUp(dto: { name: string; email: string; phone: string; password?: string }) {
    const name = this.requireText(dto?.name, 'Name', 80);
    const email = this.requireText(dto?.email, 'Email', 254).toLowerCase();
    const phone = this.requireText(dto?.phone, 'Phone number', 20);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email address.');
    const password = this.checkPassword(dto?.password, false);

    // 1. Check if user already exists (by email or phone)
    const existingUser = await this.userRepository.findOne({
      where: [
        { email, isDeleted: false },
        { phone, isDeleted: false },
      ],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException('This email is already registered. Please log in.');
      }
      throw new ConflictException('This phone number is already registered.');
    }

    // 2. Hash password
    let passwordHash: string | null = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }

    // 3. Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // 4. Create user record with explicit terms acceptance from signup checkbox
    const userId = crypto.randomUUID();
    const now = Date.now();
    const user = this.userRepository.create({
      id: userId,
      userId: userId,
      email,
      phone,
      passwordHash,
      name,
      authProvider: 'email',
      avatarUrl: '',
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      isVerified: false,
      verificationToken,
      termsAccepted: true,
      termsAcceptedAt: now,
    });

    let savedUser: User;
    try {
      savedUser = (await this.userRepository.save(user)) as User;
    } catch (err: any) {
      // Another signup with this email finished a moment earlier (unique email rule)
      if (err?.code === '23505' || err?.driverError?.code === '23505') {
        throw new ConflictException('This email is already registered. Please log in.');
      }
      throw err;
    }

    // The signup email counts toward the resend limits (60 s gap, 5 a day).
    await this.userRepository
      .query(
        `UPDATE core.users SET verification_last_sent_at = $2, verification_send_day = $3, verification_send_count = 1 WHERE id = $1;`,
        [savedUser.id, now, utcDay(now)],
      )
      .catch(() => {});

    // 5. Send verification email asynchronously in the background (DO NOT await it!)
    this.mailService.sendVerificationEmail(email, name, verificationToken).catch((err) => {
      console.error(`[AuthService] Background verification email dispatch failed: ${err.message}`);
    });

    // Prepare profile to return to client
    const profile = {
      id: savedUser.id,
      email: savedUser.email,
      phone: savedUser.phone,
      name: savedUser.name,
      authProvider: 'email',
      avatarUrl: savedUser.avatarUrl,
      createdAt: savedUser.createdAt,
      isVerified: savedUser.isVerified,
      role: savedUser.role || 'user',
      isBanned: savedUser.isBanned ?? false,
      termsAccepted: savedUser.termsAccepted ?? true,
      termsAcceptedAt: savedUser.termsAcceptedAt ?? now,
    };

    return {
      profile,
      sessionConfirmed: false, // Must verify email first
    };
  }

  async verifyEmail(token: string) {
    const user = await this.userRepository.findOne({
      where: { verificationToken: token, isDeleted: false },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token.');
    }

    const wasVerified = user.isVerified;
    user.isVerified = true;
    user.verificationToken = null;
    user.updatedAt = Date.now();
    await this.userRepository.save(user);

    // New email signup just confirmed: send the thank-you email right away (Redis queue worker).
    if (!wasVerified) await this.welcomeEmails.schedule(user, 'email_verified');

    return { message: 'Your email has been successfully verified! You can now log in.' };
  }

  /**
   * Sends a fresh verification link. Per account: at least 60 seconds between emails and at most
   * 5 a day (signup included), so the button can't flood an inbox or use up the daily email limit.
   * `retryAfterSeconds` tells the app how long to keep the button disabled.
   */
  async resendVerificationEmail(email: string): Promise<{ message: string; retryAfterSeconds: number }> {
    const sanitizedEmail = email.trim().toLowerCase();
    const gap = Math.round(RESEND_GAP_MS / 1000);
    const user = await this.userRepository.findOne({
      where: { email: sanitizedEmail, isDeleted: false },
    });

    if (!user) {
      return { message: 'If this email is registered, a new verification link has been sent.', retryAfterSeconds: gap };
    }

    if (user.isVerified) {
      return { message: 'Your account is already verified. You can log in directly.', retryAfterSeconds: 0 };
    }

    const now = Date.now();
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const claimed = await this.userRepository.query(CLAIM_SEND_SQL, [user.id, now, utcDay(now), verificationToken]);
    const rows = Array.isArray(claimed) ? (Array.isArray(claimed[0]) ? claimed[0] : claimed) : [];

    if (!rows.length) {
      const [state] = await this.userRepository.query(
        `SELECT verification_last_sent_at AS last, verification_send_day AS day, verification_send_count AS count FROM core.users WHERE id = $1;`,
        [user.id],
      );
      const why = refusal(
        { lastSentAt: state?.last ? Number(state.last) : null, day: state?.day ?? null, count: state?.count ?? null },
        now,
      ) || { reason: 'too_soon' as const, retryAfterSeconds: gap };
      return why.reason === 'daily_cap'
        ? {
            message: "You've asked for 5 links today. Use the newest email we sent, or try again tomorrow.",
            retryAfterSeconds: why.retryAfterSeconds,
          }
        : {
            message: `Please wait ${why.retryAfterSeconds} seconds before asking for another link.`,
            retryAfterSeconds: why.retryAfterSeconds,
          };
    }

    await this.mailService.sendVerificationEmail(user.email || sanitizedEmail, user.name || '', verificationToken);
    return { message: 'A new verification link has been sent to your email.', retryAfterSeconds: gap };
  }

  /**
   * Wrong-password lock. It is counted per account AND per network address, so a stranger who
   * types wrong passwords for someone's email locks only their own connection out, not the
   * real owner. A separate account-wide counter still stops guessing from many addresses.
   */
  private getLockKeyForUser(userId: string, ip = ''): string {
    return ip ? `auth:lock:u:${userId}:ip:${ip}` : `auth:lock:u:${userId}`;
  }

  /** Failed logins for an account from every address in the last hour. */
  private getFailCountKey(userId: string): string {
    return `auth:fail:u:${userId}`;
  }

  /** Set by a password reset: locks created before this moment no longer apply. */
  private getUnlockKey(userId: string): string {
    return `auth:unlock:u:${userId}`;
  }

  /** Above this many failed logins in an hour (from all addresses), the account pauses. */
  private static readonly ACCOUNT_FAIL_CAP = 30;

  private async accountFailCount(userId: string): Promise<number> {
    const n = Number(await this.redisService.executeCommand(['GET', this.getFailCountKey(userId)]).catch(() => 0));
    return Number.isFinite(n) ? n : 0;
  }

  private async recordAccountFail(userId: string): Promise<void> {
    const key = this.getFailCountKey(userId);
    const n = await this.redisService.executeCommand(['INCR', key]).catch(() => null);
    if (n === 1) await this.redisService.executeCommand(['EXPIRE', key, 3600]).catch(() => null);
  }

  private getLockKeyForAnon(identifier: string): string {
    return `auth:lock:anon:${identifier.trim().toLowerCase()}`;
  }

  private async getLockoutStateFromRedis(lockKey: string, unlockKey?: string): Promise<{ attempts: number; violations: number; lockedUntil: number; tier: number } | null> {
    const raw = await this.redisService.get(lockKey);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      // A password reset after this lock was written cancels it
      if (unlockKey) {
        const unlockedAt = Number(await this.redisService.get(unlockKey)) || 0;
        if (unlockedAt && (!parsed.t || parsed.t <= unlockedAt)) return null;
      }
      if (parsed.l && now < parsed.l) {
        return { attempts: parsed.a || 0, violations: parsed.v || 1, lockedUntil: parsed.l, tier: parsed.v || 1 };
      }
      return { attempts: parsed.a || 0, violations: parsed.v || 0, lockedUntil: 0, tier: 0 };
    } catch {
      return null;
    }
  }

  async login(dto: { emailOrMobile: string; password?: string }, clientIp = '') {
    const input = this.requireText(dto?.emailOrMobile, 'Email or mobile number', 254);
    if (dto?.password != null && (typeof dto.password !== 'string' || dto.password.length > 128)) {
      throw new UnauthorizedException('Invalid email/mobile number or password.');
    }
    const ip = String(clientIp || '').slice(0, 64);
    const isEmail = input.includes('@');
    const normalizedIdentifier = isEmail ? input.toLowerCase() : input;

    // 1. Look up user by email or phone so lockout is universally bound to the exact account
    let user = await this.userRepository.findOne({
      where: isEmail
        ? { email: normalizedIdentifier, isDeleted: false }
        : { phone: normalizedIdentifier, isDeleted: false },
    });

    if (!user) {
      // Check if user is in 7-day scheduled deletion grace period
      user = await this.userRepository.findOne({
        where: isEmail
          ? { email: normalizedIdentifier, isScheduledForDeletion: true }
          : { phone: normalizedIdentifier, isScheduledForDeletion: true },
      });
    }

    // Determine the universal Redis lock key (keyed by user.id if user exists, else anonymous identifier)
    const lockKey = user ? this.getLockKeyForUser(user.id, ip) : this.getLockKeyForAnon(normalizedIdentifier);

    // Too many wrong passwords for this account from many addresses: pause for everyone briefly
    if (user && (await this.accountFailCount(user.id)) >= AuthService.ACCOUNT_FAIL_CAP) {
      throw new HttpException(
        {
          statusCode: HttpStatus.LOCKED || 423,
          error: 'AccountLocked',
          message: 'Too many failed attempts on this account. Try again in up to 60 minutes, or reset your password to unlock immediately.',
          lockedUntil: Date.now() + 3600 * 1000,
          remainingSeconds: 3600,
          remainingMinutes: 60,
          tier: 1,
          locked: true,
        },
        HttpStatus.LOCKED || 423,
      );
    }

    // 2. Check if this connection is currently locked out for this account
    const lockState = await this.getLockoutStateFromRedis(lockKey, user ? this.getUnlockKey(user.id) : undefined);
    if (lockState && lockState.lockedUntil > Date.now()) {
      const remainingSec = Math.max(1, Math.ceil((lockState.lockedUntil - Date.now()) / 1000));
      const remainingMin = Math.ceil(remainingSec / 60);
      const tierLabel = lockState.tier === 2 ? '24 hours' : '30 minutes';
      throw new HttpException(
        {
          statusCode: HttpStatus.LOCKED || 423,
          error: 'AccountLocked',
          message: `Account is temporarily locked for ${tierLabel}. Try again in ${remainingMin} min left (${remainingSec}s). Reset your password to unlock immediately.`,
          lockedUntil: lockState.lockedUntil,
          remainingSeconds: remainingSec,
          remainingMinutes: remainingMin,
          tier: lockState.tier,
          locked: true,
        },
        HttpStatus.LOCKED || 423,
      );
    }

    if (!user) {
      throw new UnauthorizedException('Invalid email/mobile number or password.');
    }

    // 3. Validate password
    let passwordValid = false;
    if (user.passwordHash && dto.password) {
      passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    }

    if (!passwordValid) {
      await this.recordAccountFail(user.id);
      // Handle failed password attempt (3 attempt rule, tracked in Redis)
      const currentAttempts = (lockState?.attempts || 0) + 1;
      const currentViolations = lockState?.violations || 0;

      if (currentAttempts < 3) {
        // Attempt 1 or 2: record attempt universally in Redis with 2-hour sliding window
        const attemptsLeft = 3 - currentAttempts;
        await this.redisService.set(
          lockKey,
          JSON.stringify({ a: currentAttempts, v: currentViolations, l: 0, t: Date.now() }),
          7200,
        );
        throw new UnauthorizedException({
          statusCode: 401,
          message: `Invalid password. ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining before account lockout.`,
          attemptsLeft,
          attemptsCount: currentAttempts,
        });
      } else {
        // Attempt 3: Trigger universal account lockout in Redis
        const nextViolation = currentViolations + 1;
        if (nextViolation === 1) {
          // Tier 1: 30 minutes lockout
          const lockDurationSec = 30 * 60; // 1,800 seconds
          const lockedUntil = Date.now() + lockDurationSec * 1000;
          await this.redisService.set(
            lockKey,
            JSON.stringify({ a: 0, v: 1, l: lockedUntil, t: Date.now() }),
            lockDurationSec + 3600,
          );
          throw new HttpException(
            {
              statusCode: HttpStatus.LOCKED || 423,
              error: 'AccountLocked',
              message: 'Account locked for 30 minutes due to 3 failed attempts. Reset your password to unlock immediately.',
              lockedUntil,
              remainingSeconds: lockDurationSec,
              remainingMinutes: 30,
              tier: 1,
              locked: true,
            },
            HttpStatus.LOCKED || 423,
          );
        } else {
          // Tier 2: 24 hours lockout (if user fails 3 more times after 30 min lock expires)
          const lockDurationSec = 24 * 60 * 60; // 86,400 seconds
          const lockedUntil = Date.now() + lockDurationSec * 1000;
          await this.redisService.set(
            lockKey,
            JSON.stringify({ a: 0, v: 2, l: lockedUntil, t: Date.now() }),
            lockDurationSec + 7200,
          );
          throw new HttpException(
            {
              statusCode: HttpStatus.LOCKED || 423,
              error: 'AccountLocked',
              message: 'Account locked for 24 hours due to repeated failed attempts. Reset your password to unlock immediately.',
              lockedUntil,
              remainingSeconds: lockDurationSec,
              remainingMinutes: 24 * 60,
              tier: 2,
              locked: true,
            },
            HttpStatus.LOCKED || 423,
          );
        }
      }
    }

    // 3.5 Check if user is deleted or scheduled for deletion
    let accountRestored = false;
    let cooldownUntil: number | null = null;

    if (user.isScheduledForDeletion) {
      const now = Date.now();
      if (user.deletionDeadline && now <= user.deletionDeadline) {
        // Within 7 days grace period -> Cancel deletion and restore user!
        user.isScheduledForDeletion = false;
        user.isDeleted = false;
        user.deletionRequestedAt = null;
        user.deletionDeadline = null;
        user.restoredAt = now;
        user.deletionCooldownUntil = now + 7 * 24 * 60 * 60 * 1000; // 7 days cooldown
        user.updatedAt = now;
        await this.userRepository.save(user);

        accountRestored = true;
        cooldownUntil = user.deletionCooldownUntil;
        console.log(`[AuthService] Account restored successfully for user ${user.id} (${user.email}). 7-day cooldown active.`);
      } else {
        throw new UnauthorizedException('This account has been permanently deleted.');
      }
    } else if (user.isDeleted) {
      throw new UnauthorizedException('This account no longer exists.');
    }
    if (user.isBanned) {
      throw new UnauthorizedException('Your account has been suspended by an administrator.');
    }

    // 4. Password is valid! Clear failed attempts and lockouts universally from Redis
    if (lockState && (lockState.attempts > 0 || lockState.lockedUntil > 0)) {
      await this.redisService.del(lockKey);
    }

    // 5. Check email verification status
    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email address before logging in.');
    }

    // Auto-heal termsAccepted for verified manual registrations (consented during signup)
    if (!user.termsAccepted) {
      user.termsAccepted = true;
      user.termsAcceptedAt = user.createdAt || Date.now();
      await this.userRepository.save(user).catch(() => {});
    }

    // 6. Generate JWT token
    const tokenPayload = { sub: user.id, email: user.email, role: user.role || 'user' };
    const accessToken = this.jwtService.sign(tokenPayload);

    const profile = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      authProvider: 'email',
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      isVerified: user.isVerified,
      role: user.role || 'user',
      isBanned: user.isBanned ?? false,
      termsAccepted: user.termsAccepted ?? false,
      termsAcceptedAt: user.termsAcceptedAt ?? null,
      isScheduledForDeletion: user.isScheduledForDeletion ?? false,
      deletionCooldownUntil: user.deletionCooldownUntil ?? null,
    };

    return {
      profile,
      accessToken,
      accountRestored,
      cooldownUntil,
    };
  }

  /**
   * Request password reset link. Generates a secure token stored in Redis with 15-min TTL.
   */
  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const sanitizedEmail = email.trim().toLowerCase();
    const user = await this.userRepository.findOne({
      where: { email: sanitizedEmail, isDeleted: false },
    });

    // To prevent email enumeration, always return friendly message
    if (!user) {
      return { message: 'If an account exists with this email, a password reset link has been dispatched.' };
    }

    const resetToken = crypto.randomBytes(24).toString('hex');
    // Store in Redis for 15 minutes (900 seconds)
    await this.redisService.set(`pwd_reset:${resetToken}`, user.id, 900);

    // Send email via MailService
    await this.mailService.sendPasswordResetEmail(user.email || sanitizedEmail, user.name || '', resetToken);

    return { message: 'Password reset link sent to your email. Check your inbox.' };
  }

  /**
   * Reset password and instantly unlock account.
   */
  async resetPassword(token: string, newPassword: string): Promise<{ message: string; success: boolean }> {
    if (!token || !newPassword || newPassword.length < 6) {
      throw new BadRequestException('Valid reset token and password (at least 6 characters) are required.');
    }

    // 1. Verify token from Redis
    const userId = await this.redisService.get(`pwd_reset:${token}`);
    if (!userId) {
      throw new BadRequestException('Password reset token is invalid or has expired. Please request a new link.');
    }

    // 2. Find user
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });

    if (!user) {
      throw new BadRequestException('User account not found.');
    }

    // 3. Update password in PostgreSQL
    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.updatedAt = Date.now();
    await this.userRepository.save(user);

    // 4. Immediately clear token from Redis
    await this.redisService.del(`pwd_reset:${token}`);

    // A reset must end every existing session: whoever had the old password (or a stolen
    // session) is signed out on all devices.
    await this.revokeSessions(user.id).catch(() => undefined);

    // 5. Clear every lock on this account (all addresses) and the failed-attempt counter
    await this.redisService.set(this.getUnlockKey(user.id), String(Date.now()), 25 * 3600);
    await this.redisService.del(this.getFailCountKey(user.id));
    await this.redisService.del(this.getLockKeyForUser(user.id));
    if (user.email) {
      await this.redisService.del(this.getLockKeyForAnon(user.email));
    }
    if (user.phone) {
      await this.redisService.del(this.getLockKeyForAnon(user.phone));
    }

    console.log(`[AuthService] Password reset successful. Account unlocked for user ${user.id} (${user.email}).`);

    return {
      success: true,
      message: 'Password successfully updated! Your account is now active and unlocked.',
    };
  }

  private googleClient: OAuth2Client;

  private getGoogleClient(): OAuth2Client {
    if (!this.googleClient) {
      const clientId = this.configService?.get<string>('GOOGLE_CLIENT_ID') || process.env.GOOGLE_CLIENT_ID;
      this.googleClient = new OAuth2Client(clientId);
    }
    return this.googleClient;
  }

  async googleAuthWithToken(idToken: string) {
    if (!idToken) {
      throw new UnauthorizedException('Google ID token is required');
    }

    const configuredClientId = this.configService?.get<string>('GOOGLE_CLIENT_ID') || process.env.GOOGLE_CLIENT_ID;
    const allowedAudiences = [
      configuredClientId,
      '55231273460-epfomp35a43c6d15bhilb92i6btl6jt9.apps.googleusercontent.com',
    ].filter(Boolean) as string[];

    // 1. Cryptographically verify the Google idToken
    let payload;
    try {
      const ticket = await this.getGoogleClient().verifyIdToken({
        idToken,
        audience: allowedAudiences,
      });
      payload = ticket.getPayload();
    } catch (error: any) {
      console.error('[AuthService] Google token verification error:', error?.message || error);
      throw new UnauthorizedException('Invalid or expired Google token');
    }

    if (!payload || !payload.email) {
      throw new UnauthorizedException('Google token does not contain a valid email address');
    }

    // An unverified Google email must never sign in to (or link with) the account that owns it
    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Your Google email address is not verified.');
    }

    const email = payload.email.trim().toLowerCase();
    const name = payload.name || payload.given_name || 'Google User';
    const avatarUrl = payload.picture || '';
    const now = Date.now();

    let joinedNow = false;

    // 2. Check if a user with this email already exists (e.g. active or scheduled for deletion)
    let user = await this.userRepository.findOne({
      where: { email },
      order: { isDeleted: 'ASC' }, // the active account first, if an old deleted one shares the email
    });

    let accountRestored = false;
    let cooldownUntil: number | null = null;

    if (user) {
      if (user.isScheduledForDeletion) {
        if (user.deletionDeadline && now <= user.deletionDeadline) {
          user.isScheduledForDeletion = false;
          user.isDeleted = false;
          user.deletionRequestedAt = null;
          user.deletionDeadline = null;
          user.restoredAt = now;
          user.deletionCooldownUntil = now + 7 * 24 * 60 * 60 * 1000;
          accountRestored = true;
          cooldownUntil = user.deletionCooldownUntil;
          console.log(`[AuthService] Google user account restored: ${user.id} (${user.email}). 7-day cooldown active.`);
        } else {
          throw new UnauthorizedException('This account has been permanently deleted.');
        }
      } else if (user.isDeleted) {
        throw new UnauthorizedException('This account no longer exists.');
      }

      if (user.isBanned) {
        throw new UnauthorizedException('Your account has been suspended by an administrator.');
      }

      // An account that was never verified may have been created by someone else typing this
      // email with their own password. Google has now proved who owns the email, so that
      // password is removed: only the Google owner (or a password reset by email) gets in.
      if (!user.isVerified) {
        user.passwordHash = null;
        user.verificationToken = null;
        joinedNow = true; // first time this email is confirmed
      }
      user.isVerified = true; // Auto-verify email via Google
      if (!user.name && name) user.name = name;
      if (!user.avatarUrl && avatarUrl) user.avatarUrl = avatarUrl;
      user.updatedAt = now;
      user = (await this.userRepository.save(user)) as User;
    } else {
      // 🆕 Brand new user: Create fresh account
      const userId = crypto.randomUUID();
      user = this.userRepository.create({
        id: userId,
        userId: userId,
        email,
        phone: '',
        name,
        authProvider: 'google',
        avatarUrl,
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        isVerified: true,
        verificationToken: null,
        termsAccepted: true,
        termsAcceptedAt: now,
      });
      user = (await this.userRepository.save(user)) as User;
      joinedNow = true;
    }

    // New Google signup: send the thank-you email right away (Redis queue worker).
    if (joinedNow) await this.welcomeEmails.schedule(user, 'google');

    // 3. Issue the standard Regent Money JWT token
    const tokenPayload = { sub: user.id, email: user.email, role: user.role || 'user' };
    const accessToken = this.jwtService.sign(tokenPayload);

    const userProfile = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      authProvider: user.authProvider,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      isVerified: user.isVerified,
      role: user.role || 'user',
      isBanned: user.isBanned ?? false,
      termsAccepted: user.termsAccepted ?? false,
      termsAcceptedAt: user.termsAcceptedAt ?? null,
      isScheduledForDeletion: user.isScheduledForDeletion ?? false,
      deletionCooldownUntil: user.deletionCooldownUntil ?? null,
    };

    return {
      accessToken,
      user: userProfile,
      profile: userProfile,
      accountRestored,
      cooldownUntil,
    };
  }

  async validateUserToken(jwtToken: string): Promise<User | null> {
    try {
      const payload = this.jwtService.verify(jwtToken);
      const user = await this.userRepository.findOne({
        where: { id: payload.sub, isDeleted: false },
      });
      return user;
    } catch (e) {
      return null;
    }
  }

  async getSecuritySettings(userId: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, isDeleted: false },
      });
      if (!user) {
        throw new UnauthorizedException('User not found.');
      }
      return {
        biometricsEnabled: user.biometricsEnabled ?? false,
        autoLockTimeout: user.autoLockTimeout ?? 1,
      };
    } catch (err: any) {
      if (err?.message?.includes('biometrics_enabled')) {
        try {
          await this.userRepository.query(`ALTER TABLE core.users ADD COLUMN IF NOT EXISTS biometrics_enabled BOOLEAN DEFAULT FALSE;`);
          await this.userRepository.query(`ALTER TABLE core.users ADD COLUMN IF NOT EXISTS auto_lock_timeout INTEGER DEFAULT 1;`);
          const user = await this.userRepository.findOne({ where: { id: userId, isDeleted: false } });
          return {
            biometricsEnabled: user?.biometricsEnabled ?? false,
            autoLockTimeout: user?.autoLockTimeout ?? 1,
          };
        } catch {
          return { biometricsEnabled: false, autoLockTimeout: 1 };
        }
      }
      throw err;
    }
  }

  async updateSecuritySettings(
    userId: string,
    settings: { biometricsEnabled?: boolean; autoLockTimeout?: number },
  ) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, isDeleted: false },
      });
      if (!user) {
        throw new UnauthorizedException('User not found.');
      }

      if (typeof settings.biometricsEnabled === 'boolean') {
        user.biometricsEnabled = settings.biometricsEnabled;
      }
      if (typeof settings.autoLockTimeout === 'number') {
        user.autoLockTimeout = settings.autoLockTimeout;
      }
      user.updatedAt = Date.now();

      await this.userRepository.save(user);

      return {
        success: true,
        biometricsEnabled: user.biometricsEnabled ?? false,
        autoLockTimeout: user.autoLockTimeout ?? 1,
      };
    } catch (err: any) {
      if (err?.message?.includes('biometrics_enabled')) {
        await this.userRepository.query(`ALTER TABLE core.users ADD COLUMN IF NOT EXISTS biometrics_enabled BOOLEAN DEFAULT FALSE;`);
        await this.userRepository.query(`ALTER TABLE core.users ADD COLUMN IF NOT EXISTS auto_lock_timeout INTEGER DEFAULT 1;`);
        const user = await this.userRepository.findOne({ where: { id: userId, isDeleted: false } });
        if (user) {
          if (typeof settings.biometricsEnabled === 'boolean') user.biometricsEnabled = settings.biometricsEnabled;
          if (typeof settings.autoLockTimeout === 'number') user.autoLockTimeout = settings.autoLockTimeout;
          user.updatedAt = Date.now();
          await this.userRepository.save(user);
          return {
            success: true,
            biometricsEnabled: user.biometricsEnabled ?? false,
            autoLockTimeout: user.autoLockTimeout ?? 1,
          };
        }
      }
      throw err;
    }
  }

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      avatarUrl: user.avatarUrl,
      dob: user.dob,
      gender: user.gender,
      occupation: user.occupation,
      currentIncome: user.currentIncome ? Number(user.currentIncome) : null,
      incomeSourcesCount: user.incomeSourcesCount ?? 1,
      authProvider: user.authProvider,
      role: user.role || 'user',
      isBanned: user.isBanned ?? false,
      biometricsEnabled: user.biometricsEnabled ?? false,
      autoLockTimeout: user.autoLockTimeout ?? 1,
      termsAccepted: user.termsAccepted ?? false,
      termsAcceptedAt: user.termsAcceptedAt ?? null,
      isScheduledForDeletion: user.isScheduledForDeletion ?? false,
      deletionCooldownUntil: user.deletionCooldownUntil ?? null,
      deletionDeadline: user.deletionDeadline ?? null,
    };
  }

  async updateProfile(
    userId: string,
    dto: {
      name?: string;
      avatarUrl?: string;
      dob?: string;
      gender?: string;
      occupation?: string;
      currentIncome?: number;
      incomeSourcesCount?: number;
    },
  ) {
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    // Every field is bounded: nothing a phone sends can store megabytes in the users table
    const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined);
    const name = text(dto.name, 80);
    if (name) user.name = name;
    if (dto.avatarUrl === '' || AuthService.isHostedImageUrl(dto.avatarUrl)) user.avatarUrl = dto.avatarUrl as string;
    const dob = text(dto.dob, 20);
    if (dob !== undefined) user.dob = dob;
    const gender = text(dto.gender, 20);
    if (gender !== undefined) user.gender = gender;
    const occupation = text(dto.occupation, 80);
    if (occupation !== undefined) user.occupation = occupation;
    if (dto.currentIncome !== undefined) {
      const income = Number(dto.currentIncome);
      if (Number.isFinite(income) && income >= 0 && income <= 1e12) user.currentIncome = income;
    }
    if (dto.incomeSourcesCount !== undefined) {
      const count = Math.floor(Number(dto.incomeSourcesCount));
      if (Number.isFinite(count) && count >= 0 && count <= 50) user.incomeSourcesCount = count;
    }
    user.updatedAt = Date.now();

    await this.userRepository.save(user);
    return this.getProfile(userId);
  }

  /** A normal https image link (not a data: blob, not megabytes of text). */
  static isHostedImageUrl(value: unknown): boolean {
    return typeof value === 'string' && value.length <= 500 && /^https:\/\/[^\s]+$/.test(value);
  }

  async uploadAvatar(userId: string, fileData: string) {
    if (typeof fileData !== 'string' || !fileData) {
      throw new BadRequestException('Choose a photo to upload.');
    }
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });
    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET')?.trim();
    if (cloudName && apiKey && apiSecret) {
      try {
        cloudinary.config({
          cloud_name: cloudName,
          api_key: apiKey,
          api_secret: apiSecret,
          secure: true,
        });
        const uploadRes = await cloudinary.uploader.upload(fileData, {
          folder: 'regent_avatars',
          transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
        });
        user.avatarUrl = uploadRes.secure_url;
        user.updatedAt = Date.now();
        await this.userRepository.save(user);
        return { avatarUrl: uploadRes.secure_url };
      } catch (uploadErr: any) {
        console.warn('[Cloudinary] Upload failed, falling back:', uploadErr?.message || uploadErr);
      }
    }

    // Without the image host, only a normal https link may be saved. The photo itself is never
    // written into the database (the app keeps it on the phone instead).
    if (!AuthService.isHostedImageUrl(fileData)) {
      throw new BadRequestException('The photo could not be uploaded. Please try again.');
    }
    user.avatarUrl = fileData;
    user.updatedAt = Date.now();
    await this.userRepository.save(user);
    return { avatarUrl: fileData };
  }

  async acceptTerms(userId: string) {
    try {
      const user = await this.userRepository.findOne({
        where: { id: userId, isDeleted: false },
      });
      if (!user) {
        throw new UnauthorizedException('User not found.');
      }
      const now = Date.now();
      user.termsAccepted = true;
      user.termsAcceptedAt = now;
      user.updatedAt = now;
      await this.userRepository.save(user);

      return {
        success: true,
        termsAccepted: true,
        termsAcceptedAt: now,
      };
    } catch (err: any) {
      if (err?.message?.includes('terms_accepted')) {
        await this.userRepository.query(`ALTER TABLE core.users ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE;`);
        await this.userRepository.query(`ALTER TABLE core.users ADD COLUMN IF NOT EXISTS terms_accepted_at BIGINT;`);
        const user = await this.userRepository.findOne({ where: { id: userId, isDeleted: false } });
        if (user) {
          const now = Date.now();
          user.termsAccepted = true;
          user.termsAcceptedAt = now;
          user.updatedAt = now;
          await this.userRepository.save(user);
          return {
            success: true,
            termsAccepted: true,
            termsAcceptedAt: now,
          };
        }
      }
      throw err;
    }
  }

  /**
   * Signs the user out on the server: every access token issued before now stops working,
   * so a token copied off a device is useless after sign-out.
   */
  async revokeSessions(userId: string): Promise<{ success: boolean }> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    await this.userRepository.query(
      `UPDATE core.users SET tokens_valid_after = $1 WHERE id = $2`,
      [nowSeconds, userId],
    );
    await this.redisService.del(`user:status:${userId}`).catch(() => false);
    // Also cancel every refresh token and blacklist the user's current access tokens
    await this.tokenService.revokeAllForUser(userId).catch(() => undefined);
    return { success: true };
  }

  async requestAccountDeletion(
    userId: string,
    dto: { password?: string; reasonCode: string; customFeedback?: string },
  ) {
    const user = await this.userRepository.findOne({
      where: { id: userId, isDeleted: false },
    });
    if (!user) {
      throw new NotFoundException('User account not found.');
    }

    const now = Date.now();

    // 1. Check if user is in an active cooldown period (7 days after restoration)
    if (user.deletionCooldownUntil && now < user.deletionCooldownUntil) {
      const remainingDays = Math.max(1, Math.ceil((user.deletionCooldownUntil - now) / (86400 * 1000)));
      throw new ForbiddenException(
        `Account deletion is locked during the 7-day cooldown period following recent account restoration. Please try again in ${remainingDays} day(s).`,
      );
    }

    // 2. If user has a password (registered via email/password), verify it
    if (user.passwordHash) {
      if (!dto.password) {
        throw new BadRequestException('Password confirmation is required to delete this account.');
      }
      const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
      if (!isPasswordValid) {
        throw new BadRequestException('Incorrect password. Account deletion aborted.');
      }
    }

    // 3. Compute 7-day grace period
    const deletionRequestedAt = now;
    const deletionDeadline = now + 7 * 24 * 60 * 60 * 1000; // 7 days (604,800,000 ms)

    user.isScheduledForDeletion = true;
    user.isDeleted = true; // Soft delete
    user.deletionRequestedAt = deletionRequestedAt;
    user.deletionDeadline = deletionDeadline;
    user.deletionReason = dto.reasonCode;
    user.deletionFeedback = dto.customFeedback?.trim() || null;
    user.updatedAt = now;
    await this.userRepository.save(user);

    // 4. Save survey reason in core.account_deletion_reasons
    try {
      const hmac = user.email
        ? crypto
            .createHmac('sha256', this.configService.get<string>('JWT_SECRET') || 'regent-secret')
            .update(user.email.toLowerCase().trim())
            .digest('hex')
        : user.id;

      const reasonLabels: Record<string, string> = {
        SWITCHING_ALTERNATIVE: 'Found an alternative / Another app',
        PRIVACY_SECURITY: 'Concerns about data privacy & security',
        BANK_SYNC_ISSUES: 'Difficulty connecting or syncing bank accounts',
        COMPLEX_UI: 'Too complicated or difficult to use',
        GOALS_ACHIEVED: 'Financial tracking goals achieved / Starting fresh',
        TOO_MANY_NOTIFS: 'Too many notifications / alerts',
        BUGS_CRASHES: 'Experiencing technical bugs or app crashes',
        OTHER: 'Other reason',
      };

      await this.userRepository.query(
        `INSERT INTO core.account_deletion_reasons (user_id_hmac, reason_code, reason_label, custom_feedback, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          hmac,
          dto.reasonCode,
          reasonLabels[dto.reasonCode] || dto.reasonCode,
          dto.customFeedback?.trim() || null,
          now,
        ],
      );
    } catch (surveyErr) {
      console.warn('[AuthService] Could not log deletion survey reason:', surveyErr);
    }

    // 5. Invalidate active Redis tokens and sessions, and cancel all device families & access tokens
    try {
      await Promise.allSettled([
        this.redisService.del(this.getLockKeyForUser(user.id)),
        this.redisService.del(`auth:session:${user.id}`),
        this.redisService.del(`auth:refresh:${user.id}`),
        this.redisService.del(`user:role:${user.id}`),
        this.tokenService.revokeAllForUser(user.id),
      ]);
    } catch {}

    return {
      success: true,
      message: 'Account scheduled for deletion. You have 7 days to change your mind by logging back in.',
      deletionDeadline,
    };
  }
}

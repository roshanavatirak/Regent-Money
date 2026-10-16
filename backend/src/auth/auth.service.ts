import { Injectable, UnauthorizedException, BadRequestException, ConflictException, HttpException, HttpStatus, OnModuleInit } from '@nestjs/common';
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

  async signUp(dto: { name: string; email: string; phone: string; password?: string }) {
    const email = dto.email.trim().toLowerCase();
    const phone = dto.phone.trim();

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
    if (dto.password) {
      passwordHash = await bcrypt.hash(dto.password, 10);
    }

    // 3. Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // 4. Create user record
    const userId = crypto.randomUUID();
    const now = Date.now();
    const user = this.userRepository.create({
      id: userId,
      userId: userId,
      email,
      phone,
      passwordHash,
      name: dto.name,
      authProvider: 'email',
      avatarUrl: '',
      createdAt: now,
      updatedAt: now,
      isDeleted: false,
      isVerified: false,
      verificationToken,
    });

    const savedUser = await this.userRepository.save(user) as User;

    // 5. Send verification email asynchronously in the background (DO NOT await it!)
    const backendUrl = this.configService.get<string>('BACKEND_URL') || 'http://localhost:3000';
    const verificationLink = `${backendUrl}/auth/verify?token=${verificationToken}`;

    this.mailService.sendVerificationEmail(email, dto.name, verificationToken).catch((err) => {
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
      termsAccepted: savedUser.termsAccepted ?? false,
      termsAcceptedAt: savedUser.termsAcceptedAt ?? null,
    };

    return {
      profile,
      sessionConfirmed: false, // Must verify email first
      verificationToken,
      verificationLink,
    };
  }

  async verifyEmail(token: string) {
    const user = await this.userRepository.findOne({
      where: { verificationToken: token, isDeleted: false },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired verification token.');
    }

    user.isVerified = true;
    user.verificationToken = null;
    user.updatedAt = Date.now();
    await this.userRepository.save(user);

    return { message: 'Your email has been successfully verified! You can now log in.' };
  }

  async resendVerificationEmail(email: string) {
    const sanitizedEmail = email.trim().toLowerCase();
    const user = await this.userRepository.findOne({
      where: { email: sanitizedEmail, isDeleted: false },
    });

    if (!user) {
      return { message: 'If this email is registered, a new verification link has been sent.' };
    }

    if (user.isVerified) {
      return { message: 'Your account is already verified. You can log in directly.' };
    }

    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = verificationToken;
    user.updatedAt = Date.now();
    await this.userRepository.save(user);

    await this.mailService.sendVerificationEmail(user.email || sanitizedEmail, user.name || '', verificationToken);
    return { message: 'A new verification link has been sent to your email.' };
  }

  private getLockKeyForUser(userId: string): string {
    return `auth:lock:u:${userId}`;
  }

  private getLockKeyForAnon(identifier: string): string {
    return `auth:lock:anon:${identifier.trim().toLowerCase()}`;
  }

  private async getLockoutStateFromRedis(lockKey: string): Promise<{ attempts: number; violations: number; lockedUntil: number; tier: number } | null> {
    const raw = await this.redisService.get(lockKey);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw);
      const now = Date.now();
      if (parsed.l && now < parsed.l) {
        return { attempts: parsed.a || 0, violations: parsed.v || 1, lockedUntil: parsed.l, tier: parsed.v || 1 };
      }
      return { attempts: parsed.a || 0, violations: parsed.v || 0, lockedUntil: 0, tier: 0 };
    } catch {
      return null;
    }
  }

  async login(dto: { emailOrMobile: string; password?: string }) {
    const input = dto.emailOrMobile.trim();
    const isEmail = input.includes('@');
    const normalizedIdentifier = isEmail ? input.toLowerCase() : input;

    // 1. Look up user by email or phone so lockout is universally bound to the exact account
    const user = await this.userRepository.findOne({
      where: isEmail
        ? { email: normalizedIdentifier, isDeleted: false }
        : { phone: normalizedIdentifier, isDeleted: false },
    });

    // Determine the universal Redis lock key (keyed by user.id if user exists, else anonymous identifier)
    const lockKey = user ? this.getLockKeyForUser(user.id) : this.getLockKeyForAnon(normalizedIdentifier);

    // 2. Check if account is currently locked out in Redis (universal across all devices & methods)
    const lockState = await this.getLockoutStateFromRedis(lockKey);
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
      // Handle failed password attempt (3 attempt rule, tracked universally in Redis)
      const currentAttempts = (lockState?.attempts || 0) + 1;
      const currentViolations = lockState?.violations || 0;

      if (currentAttempts < 3) {
        // Attempt 1 or 2: record attempt universally in Redis with 2-hour sliding window
        const attemptsLeft = 3 - currentAttempts;
        await this.redisService.set(
          lockKey,
          JSON.stringify({ a: currentAttempts, v: currentViolations, l: 0 }),
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
            JSON.stringify({ a: 0, v: 1, l: lockedUntil }),
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
            JSON.stringify({ a: 0, v: 2, l: lockedUntil }),
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

    // 3.5 Check if user is deleted or banned
    if (user.isDeleted) {
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
    };

    return {
      profile,
      accessToken,
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

    // 5. Instantly clear universal user lockout & attempt key in Redis across all devices
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

    const email = payload.email.trim().toLowerCase();
    const name = payload.name || payload.given_name || 'Google User';
    const avatarUrl = payload.picture || '';
    const now = Date.now();

    // 2. Check if a user with this email already exists (e.g. registered with password)
    let user = await this.userRepository.findOne({
      where: { email, isDeleted: false },
    });

    if (user) {
      // ✅ Same person, same account: Link existing account!
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
      });
      user = (await this.userRepository.save(user)) as User;
    }

    // 2.5 Check if account is deleted or banned
    if (user.isDeleted) {
      throw new UnauthorizedException('This account no longer exists.');
    }
    if (user.isBanned) {
      throw new UnauthorizedException('Your account has been suspended by an administrator.');
    }

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
    };

    return {
      accessToken,
      user: userProfile,
      profile: userProfile,
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

    if (dto.name !== undefined) user.name = dto.name;
    if (dto.avatarUrl !== undefined) user.avatarUrl = dto.avatarUrl;
    if (dto.dob !== undefined) user.dob = dto.dob;
    if (dto.gender !== undefined) user.gender = dto.gender;
    if (dto.occupation !== undefined) user.occupation = dto.occupation;
    if (dto.currentIncome !== undefined) user.currentIncome = dto.currentIncome;
    if (dto.incomeSourcesCount !== undefined) user.incomeSourcesCount = dto.incomeSourcesCount;
    user.updatedAt = Date.now();

    await this.userRepository.save(user);
    return this.getProfile(userId);
  }

  async uploadAvatar(userId: string, fileData: string) {
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

    // Direct URL fallback if Cloudinary is not yet configured or for remote links
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
}

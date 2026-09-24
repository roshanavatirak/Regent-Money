import { Injectable, UnauthorizedException, BadRequestException, ConflictException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v2 as cloudinary } from 'cloudinary';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

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
      console.log('[AuthService] Profile & security columns verified on core.users table.');
    } catch (err: any) {
      console.warn('[AuthService] Could not auto-migrate core.users columns:', err?.message || err);
    }

    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY') || '285736315229939';
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET') || 'LeyD3tf1pxkJO4oww6HFKw3OvBg';
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

  async login(dto: { emailOrMobile: string; password?: string }) {
    const input = dto.emailOrMobile.trim();
    const isEmail = input.includes('@');

    // 1. Find user by email or phone
    const user = await this.userRepository.findOne({
      where: isEmail
        ? { email: input.toLowerCase(), isDeleted: false }
        : { phone: input, isDeleted: false },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email/mobile number or password.');
    }

    // 2. Validate password
    if (user.passwordHash && dto.password) {
      const isMatch = await bcrypt.compare(dto.password, user.passwordHash);
      if (!isMatch) {
        throw new UnauthorizedException('Invalid email/mobile number or password.');
      }
    } else {
      throw new UnauthorizedException('Invalid credentials.');
    }

    // 3. Check email verification status
    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your email address before logging in.');
    }

    // 4. Generate JWT token
    const tokenPayload = { sub: user.id, email: user.email };
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
    };

    return {
      profile,
      accessToken,
    };
  }

  async googleAuth(dto: { email: string; name: string; avatarUrl?: string }) {
    const email = dto.email.trim().toLowerCase();
    
    // Check if user already exists
    let user = await this.userRepository.findOne({
      where: { email, isDeleted: false },
    });

    const now = Date.now();

    if (!user) {
      // Register a new user via Google (automatically verified)
      const userId = crypto.randomUUID();
      user = this.userRepository.create({
        id: userId,
        userId: userId,
        email,
        phone: '',
        name: dto.name,
        authProvider: 'google',
        avatarUrl: dto.avatarUrl || '',
        createdAt: now,
        updatedAt: now,
        isDeleted: false,
        isVerified: true, // Google accounts are auto-verified
        verificationToken: null,
      });
      user = await this.userRepository.save(user) as User;
    } else {
      // Update details if necessary
      user.name = dto.name;
      if (dto.avatarUrl) {
        user.avatarUrl = dto.avatarUrl;
      }
      user.updatedAt = now;
      user = await this.userRepository.save(user) as User;
    }

    const tokenPayload = { sub: user.id, email: user.email };
    const accessToken = this.jwtService.sign(tokenPayload);

    const profile = {
      id: user.id,
      email: user.email,
      phone: user.phone,
      name: user.name,
      authProvider: 'google',
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      isVerified: user.isVerified,
    };

    return {
      profile,
      accessToken,
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
      biometricsEnabled: user.biometricsEnabled ?? false,
      autoLockTimeout: user.autoLockTimeout ?? 1,
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

    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY') || '285736315229939';
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET') || 'LeyD3tf1pxkJO4oww6HFKw3OvBg';
    if (cloudName) {
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
}

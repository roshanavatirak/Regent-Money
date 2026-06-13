import { Injectable, UnauthorizedException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { User } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

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
}

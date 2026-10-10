import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../users/entities/user.entity';
import { MailModule } from '../mail/mail.module';

import { TurnstileService } from './turnstile.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    MailModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        const isProd = config.get<string>('NODE_ENV') === 'production';
        if (!secret || secret === 'default-jwt-secret-key-1234') {
          if (isProd) {
            throw new Error('FATAL: JWT_SECRET environment variable is missing or insecure. Refusing to boot in production.');
          }
        }
        return {
          secret: secret || 'default-jwt-secret-key-1234',
          signOptions: { expiresIn: '30d' }, // Session active for 30 days
        };
      },
    }),
  ],
  providers: [AuthService, TurnstileService],
  controllers: [AuthController],
  exports: [AuthService, TurnstileService, JwtModule],
})
export class AuthModule {}

import { Controller, Post, Get, Patch, Body, Query, Res, Req, HttpCode, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

import { TurnstileService } from './turnstile.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly turnstileService: TurnstileService,
  ) { }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(
    @Req() req: any,
    @Body() body: { name: string; email: string; phone: string; password?: string; turnstileToken?: string },
  ) {
    const isWeb = Boolean(req.headers?.origin || req.headers?.referer);
    if (body.turnstileToken) {
      await this.turnstileService.verifyToken(body.turnstileToken, req?.ip);
    } else if (isWeb && process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY) {
      throw new BadRequestException('Security verification token is required for web signup.');
    }
    return this.authService.signUp(body);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req: any,
    @Body() body: { emailOrMobile: string; password?: string; turnstileToken?: string },
  ) {
    const isWeb = Boolean(req.headers?.origin || req.headers?.referer);
    if (body.turnstileToken) {
      await this.turnstileService.verifyToken(body.turnstileToken, req?.ip);
    } else if (isWeb && process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY) {
      throw new BadRequestException('Security verification token is required for web login.');
    }
    return this.authService.login(body);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body('email') email: string) {
    if (!email || !email.trim()) {
      throw new BadRequestException('Email address is required.');
    }
    return this.authService.requestPasswordReset(email);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@Body('email') email: string) {
    if (!email || !email.trim()) {
      throw new BadRequestException('Email address is required.');
    }
    return this.authService.resendVerificationEmail(email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body('token') token: string,
    @Body('newPassword') newPassword: string,
  ) {
    if (!token || !newPassword) {
      throw new BadRequestException('Reset token and new password are required.');
    }
    return this.authService.resetPassword(token, newPassword);
  }

  @Get('reset-password-page')
  async resetPasswordPage(@Query('token') token: string, @Res() res: Response) {
    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head><title>Invalid Link - Regent Money</title></head>
        <body style="background:#12141c;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
          <div style="background:#1a1d2e;padding:32px;border-radius:16px;text-align:center;max-width:400px;border:1px solid #333;">
            <h2 style="color:#ff5252;">Invalid Reset Link</h2>
            <p style="color:#aaa;font-size:14px;margin-top:12px;">This password reset link is missing a valid security token.</p>
          </div>
        </body>
        </html>
      `);
    }

    return res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Password & Unlock - Regent Money</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
          :root {
            --bg: #12141c;
            --card-bg: rgba(26, 29, 46, 0.75);
            --primary: #2dba4e;
            --text: #ffffff;
            --text-muted: #8c92a6;
            --border: rgba(255, 255, 255, 0.1);
          }
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            background-color: var(--bg);
            color: var(--text);
            font-family: 'Outfit', sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
          }
          .card {
            background: var(--card-bg);
            border: 1px solid var(--border);
            border-radius: 20px;
            padding: 36px 28px;
            width: 100%;
            max-width: 420px;
            text-align: center;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
          }
          h2 { font-size: 24px; font-weight: 800; margin-bottom: 8px; }
          p { font-size: 14px; color: var(--text-muted); line-height: 1.5; margin-bottom: 24px; }
          .form-group { text-align: left; margin-bottom: 16px; }
          label { display: block; font-size: 12px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 6px; }
          input {
            width: 100%;
            padding: 12px 16px;
            border-radius: 10px;
            border: 1px solid var(--border);
            background: rgba(0,0,0,0.3);
            color: #fff;
            font-size: 15px;
            outline: none;
          }
          input:focus { border-color: var(--primary); }
          .btn {
            width: 100%;
            padding: 14px;
            border-radius: 12px;
            background: var(--primary);
            color: #fff;
            font-size: 15px;
            font-weight: 800;
            border: none;
            cursor: pointer;
            margin-top: 10px;
          }
          .btn:disabled { opacity: 0.5; cursor: not-allowed; }
          .status { margin-top: 16px; font-size: 14px; font-weight: 600; }
          .status.error { color: #ff5252; }
          .status.success { color: var(--primary); }
        </style>
      </head>
      <body>
        <div class="card" id="formCard">
          <h2>Reset Password</h2>
          <p>Enter your new password to reset credentials and <strong>instantly unlock your account</strong>.</p>
          <div class="form-group">
            <label>New Password</label>
            <input type="password" id="newPassword" placeholder="Minimum 6 characters" />
          </div>
          <div class="form-group">
            <label>Confirm Password</label>
            <input type="password" id="confirmPassword" placeholder="Re-enter new password" />
          </div>
          <button class="btn" id="submitBtn" onclick="submitReset()">Update & Unlock Account</button>
          <div class="status" id="statusMsg"></div>
        </div>

        <script>
          const token = ${JSON.stringify(token)};
          async function submitReset() {
            const pwd = document.getElementById('newPassword').value;
            const confirm = document.getElementById('confirmPassword').value;
            const msg = document.getElementById('statusMsg');
            const btn = document.getElementById('submitBtn');

            if (!pwd || pwd.length < 6) {
              msg.className = 'status error';
              msg.textContent = 'Password must be at least 6 characters.';
              return;
            }
            if (pwd !== confirm) {
              msg.className = 'status error';
              msg.textContent = 'Passwords do not match.';
              return;
            }

            btn.disabled = true;
            btn.textContent = 'Updating...';
            msg.textContent = '';

            try {
              const res = await fetch('/auth/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, newPassword: pwd })
              });
              const data = await res.json();
              if (res.ok) {
                document.getElementById('formCard').innerHTML = \`
                  <div style="font-size: 40px; margin-bottom: 12px;">✅</div>
                  <h2 style="color: #2dba4e;">Account Unlocked!</h2>
                  <p style="color: #aaa; margin: 16px 0;">Your password has been updated and your account is active. You can now return to Regent Money and log in.</p>
                \`;
              } else {
                msg.className = 'status error';
                msg.textContent = data.message || 'Reset failed. Token may be expired.';
                btn.disabled = false;
                btn.textContent = 'Update & Unlock Account';
              }
            } catch (err) {
              msg.className = 'status error';
              msg.textContent = 'Network error. Please try again.';
              btn.disabled = false;
              btn.textContent = 'Update & Unlock Account';
            }
          }
        </script>
      </body>
      </html>
    `);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuth(
    @Body('idToken') idToken?: string,
    @Body() body?: { idToken?: string },
  ) {
    const token = idToken || body?.idToken;
    if (!token) {
      throw new BadRequestException('Google ID token is required');
    }
    return this.authService.googleAuthWithToken(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get('security-settings')
  async getSecuritySettings(@Req() req: any) {
    return this.authService.getSecuritySettings(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('security-settings')
  @HttpCode(HttpStatus.OK)
  async updateSecuritySettings(
    @Req() req: any,
    @Body() body: { biometricsEnabled?: boolean; autoLockTimeout?: number },
  ) {
    return this.authService.updateSecuritySettings(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('accept-terms')
  @HttpCode(HttpStatus.OK)
  async acceptTerms(@Req() req: any) {
    return this.authService.acceptTerms(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  async getProfile(@Req() req: any) {
    return this.authService.getProfile(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Req() req: any,
    @Body()
    body: {
      name?: string;
      avatarUrl?: string;
      dob?: string;
      gender?: string;
      occupation?: string;
      currentIncome?: number;
      incomeSourcesCount?: number;
    },
  ) {
    return this.authService.updateProfile(req.user.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('upload-avatar')
  @HttpCode(HttpStatus.OK)
  async uploadAvatar(@Req() req: any, @Body() body: { fileData: string }) {
    return this.authService.uploadAvatar(req.user.id, body.fileData);
  }

  @Get('verify')
  async verify(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.authService.verifyEmail(token);

      // Return a premium, beautiful glassmorphism styled success page
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Account Verified - Regent Money</title>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
          <style>
            :root {
              --bg: #12141c;
              --card-bg: rgba(26, 29, 46, 0.45);
              --primary: #2dba4e;
              --primary-glow: rgba(45, 186, 78, 0.15);
              --text: #ffffff;
              --text-muted: #8c92a6;
              --border: rgba(255, 255, 255, 0.08);
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              background-color: var(--bg);
              color: var(--text);
              font-family: 'Outfit', sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              overflow: hidden;
            }
            /* Ambient glowing backgrounds */
            .glow-bg {
              position: absolute;
              width: 400px;
              height: 400px;
              border-radius: 50%;
              background: radial-gradient(circle, var(--primary-glow) 0%, rgba(18, 20, 28, 0) 70%);
              z-index: 1;
              filter: blur(40px);
            }
            .glow-1 { top: -100px; left: -100px; }
            .glow-2 { bottom: -100px; right: -100px; }

            .card {
              position: relative;
              background: var(--card-bg);
              backdrop-filter: blur(20px);
              border: 1px solid var(--border);
              border-radius: 24px;
              padding: 48px 32px;
              width: 100%;
              max-width: 440px;
              text-align: center;
              box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
              z-index: 10;
              animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .checkmark-container {
              width: 80px;
              height: 80px;
              border-radius: 50%;
              background: rgba(45, 186, 78, 0.1);
              border: 1px solid rgba(45, 186, 78, 0.2);
              display: flex;
              justify-content: center;
              align-items: center;
              margin: 0 auto 28px;
              box-shadow: 0 0 30px rgba(45, 186, 78, 0.15);
              animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
            }

            .checkmark {
              width: 36px;
              height: 36px;
              stroke: var(--primary);
              stroke-width: 3.5;
              stroke-linecap: round;
              stroke-linejoin: round;
              fill: none;
              stroke-dasharray: 50;
              stroke-dashoffset: 50;
              animation: drawCheck 0.6s cubic-bezier(0.4, 0, 0.2, 1) 0.8s both;
            }

            h1 {
              font-weight: 800;
              font-size: 28px;
              letter-spacing: -0.5px;
              margin-bottom: 12px;
              background: linear-gradient(135deg, #ffffff 0%, #a5b0c9 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }

            p {
              font-size: 15px;
              line-height: 1.6;
              color: var(--text-muted);
              margin-bottom: 36px;
              padding: 0 10px;
            }

            .btn {
              display: inline-block;
              width: 100%;
              background: linear-gradient(135deg, #2dba4e 0%, #1e8535 100%);
              color: #ffffff;
              text-decoration: none;
              font-weight: 600;
              font-size: 15px;
              padding: 16px 28px;
              border-radius: 14px;
              border: none;
              box-shadow: 0 8px 20px rgba(45, 186, 78, 0.25);
              transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
              cursor: pointer;
            }

            .btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 12px 28px rgba(45, 186, 78, 0.4);
            }

            .btn:active {
              transform: translateY(1px);
            }

            @keyframes fadeInUp {
              from {
                opacity: 0;
                transform: translateY(30px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }

            @keyframes scaleIn {
              from {
                transform: scale(0);
              }
              to {
                transform: scale(1);
              }
            }

            @keyframes drawCheck {
              to {
                stroke-dashoffset: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="glow-bg glow-1"></div>
          <div class="glow-bg glow-2"></div>
          <div class="card">
            <div class="checkmark-container">
              <svg class="checkmark" viewBox="0 0 24 24">
                <path d="M20 6L9 17L4 12" />
              </svg>
            </div>
            <h1>Account Verified!</h1>
            <p>Thank you for verifying your email address. Your Regent Money account is now fully active. You can return to the mobile application to start managing your wealth.</p>
            <a href="regentmoney://login" class="btn">Launch Regent Money App</a>
          </div>
        </body>
        </html>
      `);
    } catch (e: any) {
      // Send beautiful error page
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Verification Failed - Regent Money</title>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
          <style>
            :root {
              --bg: #12141c;
              --card-bg: rgba(26, 29, 46, 0.45);
              --danger: #cf222e;
              --danger-glow: rgba(207, 34, 46, 0.15);
              --text: #ffffff;
              --text-muted: #8c92a6;
              --border: rgba(255, 255, 255, 0.08);
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              background-color: var(--bg);
              color: var(--text);
              font-family: 'Outfit', sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              overflow: hidden;
            }
            .glow-bg {
              position: absolute;
              width: 400px;
              height: 400px;
              border-radius: 50%;
              background: radial-gradient(circle, var(--danger-glow) 0%, rgba(18, 20, 28, 0) 70%);
              z-index: 1;
              filter: blur(40px);
            }
            .glow-1 { top: -100px; left: -100px; }
            .glow-2 { bottom: -100px; right: -100px; }

            .card {
              position: relative;
              background: var(--card-bg);
              backdrop-filter: blur(20px);
              border: 1px solid var(--border);
              border-radius: 24px;
              padding: 48px 32px;
              width: 100%;
              max-width: 440px;
              text-align: center;
              box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
              z-index: 10;
              animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .icon-container {
              width: 80px;
              height: 80px;
              border-radius: 50%;
              background: rgba(207, 34, 46, 0.1);
              border: 1px solid rgba(207, 34, 46, 0.2);
              display: flex;
              justify-content: center;
              align-items: center;
              margin: 0 auto 28px;
              box-shadow: 0 0 30px rgba(207, 34, 46, 0.15);
              animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.3s both;
            }

            .error-icon {
              width: 36px;
              height: 36px;
              stroke: var(--danger);
              stroke-width: 3.5;
              stroke-linecap: round;
              stroke-linejoin: round;
              fill: none;
            }

            h1 {
              font-weight: 800;
              font-size: 28px;
              letter-spacing: -0.5px;
              margin-bottom: 12px;
              background: linear-gradient(135deg, #ffffff 0%, #f7a0a0 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
            }

            p {
              font-size: 15px;
              line-height: 1.6;
              color: var(--text-muted);
              margin-bottom: 36px;
              padding: 0 10px;
            }

            .btn {
              display: inline-block;
              width: 100%;
              background: rgba(255, 255, 255, 0.08);
              color: #ffffff;
              text-decoration: none;
              font-weight: 600;
              font-size: 15px;
              padding: 16px 28px;
              border-radius: 14px;
              border: 1px solid var(--border);
              transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
              cursor: pointer;
            }

            .btn:hover {
              background: rgba(255, 255, 255, 0.12);
              transform: translateY(-2px);
            }
          </style>
        </head>
        <body>
          <div class="glow-bg glow-1"></div>
          <div class="glow-bg glow-2"></div>
          <div class="card">
            <div class="icon-container">
              <svg class="error-icon" viewBox="0 0 24 24">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </div>
            <h1>Verification Failed</h1>
            <p>${e.message || 'The verification link is invalid or has expired. Please contact support or sign up again.'}</p>
            <a href="regentmoney://signup" class="btn">Go Back</a>
          </div>
        </body>
        </html>
      `);
    }
  }
}

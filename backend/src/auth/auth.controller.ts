import { Controller, Post, Get, Patch, Body, Query, Res, Req, HttpCode, HttpStatus, UseGuards, BadRequestException } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import * as fs from 'fs';
import * as path from 'path';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

import { TurnstileService } from './turnstile.service';
import { TokenService } from './token.service';
import { JwtService } from '@nestjs/jwt';
import { clientIpOf } from './throttler-behind-proxy.guard';
import { EmailBroadcastService } from '../mail/email-broadcast.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly turnstileService: TurnstileService,
    private readonly tokenService: TokenService,
    private readonly jwtService: JwtService,
    private readonly emailBroadcastService: EmailBroadcastService,
  ) { }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(
    @Req() req: any,
    @Body() body: { name: string; email: string; phone: string; password?: string; turnstileToken?: string },
  ) {
    await this.requireHumanCheck(req, body.turnstileToken);
    return this.withTokenPair(req, await this.authService.signUp(body), true);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Req() req: any,
    @Body() body: { emailOrMobile: string; password?: string; turnstileToken?: string; rememberMe?: boolean },
  ) {
    await this.requireHumanCheck(req, body.turnstileToken);
    return this.withTokenPair(req, await this.authService.login(body, clientIpOf(req)), body?.rememberMe !== false);
  }

  /**
   * Apps that send `X-Supports-Refresh: 1` get a 15-minute access token, a refresh token and a
   * background SMS token. Older app versions keep receiving one 30-day token, so they aren't
   * logged out every 15 minutes.
   */
  private async withTokenPair<T extends { accessToken?: string; profile?: any }>(req: any, result: T, remember: boolean) {
    const supportsRefresh = String(req?.headers?.['x-supports-refresh'] || '') === '1';
    if (!supportsRefresh || !result?.accessToken || !result?.profile?.id) return result;
    const pair = await this.tokenService.issuePair(
      { id: result.profile.id, email: result.profile.email, role: result.profile.role },
      { remember, deviceName: (req?.headers?.['x-device-name'] as string) || null },
    );
    return { ...result, ...pair };
  }

  /** Swap a refresh token for a new pair. No access token needed (it has usually expired). */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body('refreshToken') refreshToken: string) {
    return this.tokenService.refresh(refreshToken);
  }

  /**
   * One-time switch for a signed-in older app: its 30-day token (still checked against the
   * account) is exchanged for a token pair, without asking the user to log in again.
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(JwtAuthGuard)
  @Post('upgrade')
  @HttpCode(HttpStatus.OK)
  async upgrade(@Req() req: any, @Body() body: { rememberMe?: boolean }) {
    if (req.user?.tokenType !== 'legacy') {
      throw new BadRequestException('This session already uses refresh tokens.');
    }
    return this.tokenService.issuePair(
      { id: req.user.id, email: req.user.email, role: req.user.role },
      { remember: body?.rememberMe !== false, deviceName: (req.headers?.['x-device-name'] as string) || null },
    );
  }

  /**
   * Cloudflare Turnstile is required for login and signup on web AND the mobile app
   * (the app renders the widget in a WebView). With no secret configured (local dev)
   * the check is skipped. Set TURNSTILE_REQUIRE_NATIVE=false to temporarily accept
   * app requests without a token, e.g. while older app builds are still in use.
   */
  private async requireHumanCheck(req: any, token?: string) {
    if (!process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY) return;
    if (token) {
      await this.turnstileService.verifyToken(token, req?.ip);
      return;
    }
    const isWeb = Boolean(req.headers?.origin || req.headers?.referer);
    const requireNative = (process.env.TURNSTILE_REQUIRE_NATIVE ?? 'true').toLowerCase() !== 'false';
    if (isWeb || requireNative) {
      throw new BadRequestException('Complete the security check to continue.');
    }
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
    // Reset tokens are plain letters and digits. Anything else is not one of ours and is never
    // written into the page.
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(token)) {
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
          const token = ${JSON.stringify(token).replace(/</g, '\\u003c')};
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
    @Req() req: any,
    @Body('idToken') idToken?: string,
    @Body() body?: { idToken?: string },
  ) {
    const token = idToken || body?.idToken;
    if (!token) {
      throw new BadRequestException('Google ID token is required');
    }
    return this.withTokenPair(req, await this.authService.googleAuthWithToken(token), true);
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

  /**
   * Log out. Works even when the access token has already expired (the app may have been idle):
   * the refresh token in the body identifies the device session to cancel.
   */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: any, @Body() body: { refreshToken?: string }) {
    const [type, token] = (req.headers?.authorization || '').split(' ');
    let payload: any = null;
    if (type === 'Bearer' && token) {
      try {
        payload = await this.jwtService.verifyAsync(token, { ignoreExpiration: true });
      } catch {
        payload = null;
      }
    }

    if (body?.refreshToken || payload?.typ === 'access') {
      // Log out this device only: cancel its refresh tokens and its current access token
      await this.tokenService.logoutDevice({
        refreshToken: body?.refreshToken,
        familyId: payload?.typ === 'access' ? payload.fid : undefined,
        jti: payload?.typ === 'access' ? payload.jti : undefined,
        accessExp: payload?.typ === 'access' ? payload.exp : undefined,
      });
      return { success: true };
    }

    // Older 30-day tokens can't be cancelled one by one: sign out everywhere, as before
    if (payload?.sub && (!payload.exp || payload.exp * 1000 > Date.now())) {
      return this.authService.revokeSessions(payload.sub);
    }
    return { success: true };
  }

  /** Log out on every device: all refresh tokens cancelled, current access tokens refused at once. */
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(@Req() req: any) {
    return this.authService.revokeSessions(req.user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('account/request-deletion')
  @HttpCode(HttpStatus.OK)
  async requestAccountDeletion(
    @Req() req: any,
    @Body() body: { password?: string; reasonCode: string; customFeedback?: string },
  ) {
    if (!body?.reasonCode) {
      throw new BadRequestException('Reason code is required.');
    }
    return this.authService.requestAccountDeletion(req.user.id, body);
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
            <a href="intent://login#Intent;scheme=regentmoney;package=com.regentmoney;end" class="btn" id="openAppBtn" onclick="return launchApp(event)">Open Regent Money App</a>
          </div>
          <script>
            function launchApp(e) {
              if (e && e.preventDefault) e.preventDefault();
              var isAndroid = /Android/i.test(navigator.userAgent);
              var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
              var directUrl = "regentmoney://login";
              var intentUrl = "intent://login#Intent;scheme=regentmoney;package=com.regentmoney;end";

              if (isAndroid) {
                var isChrome = /Chrome|CriOS/i.test(navigator.userAgent) && !/SamsungBrowser|Firefox|EdgA/i.test(navigator.userAgent);
                if (isChrome) {
                  window.location.href = intentUrl;
                } else {
                  window.location.href = directUrl;
                  setTimeout(function() {
                    window.location.href = intentUrl;
                  }, 600);
                }
              } else if (isIOS) {
                window.location.href = directUrl;
              } else {
                window.location.href = directUrl;
              }
              return false;
            }

            window.addEventListener("load", function() {
              setTimeout(function() {
                launchApp();
              }, 400);
            });
          </script>
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
            <a href="intent://signup#Intent;scheme=regentmoney;package=com.regentmoney;end" class="btn" id="goBackBtn">Open Regent Money App</a>
          </div>
        </body>
        </html>
      `);
    }
  }

  /** Regent Money logo shown at the top of every email. Public, cached for a day. */
  @SkipThrottle()
  @Get('email-logo.png')
  emailLogo(@Res() res: Response) {
    const file = [
      path.join(process.cwd(), 'assets', 'email-logo.png'),
      path.join(__dirname, '..', '..', 'assets', 'email-logo.png'),
      path.join(__dirname, '..', '..', '..', 'assets', 'email-logo.png'),
    ].find((f) => fs.existsSync(f));
    if (!file) return res.status(404).end();
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    return res.sendFile(file);
  }

  @Get('unsubscribe')
  async renderUnsubscribeConfirmPage(@Query('token') token: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!token) {
      return res.status(400).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#F3F6F4;">
          <div style="max-width:440px;margin:0 auto;background:#fff;padding:32px;border-radius:16px;border:1px solid #E1E9E4;">
            <h2 style="color:#0F172A;">Invalid Request</h2>
            <p style="color:#64748B;">Missing unsubscribe token.</p>
          </div>
        </body></html>
      `);
    }

    const verified = this.emailBroadcastService.verifyUnsubscribeToken(token);
    if (!verified) {
      return res.status(400).send(`
        <!DOCTYPE html><html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#F3F6F4;">
          <div style="max-width:440px;margin:0 auto;background:#fff;padding:32px;border-radius:16px;border:1px solid #E1E9E4;">
            <h2 style="color:#0F172A;">Link Expired or Invalid</h2>
            <p style="color:#64748B;">This unsubscribe link is not valid or has expired.</p>
          </div>
        </body></html>
      `);
    }

    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unsubscribe - Regent Money</title>
        <style>
          body { margin:0; padding:40px 16px; background-color:#F3F6F4; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; text-align:center; }
          .card { max-width:460px; margin:0 auto; background:#FFFFFF; padding:36px 28px; border-radius:18px; border:1px solid #E1E9E4; box-shadow:0 4px 16px rgba(11,61,44,0.06); }
          .logo { width:40px; height:40px; border-radius:12px; background:#0B3D2C; color:#B8F36B; font-weight:bold; font-size:20px; line-height:40px; margin:0 auto 20px; }
          h2 { color:#0F172A; font-size:22px; margin:0 0 12px; }
          p { color:#475569; font-size:14px; line-height:22px; margin:0 0 24px; }
          .btn { background:#0B3D2C; color:#B8F36B; border:none; padding:14px 28px; border-radius:12px; font-weight:700; font-size:15px; cursor:pointer; width:100%; transition: opacity 0.2s; }
          .btn:hover { opacity:0.9; }
          .notice { font-size:12px; color:#94A3B8; margin-top:20px; line-height:18px; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="logo">RM</div>
          <h2>Unsubscribe from Updates</h2>
          <p>Are you sure you want to stop receiving product announcements, weekly wealth tips, and update emails from Regent Money?</p>
          <form method="POST" action="/auth/unsubscribe">
            <input type="hidden" name="token" value="${token}" />
            <button type="submit" class="btn">Confirm Unsubscribe</button>
          </form>
          <p class="notice">
            Important transactional emails (security alerts, password resets, and policy changes) will still be delivered.
          </p>
        </div>
      </body>
      </html>
    `);
  }

  @Post('unsubscribe')
  async handleUnsubscribeExecution(@Body('token') token: string, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    if (!token) {
      return res.status(400).send('<p>Missing unsubscribe token.</p>');
    }

    const verified = this.emailBroadcastService.verifyUnsubscribeToken(token);
    if (!verified) {
      return res.status(400).send('<p>Invalid or expired unsubscribe token.</p>');
    }

    await this.emailBroadcastService.recordUnsubscribe(verified.emailHmac, 'all');

    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Unsubscribed - Regent Money</title>
        <style>
          body { margin:0; padding:40px 16px; background-color:#F3F6F4; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; text-align:center; }
          .card { max-width:460px; margin:0 auto; background:#FFFFFF; padding:36px 28px; border-radius:18px; border:1px solid #E1E9E4; box-shadow:0 4px 16px rgba(11,61,44,0.06); }
          .badge { width:48px; height:48px; border-radius:50%; background:#E3F2E8; color:#0B6B3A; font-size:24px; line-height:48px; margin:0 auto 16px; }
          h2 { color:#0F172A; font-size:22px; margin:0 0 12px; }
          p { color:#475569; font-size:14px; line-height:22px; margin:0; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">&#10003;</div>
          <h2>You Have Been Unsubscribed</h2>
          <p>Your email has been removed from marketing and announcement lists. You will not receive any further optional emails from us.</p>
        </div>
      </body>
      </html>
    `);
  }
}

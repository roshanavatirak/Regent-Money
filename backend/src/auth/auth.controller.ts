import { Controller, Post, Get, Body, Query, Res, HttpCode, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  async signUp(@Body() body: { name: string; email: string; phone: string; password?: string }) {
    return this.authService.signUp(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { emailOrMobile: string; password?: string }) {
    return this.authService.login(body);
  }

  @Post('google')
  @HttpCode(HttpStatus.OK)
  async googleAuth(@Body() body: { email: string; name: string; avatarUrl?: string }) {
    return this.authService.googleAuth(body);
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

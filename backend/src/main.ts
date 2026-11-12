import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HomeCardsService } from './home-cards/home-cards.service';
import { Logger, ValidationPipe } from '@nestjs/common';
import * as dns from 'dns';
import { timingSafeEqual } from 'crypto';

import { json, urlencoded } from 'express';

// Force Node.js to prioritize IPv4 address resolution (fixes Render IPv6 connection failures)
dns.setDefaultResultOrder('ipv4first');

// Enable BigInt serialization to JSON globally (prevents TypeError: Do not know how to serialize a BigInt on row_version)
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Global validation pipe for strict DTO validation and mass-assignment protection
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Request bodies are read into memory before login is checked, and this server has 512 MB.
  // So JSON is capped at 2 MB, except the two routes that carry photos as text (profile photo,
  // feedback screenshots), which get 12 MB. Statement and screenshot files are uploaded as
  // files and have their own limits in SyncController.
  const smallJson = json({ limit: '2mb' });
  const photoJson = json({ limit: '12mb' });
  const photoRoutes = /^\/(auth\/upload-avatar|feedback)(\/|$)/;
  app.use((req: any, res: any, next: any) => (photoRoutes.test(req.path) ? photoJson : smallJson)(req, res, next));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // Home carousel version on every response (a number read from memory). Phones compare it
  // with the version they hold and download /home-cards/:version only when it went up.
  const homeCards = app.get(HomeCardsService);
  app.use((req: any, res: any, next: any) => {
    const v = homeCards.version;
    if (v > 0) res.setHeader('X-Home-Cards', String(v));
    next();
  });

  // Cloudflare Origin Authentication (Connection ②):
  // Enforces X-Origin-Auth only when CF_ORIGIN_SECRET is configured in environment.
  // Bypass /health so Render internal deployment health checks continue working.
  app.use((req: any, res: any, next: any) => {
    const secret = process.env.CF_ORIGIN_SECRET;
    if (!secret) return next();
    if (req.path === '/health') return next();

    const given = req.headers['x-origin-auth'];
    if (
      typeof given === 'string' &&
      given.length === secret.length &&
      timingSafeEqual(Buffer.from(given), Buffer.from(secret))
    ) {
      return next();
    }

    res.status(403).end();
  });

  // Trust proxy for Render / Cloudflare reverse proxies so req.ip and rate-limiting work accurately
  (app.getHttpAdapter().getInstance() as any)?.set?.('trust proxy', 1);

  // Configure CORS
  const envOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const defaultOrigins = [
    'https://regentmoney.com',
    'https://www.regentmoney.com',
    'https://app.regentmoney.com',
    'https://api.regentmoney.com',
    'https://regent-money.onrender.com',
  ];

  const devOrigins = [
    'http://localhost:8081',
    'http://localhost:3000',
    'http://localhost:19006',
    'http://127.0.0.1:8081',
    'http://127.0.0.1:3000',
  ];

  const allowedOrigins = [
    ...defaultOrigins,
    ...envOrigins,
    ...(process.env.NODE_ENV !== 'production' ? devOrigins : []),
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser requests (native mobile apps, server-to-server) where origin is undefined
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // In development or local network: allow any localhost/127.0.0.1 or LAN IP on any port
      if (
        process.env.NODE_ENV !== 'production' &&
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin)
      ) {
        return callback(null, true);
      }
      // Omits CORS headers so browser blocks the request without throwing 500 error
      callback(null, false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'x-internal-key',
      'x-broadcast-secret',
      'x-origin-auth',
      'Access-Control-Request-Private-Network',
    ],
    exposedHeaders: ['X-Home-Cards'],
    credentials: true,
  });

  // Support Chrome Private Network Access (PNA) preflights between localhost and 127.0.0.1
  app.use((req: any, res: any, next: any) => {
    if (req.headers['access-control-request-private-network']) {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`NestJS server started successfully. Listening on port: ${port}`);
}
bootstrap();

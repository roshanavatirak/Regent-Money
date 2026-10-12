import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as dns from 'dns';
import { timingSafeEqual } from 'crypto';

import { json, urlencoded } from 'express';

// Force Node.js to prioritize IPv4 address resolution (fixes Render IPv6 connection failures)
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Increase payload limits for base64 image uploads to Cloudinary (up to 25MB)
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

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
  if (process.env.NODE_ENV === 'production') {
    await app.listen(port, '0.0.0.0');
  } else {
    await app.listen(port);
  }
  logger.log(`NestJS server started successfully. Listening on port: ${port}`);
}
bootstrap();

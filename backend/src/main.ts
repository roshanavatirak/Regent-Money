import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as dns from 'dns';

import { json, urlencoded } from 'express';

// Force Node.js to prioritize IPv4 address resolution (fixes Render IPv6 connection failures)
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Increase payload limits for base64 image uploads to Cloudinary (up to 25MB)
  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  // Enable CORS for frontend integration (origin: true reflects incoming request origin to satisfy credentials: true)
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Access-Control-Request-Private-Network'],
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

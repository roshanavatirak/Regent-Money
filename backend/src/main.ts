import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import * as dns from 'dns';

// Force Node.js to prioritize IPv4 address resolution (fixes Render IPv6 connection failures)
dns.setDefaultResultOrder('ipv4first');

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend integration
  app.enableCors({
    origin: '*', // Allow all origins in dev mode, can restrict in production
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`NestJS server started successfully. Listening on port: ${port}`);
}
bootstrap();

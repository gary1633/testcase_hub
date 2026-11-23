import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(express.json({ limit: '15mb' }));
  app.use(
    '/api/ci/ingest',
    express.text({ type: ['application/xml', 'text/xml', 'text/plain'], limit: '15mb' }),
  );
  app.setGlobalPrefix('api');

  const httpAdapter = app.getHttpAdapter();
  const expressApp = httpAdapter.getInstance() as {
    disable?: (setting: string) => void;
    set?: (setting: string, value: unknown) => void;
  };
  expressApp.disable?.('x-powered-by');

  const rawTrustProxy = process.env.TRUST_PROXY?.trim().toLowerCase();
  if (rawTrustProxy === 'false' || rawTrustProxy === '0') {
    expressApp.set?.('trust proxy', false);
  } else if (rawTrustProxy) {
    const asNum = Number(rawTrustProxy);
    expressApp.set?.('trust proxy', Number.isFinite(asNum) ? asNum : rawTrustProxy === 'true');
  } else if (process.env.NODE_ENV === 'production') {
    // Behind Nginx reverse proxy container in Docker Compose
    expressApp.set?.('trust proxy', 1);
  }

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    next();
  });

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.enableCors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('TCMS Internal API')
      .setDescription('Internal Qase-like Test Case Management System API')
      .setVersion('1.0.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
  }

  const port = Number(process.env.PORT || 3001);
  await app.listen(port);
  console.log(`TCMS API running on http://localhost:${port}`);
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    console.log(`Swagger docs available at http://localhost:${port}/api/docs`);
  }
}

bootstrap().catch((err) => {
  console.error('Failed to start TCMS API:', err);
  process.exit(1);
});

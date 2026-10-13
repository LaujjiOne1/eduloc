import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { AppConfig } from './core/config/app.config';

async function bootstrap(): Promise<void> {
  // rawBody : nécessaire pour la vérification de signature du webhook LiveKit.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const cfg = app.get(AppConfig);
  const logger = new Logger('Bootstrap');
  const requestLogger = new Logger('HTTP');

  app.use((req, _res, next) => {
    requestLogger.log(`${req.method} ${req.path}`);
    next();
  });
  app.use(helmet());
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));
  // En développement, toute origine locale (Expo web 8081/3000, LAN) est acceptée ; en production, la liste blanche seule.
  const devOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/;
  app.enableCors({
    origin: (origin, callback) =>
      callback(null, !origin || cfg.corsOrigins.includes(origin) || (cfg.nodeEnv !== 'production' && devOrigin.test(origin))),
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle('EduLoc V2 API')
    .setDescription('Marketplace de tutorat géolocalisé — vocal, documents, appels LiveKit.')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document);

  await app.listen(cfg.port);
  logger.log(`EduLoc API prête sur http://localhost:${cfg.port} — Swagger : /docs`);
}

void bootstrap();

import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { json, static as expressStatic } from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false, bodyParser: false });
  const config: ConfigService = app.get(ConfigService);


  app.setGlobalPrefix('api');
  app.use(helmet());
  app.enableCors({
    origin: config.get<string>('CORS_ORIGINS', 'http://localhost:3007').split(',').map((v) => v.trim()),
    credentials: false,
  });
  // Vendor documents are sent as base64 JSON in the demo upload flow.
  // Keep the limit bounded while allowing normal PDF/image documents.
  app.use(json({ limit: '15mb' }));
  app.use('/api/uploads', expressStatic(join(process.cwd(), 'public/uploads')));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const swagger = new DocumentBuilder()
    .setTitle('Voya Vendor API')
    .setDescription('Vendor/supply-side activity catalogue, pricing, availability and booking API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swagger));

  const port = Number(config.get('PORT', 4007));
  await app.listen(port, '0.0.0.0');
}
bootstrap();

import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { ENV, type Env } from './common/config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = app.get<Env>(ENV);

  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Aptiva API')
    .setDescription('Aptiva REST API — /api/v1 (playbook Section 11)')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  if (env.TRUST_PROXY === 'true') {
    const httpAdapter = app.getHttpAdapter().getInstance() as {
      set: (key: string, value: unknown) => void;
    };
    httpAdapter.set('trust proxy', true);
  }

  await app.listen(env.PORT);
}

void bootstrap();

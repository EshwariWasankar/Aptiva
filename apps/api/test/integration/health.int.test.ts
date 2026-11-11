import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

/**
 * E-080 integration tests against real PostgreSQL and Redis.
 * Requires DATABASE_URL and REDIS_URL (docker compose locally, service
 * containers in CI). Run with: pnpm --filter @aptiva/api test:integration
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Start services with ` +
        `\`docker compose -f infra/docker-compose.yml up -d\` and export the URLs.`,
    );
  }
  return value;
}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}

describe('health and readiness (integration)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    requireEnv('DATABASE_URL');
    requireEnv('REDIS_URL');
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.data.status).toBe('ok');
  });

  it('GET /api/v1/ready returns 200 when PostgreSQL and Redis are up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/ready').expect(200);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.checks).toEqual({ postgres: 'up', redis: 'up' });
  });

  it('GET /api/v1/ready returns 503 when Redis is unreachable', async () => {
    const saved = process.env.REDIS_URL;
    // Port 6390 is unused in compose and CI; connection must fail fast.
    process.env.REDIS_URL = 'redis://127.0.0.1:6390';
    let degraded: INestApplication | undefined;
    try {
      degraded = await createApp();
      const res = await request(degraded.getHttpServer()).get('/api/v1/ready').expect(503);
      expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(res.body.error.details.failed).toContain('redis');
    } finally {
      process.env.REDIS_URL = saved;
      await degraded?.close();
    }
  });
});

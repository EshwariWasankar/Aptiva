import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { ENGINE_VERSION } from '@aptiva/engine';
import { HealthDataSchema } from '@aptiva/shared';

/**
 * Unit-level app test: /health must respond without touching PostgreSQL or
 * Redis (both clients connect lazily). Dummy env values are sufficient.
 */
describe('health endpoints (unit)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.DATABASE_URL ??= 'postgresql://u:p@localhost:5432/db';
    process.env.REDIS_URL ??= 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-at-least-16-chars';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns 200 with the ok payload', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.data).toBeDefined();
    expect(HealthDataSchema.parse(res.body.data)).toEqual({ status: 'ok' });
    expect(res.body.meta.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBeTruthy();
  });

  it('workspace smoke: api can import @aptiva/engine and @aptiva/shared', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });
});

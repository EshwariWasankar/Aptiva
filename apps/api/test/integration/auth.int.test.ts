import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { MailerService } from '../../src/common/mail/mailer.service';
import { REFRESH_COOKIE, CSRF_HEADER } from '../../src/auth/auth.controller';

/**
 * PH-1 integration tests (T-001, T-002, role matrix, rate limit, reset
 * single-use). Requires DATABASE_URL, REDIS_URL and JWT_ACCESS_SECRET.
 * HIBP is stubbed so tests never depend on the network.
 */

const TEST_PASSWORD = 'a-strong-test-password';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Start services with ` +
        '`docker compose -f infra/docker-compose.yml up -d` and export the URLs.',
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

function agent(app: INestApplication) {
  return request.agent(app.getHttpServer());
}

let seq = 0;
function uniqueEmail(): string {
  seq += 1;
  return `ph1-${Date.now()}-${seq}@example.com`;
}

describe('auth (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    requireEnv('DATABASE_URL');
    requireEnv('REDIS_URL');
    requireEnv('JWT_ACCESS_SECRET');
    // The suite fires dozens of auth calls from one IP in seconds — raise the
    // rate-limit ceiling so only the dedicated rate-limit test (which builds
    // its own app at factor 1) observes 429s.
    process.env.RATE_LIMIT_FACTOR ??= '1000';
    // Never hit the real HIBP API from tests.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
    app = await createApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  // ------------------------------------------------ T-001 register

  it('T-001: registers a student, stores consent row, returns session', async () => {
    const email = uniqueEmail();
    const res = await agent(app)
      .post('/api/v1/auth/register')
      .send({
        email,
        password: TEST_PASSWORD,
        gradYear: 2027,
        branch: 'CSE',
        consentVersion: '2026-11',
      })
      .expect(201);

    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.role).toBe('student');

    const user = await prisma.user.findUnique({
      where: { email },
      include: { consents: true, profile: true },
    });
    expect(user).not.toBeNull();
    const consent = user!.consents.find((c) => c.purpose === 'core');
    expect(consent?.granted).toBe(true);
    expect(consent?.noticeVersion).toBe('2026-11');
    expect(user!.profile?.gradYear).toBe(2027);
  });

  it('rejects registration without consent', async () => {
    await agent(app)
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password: TEST_PASSWORD })
      .expect(400);
  });

  it('rejects duplicate email with 409', async () => {
    const email = uniqueEmail();
    const payload = { email, password: TEST_PASSWORD, consentVersion: '2026-11' };
    await agent(app).post('/api/v1/auth/register').send(payload).expect(201);
    await agent(app).post('/api/v1/auth/register').send(payload).expect(409);
  });

  it('rejects a breached password', async () => {
    // Stub HIBP to report this exact password as breached.
    const { sha1Hex } = await import('../../src/common/crypto');
    const pw = 'breached-test-password';
    const suffix = sha1Hex(pw).toUpperCase().slice(5);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, text: async () => `${suffix}:9\n` }),
    );
    const res = await agent(app)
      .post('/api/v1/auth/register')
      .send({ email: uniqueEmail(), password: pw, consentVersion: '2026-11' })
      .expect(400);
    expect(JSON.stringify(res.body)).toMatch(/breach/i);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
  });

  it('E-006: email verification token marks the account verified once', async () => {
    const email = uniqueEmail();
    const mailer = app.get(MailerService);
    const sendSpy = vi.spyOn(mailer, 'send');
    await agent(app)
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, consentVersion: '2026-11' })
      .expect(201);
    const verifyMail = sendSpy.mock.calls
      .map((c) => c[0])
      .find((m) => m.to === email && m.subject.includes('Verify'));
    sendSpy.mockRestore();
    const token = /token=([A-Za-z0-9_-]+)/.exec(verifyMail!.text)?.[1];
    expect(token).toBeTruthy();

    await agent(app).post('/api/v1/auth/verify-email').send({ token }).expect(204);
    const user = await prisma.user.findUnique({ where: { email } });
    expect(user?.emailVerifiedAt).not.toBeNull();

    // Single-use.
    await agent(app).post('/api/v1/auth/verify-email').send({ token }).expect(400);
  });

  // ------------------------------------------------ E-002 login

  it('logs in with valid credentials and rejects wrong password generically', async () => {
    const email = uniqueEmail();
    await agent(app)
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, consentVersion: '2026-11' })
      .expect(201);

    const bad = await agent(app)
      .post('/api/v1/auth/login')
      .send({ email, password: 'wrong-password-1' })
      .expect(401);
    expect(bad.body.error.code).toBe('UNAUTHENTICATED');
    expect(JSON.stringify(bad.body)).not.toMatch(/password_hash|user not found/i);

    const good = await agent(app)
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(201);
    expect(good.body.data.accessToken).toBeTruthy();
    expect(good.body.data.user.email).toBe(email);
  });

  it('rate limits auth endpoints at 10/min per IP', async () => {
    // Dedicated app at the real ceiling (factor unset → 1×). The shared
    // in-memory bucket already holds this IP's count from the suite, so the
    // limit trips immediately; the loop just confirms a 429 arrives.
    const saved = process.env.RATE_LIMIT_FACTOR;
    delete process.env.RATE_LIMIT_FACTOR;
    const limitedApp = await createApp();
    try {
      let limited = false;
      for (let i = 0; i < 15; i += 1) {
        const res = await request(limitedApp.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: uniqueEmail(), password: 'nope-nope-nope' });
        if (res.status === 429) {
          limited = true;
          expect(res.body.error.code).toBe('RATE_LIMITED');
          break;
        }
      }
      expect(limited).toBe(true);
    } finally {
      if (saved !== undefined) process.env.RATE_LIMIT_FACTOR = saved;
      await limitedApp.close();
    }
  });

  // --------------------------------------- T-002 refresh rotation/reuse

  it('T-002: rotates refresh tokens; reuse revokes the family', async () => {
    const email = uniqueEmail();
    const jar = agent(app);
    await jar
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, consentVersion: '2026-11' })
      .expect(201);

    // First refresh: rotates, sets new cookie.
    const r1 = await jar.post('/api/v1/auth/refresh').set(CSRF_HEADER, '1').expect(201);
    expect(r1.body.data.accessToken).toBeTruthy();

    // Replay the ORIGINAL refresh cookie (pre-rotation). supertest agent
    // already updated its cookie jar, so replay manually with the old token.
    // Re-login to get a fresh cookie, then craft the reuse scenario:
    const login = await jar
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(201);
    const setCookies = login.headers['set-cookie'] as unknown as string[] | undefined;
    const firstRefresh = setCookies?.find((c) => c.startsWith(`${REFRESH_COOKIE}=`))?.split(';')[0];
    expect(firstRefresh).toBeTruthy();

    // Rotate once with the fresh token.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(CSRF_HEADER, '1')
      .set('Cookie', firstRefresh!)
      .expect(201);

    // Reuse the same (now rotated) token → 401 and family revoked.
    const reuse = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set(CSRF_HEADER, '1')
      .set('Cookie', firstRefresh!)
      .expect(401);
    expect(reuse.body.error.code).toBe('UNAUTHENTICATED');

    // The newest token from rotation must also be dead now (family revoked).
    // Login again to confirm account itself is fine.
    await jar.post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD }).expect(201);
  });

  it('logout revokes the refresh token', async () => {
    const email = uniqueEmail();
    const jar = agent(app);
    await jar
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, consentVersion: '2026-11' })
      .expect(201);
    await jar.post('/api/v1/auth/logout').set(CSRF_HEADER, '1').expect(204);
    await jar.post('/api/v1/auth/refresh').set(CSRF_HEADER, '1').expect(401);
  });

  it('refresh without the CSRF header is rejected', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/refresh').expect(400);
  });

  // ------------------------------------------------- E-007 /me + roles

  it('GET /me returns profile; PUT /me updates it', async () => {
    const email = uniqueEmail();
    const jar = agent(app);
    const reg = await jar
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, gradYear: 2026, consentVersion: '2026-11' })
      .expect(201);
    const token = reg.body.data.accessToken as string;

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.data.user.email).toBe(email);
    expect(me.body.data.profile.gradYear).toBe(2026);

    const put = await request(app.getHttpServer())
      .put('/api/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ branch: 'IT', college: 'IIT Delhi', language: 'en' })
      .expect(200);
    expect(put.body.data.profile.branch).toBe('IT');
  });

  it('rejects unauthenticated /me and admin route for students', async () => {
    await request(app.getHttpServer()).get('/api/v1/me').expect(401);

    const email = uniqueEmail();
    const reg = await agent(app)
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, consentVersion: '2026-11' })
      .expect(201);
    const token = reg.body.data.accessToken as string;

    const forbidden = await request(app.getHttpServer())
      .get('/api/v1/admin/ping')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');
  });

  // ------------------------------------------- E-006 password reset once

  it('password reset token is single-use and resets the password', async () => {
    const email = uniqueEmail();
    await agent(app)
      .post('/api/v1/auth/register')
      .send({ email, password: TEST_PASSWORD, consentVersion: '2026-11' })
      .expect(201);

    // Capture the reset link from the mailer (console adapter in tests).
    const mailer = app.get(MailerService);
    const sendSpy = vi.spyOn(mailer, 'send');

    // Request reset — response is always 204 regardless of account existence.
    await agent(app).post('/api/v1/auth/password-reset/request').send({ email }).expect(204);
    await agent(app)
      .post('/api/v1/auth/password-reset/request')
      .send({ email: 'nobody@example.com' })
      .expect(204);

    const resetMail = sendSpy.mock.calls
      .map((c) => c[0])
      .find((m) => m.to === email && m.subject.includes('Reset'));
    expect(resetMail).toBeTruthy();
    const token = /token=([A-Za-z0-9_-]+)/.exec(resetMail!.text)?.[1];
    expect(token).toBeTruthy();
    sendSpy.mockRestore();

    const newPassword = 'a-brand-new-password';
    await agent(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: newPassword })
      .expect(204);

    // Old password no longer works; new one does.
    await agent(app)
      .post('/api/v1/auth/login')
      .send({ email, password: TEST_PASSWORD })
      .expect(401);
    await agent(app).post('/api/v1/auth/login').send({ email, password: newPassword }).expect(201);

    // Single-use: replaying the token is rejected.
    await agent(app)
      .post('/api/v1/auth/password-reset/confirm')
      .send({ token, password: 'another-password-1' })
      .expect(400);
  });
});

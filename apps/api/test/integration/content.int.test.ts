import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import argon2 from 'argon2';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';

/**
 * PH-2 integration tests: E-055/E-056 public blueprint endpoints,
 * E-060/E-061 question CRUD + review, E-064 blueprint versioning,
 * E-065 lessons, T-018 publish rules / DB constraints, T-020 XSS
 * sanitisation, and the admin/reviewer/student role matrix.
 * Requires DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET (same as auth.int).
 */

const PASSWORD = 'a-strong-test-password';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  await app.init();
  return app;
}

let seq = 0;
const uniq = (p: string) => `${p}-${Date.now()}-${++seq}`;

async function login(app: INestApplication, email: string): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD })
    .expect(201);
  return res.body.data.accessToken as string;
}

describe('content (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let reviewerToken: string;
  let studentToken: string;
  let topicId: string;
  let topicSlug: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    requireEnv('DATABASE_URL');
    requireEnv('REDIS_URL');
    requireEnv('JWT_ACCESS_SECRET');
    process.env.RATE_LIMIT_FACTOR ??= '1000';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '' }));
    app = await createApp();
    prisma = app.get(PrismaService);

    // Fixture taxonomy row (tests must not depend on pnpm db:seed).
    topicSlug = uniq('topic');
    const topic = await prisma.topic.create({
      data: { slug: topicSlug, name: `Test Topic ${seq}`, level: 'topic' },
    });
    topicId = topic.id;

    const hash = await argon2.hash(PASSWORD);
    const mk = (role: string) =>
      prisma.user.create({
        data: {
          email: `${uniq(role)}@example.com`,
          passwordHash: hash,
          role,
          emailVerifiedAt: new Date(),
        },
      });
    const [admin, reviewer, student] = await Promise.all([
      mk('admin'),
      mk('reviewer'),
      mk('student'),
    ]);
    adminToken = await login(app, admin.email);
    reviewerToken = await login(app, reviewer.email);
    studentToken = await login(app, student.email);
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  const mcqPayload = (over: Record<string, unknown> = {}) => ({
    topicId,
    format: 'mcq',
    stem: `What is ${uniq('q')} + ${seq}?`,
    difficultyPrior: 1,
    expectedTimeMs: 60_000,
    pool: 'practice',
    options: [
      { text: '1', isCorrect: false },
      { text: '2', isCorrect: true },
      { text: '3', isCorrect: false },
      { text: '4', isCorrect: false },
    ],
    ...over,
  });

  // ------------------------------------------------------- E-060 questions

  it('E-060: admin creates, lists and reads an MCQ', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set(auth(adminToken))
      .send(mcqPayload())
      .expect(201);
    expect(created.body.data.id).toBeTruthy();
    expect(created.body.data.options).toHaveLength(4);
    expect(created.body.data.status).toBe('draft');

    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/questions?topicId=${topicId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(list.body.data.items.length).toBeGreaterThan(0);

    const got = await request(app.getHttpServer())
      .get(`/api/v1/admin/questions/${created.body.data.id}`)
      .set(auth(adminToken))
      .expect(200);
    expect(got.body.data.stem).toContain('+');
  });

  it('E-060: rejects two correct options and bad payloads with 422', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set(auth(adminToken))
      .send(
        mcqPayload({
          stem: 'two correct',
          options: [
            { text: 'a', isCorrect: true },
            { text: 'b', isCorrect: true },
          ],
        }),
      )
      .expect(422);

    await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set(auth(adminToken))
      .send(mcqPayload({ stem: '' }))
      .expect(400);
  });

  it('T-018: publish rules — source required, one correct, numeric answer', async () => {
    // MCQ without source → 422 PUBLISH_RULES.
    const noSource = await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set(auth(adminToken))
      .send(mcqPayload({ status: 'published', stem: 'publish no source' }))
      .expect(422);
    expect(noSource.body.error.code).toBe('PUBLISH_RULES');

    // Numerical without numeric_answer → 422.
    await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set(auth(adminToken))
      .send({
        topicId,
        format: 'numerical',
        stem: 'numerical no answer',
        difficultyPrior: 2,
        expectedTimeMs: 60_000,
        sourceName: 'seed',
        status: 'published',
      })
      .expect(422);

    // DB-level backstops (constraints live in SQL, not Prisma).
    await expect(
      prisma.question.create({
        data: {
          topicId,
          format: 'mcq',
          stem: `db-constraint-${uniq('x')}`,
          difficultyPrior: 1,
          expectedTimeMs: 60_000,
          stemHash: uniq('hash'),
          status: 'published', // published_needs_source
        },
      }),
    ).rejects.toThrow();

    // numerical_needs_answer backstop.
    await expect(
      prisma.question.create({
        data: {
          topicId,
          format: 'numerical',
          stem: `num-nokey-${uniq('x')}`,
          difficultyPrior: 1,
          expectedTimeMs: 60_000,
          stemHash: uniq('hash'),
        },
      }),
    ).rejects.toThrow();

    // uq_one_correct backstop: two correct options on one question.
    const q = await prisma.question.create({
      data: {
        topicId,
        format: 'mcq',
        stem: `mcq-${uniq('x')}`,
        difficultyPrior: 1,
        expectedTimeMs: 60_000,
        stemHash: uniq('hash'),
      },
    });
    await expect(
      prisma.questionOption.createMany({
        data: [
          { questionId: q.id, text: 'a', isCorrect: true, orderNo: 0 },
          { questionId: q.id, text: 'b', isCorrect: true, orderNo: 1 },
        ],
      }),
    ).rejects.toThrow(); // uq_one_correct
  });

  it('T-020: script payloads are sanitised before storage', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set(auth(adminToken))
      .send(
        mcqPayload({
          stem: `<p>Safe stem ${uniq('x')}</p><script>alert('xss')</script><img src=x onerror=alert(1)>`,
        }),
      )
      .expect(201);
    expect(res.body.data.stem).not.toContain('<script');
    expect(res.body.data.stem).not.toContain('onerror');
    expect(res.body.data.stem).toContain('Safe stem');
  });

  it('duplicate stem (same normalised hash) → 409', async () => {
    const stem = `dup stem ${uniq('s')}`;
    await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set(auth(adminToken))
      .send(mcqPayload({ stem }))
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set(auth(adminToken))
      .send(mcqPayload({ stem: `<b>${stem}</b>` }))
      .expect(409);
  });

  // -------------------------------------------------------- E-061 review

  it('E-061: reviewer approves once (409 on repeat), draft → reviewed', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/questions')
      .set(auth(adminToken))
      .send(mcqPayload({ stem: `review me ${uniq('r')}` }))
      .expect(201);
    const id = created.body.data.id as string;

    const first = await request(app.getHttpServer())
      .post(`/api/v1/admin/questions/${id}/review`)
      .set(auth(reviewerToken))
      .send({ decision: 'approve', notes: 'looks fine' })
      .expect(200);
    expect(first.body.data.status).toBe('reviewed');
    expect(first.body.data.reviews).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/api/v1/admin/questions/${id}/review`)
      .set(auth(reviewerToken))
      .send({ decision: 'reject' })
      .expect(409);

    // Student cannot review.
    await request(app.getHttpServer())
      .post(`/api/v1/admin/questions/${id}/review`)
      .set(auth(studentToken))
      .send({ decision: 'approve' })
      .expect(403);
  });

  it('role matrix: student gets 403 on admin question routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/questions')
      .set(auth(studentToken))
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/questions')
      .set(auth(reviewerToken))
      .expect(200);
  });

  // ------------------------------------------------- E-064 blueprints

  it('E-064 + E-055/56: create blueprint, version it, read publicly', async () => {
    const slug = uniq('bp');
    const body = {
      slug,
      company: 'TestCo',
      name: 'TestCo Assessment',
      sources: [
        { sourceType: 'official', reference: 'handbook v1', confidence: 'high' },
        { sourceType: 'assumption', reference: 'weights guessed', confidence: 'low' },
      ],
      sections: [
        {
          name: 'Quant',
          orderNo: 1,
          durationMin: 20,
          questionCountMin: 10,
          questionCountMax: 14,
          negativeMarking: 0.25,
          sourceIndex: 0,
          weights: [{ topicSlug, share: 1, difficultyBand: 2, sourceIndex: 1 }],
        },
      ],
    };
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/blueprints')
      .set(auth(adminToken))
      .send(body)
      .expect(201);
    expect(created.body.data.slug).toBe(slug);
    expect(created.body.data.versions[0].isCurrent).toBe(true);

    // Shares must sum to ~1 → validation rejects bad payloads.
    await request(app.getHttpServer())
      .post('/api/v1/admin/blueprints')
      .set(auth(adminToken))
      .send({
        ...body,
        slug: `${slug}-bad`,
        sections: [{ ...body.sections[0], weights: [{ topicSlug, share: 0.5 }] }],
      })
      .expect(422);

    // PUT creates version 2 and flips is_current.
    const v2 = await request(app.getHttpServer())
      .put(`/api/v1/admin/blueprints/${created.body.data.id}`)
      .set(auth(adminToken))
      .send({
        ...body,
        slug: undefined,
        company: undefined,
        name: undefined,
        sections: [
          {
            ...body.sections[0],
            durationMin: 25,
            weights: [{ topicSlug, share: 1, sourceIndex: 1 }],
          },
        ],
      })
      .expect(200);
    const versions = v2.body.data.versions as { version: number; isCurrent: boolean }[];
    expect(versions.find((v) => v.version === 2)?.isCurrent).toBe(true);
    expect(versions.find((v) => v.version === 1)?.isCurrent).toBe(false);

    // Public endpoints.
    const list = await request(app.getHttpServer()).get('/api/v1/assessments').expect(200);
    expect(list.body.data.some((a: { slug: string }) => a.slug === slug)).toBe(true);

    const pub = await request(app.getHttpServer())
      .get(`/api/v1/assessments/${slug}/blueprint`)
      .expect(200);
    const section = pub.body.data.version.sections[0];
    expect(section.source.sourceType).toBe('official');
    expect(section.weights[0].source.sourceType).toBe('assumption');
    expect(section.weights[0].topic.slug).toBe(topicSlug);

    await request(app.getHttpServer())
      .get('/api/v1/assessments/does-not-exist/blueprint')
      .expect(404);
  });

  // ---------------------------------------------------------- E-065

  it('E-065: lesson create and update', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/lessons')
      .set(auth(adminToken))
      .send({ topicId, title: 'Fixture lesson', content: '<p>Content</p>', status: 'draft' })
      .expect(201);
    expect(created.body.data.id).toBeTruthy();

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/admin/lessons/${created.body.data.id}`)
      .set(auth(adminToken))
      .send({ status: 'published', title: 'Fixture lesson v2' })
      .expect(200);
    expect(updated.body.data.status).toBe('published');
    expect(updated.body.data.title).toBe('Fixture lesson v2');
  });
});

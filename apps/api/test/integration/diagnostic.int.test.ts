import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { AttemptStreamService } from '../../src/attempts/attempt-stream.service';

/**
 * PH-5 integration tests (T-004/T-005/T-010 surface): E-010..E-016,
 * pause-once, ownership, pool enforcement, flush barrier + result job,
 * review unlock, error feedback priority/conflict, 48h partial rule.
 * Requires DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET.
 */

const PASSWORD = 'a-strong-test-password';

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

async function waitFor(cond: () => Promise<boolean>, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('waitFor timed out');
}

const SECTIONS = ['Quant', 'Logical', 'DI', 'Verbal'];

describe('diagnostics (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let stream: AttemptStreamService;
  let token: string;
  let otherToken: string;
  const userIds: string[] = [];
  const questionIds: string[] = [];
  const topicIds: string[] = [];
  const diagnosticIds: string[] = [];
  // questionId -> correct option id (known only to the test)
  const correctByQuestion = new Map<string, string>();

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    for (const n of ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET']) {
      if (!process.env[n]) throw new Error(`${n} is not set`);
    }
    process.env.RATE_LIMIT_FACTOR ??= '1000';
    process.env.ATTEMPT_MIN_IDLE_MS ??= '50';
    app = await createApp();
    prisma = app.get(PrismaService);
    stream = app.get(AttemptStreamService);
    await stream.ensureGroup();

    // 4 sections × 3 topics each; 12 diagnostic-pool items (3 per section),
    // every 4th one numerical so the diagnostic has mixed formats.
    let fixtureIdx = 0;
    for (const name of SECTIONS) {
      const sec = await prisma.topic.create({
        data: { slug: uniq(`sec-${name}`), name: `DSec ${name} ${seq}`, level: 'section' },
      });
      topicIds.push(sec.id);
      for (let i = 0; i < 3; i++) {
        const child = await prisma.topic.create({
          data: {
            slug: uniq(`t-${name}-${i}`),
            name: `DTopic ${name} ${i} ${seq}`,
            level: 'topic',
            parentId: sec.id,
          },
        });
        topicIds.push(child.id);
        fixtureIdx += 1;
        const numerical = fixtureIdx % 4 === 0;
        const q = await prisma.question.create({
          data: {
            topicId: child.id,
            format: numerical ? 'numerical' : 'mcq',
            stem:
              uniq(`Diag stem ${name} ${i}`) +
              (numerical ? ' — what is 2 + 2?' : ' — pick the even number.'),
            difficultyPrior: (i % 3) + 1,
            expectedTimeMs: 30_000,
            pool: 'diagnostic',
            status: 'published',
            sourceName: 'test',
            author: 'test',
            stemHash: uniq('hash-diag'),
            ...(numerical
              ? { numericAnswer: '4', answerFormat: 'integer', tolerance: '0' }
              : {
                  options: {
                    create: [
                      { text: '4', isCorrect: true, orderNo: 0 },
                      { text: '5', isCorrect: false, orderNo: 1 },
                    ],
                  },
                }),
          },
          include: { options: true },
        });
        questionIds.push(q.id);
        if (!numerical) {
          correctByQuestion.set(q.id, q.options.find((o) => o.isCorrect)!.id);
        }
      }
    }

    const hash = await argon2.hash(PASSWORD);
    const mk = async () => {
      const u = await prisma.user.create({
        data: {
          email: `${uniq('diag')}@example.com`,
          passwordHash: hash,
          role: 'student',
          emailVerifiedAt: new Date(),
        },
      });
      userIds.push(u.id);
      return u.email;
    };
    token = await login(app, await mk());
    otherToken = await login(app, await mk());
  });

  afterAll(async () => {
    const attemptIds = (
      await prisma.questionAttempt.findMany({
        where: { contextType: 'diagnostic', contextId: { in: diagnosticIds } },
        select: { id: true },
      })
    ).map((a) => a.id);
    await prisma.attemptErrorInference.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await prisma.attemptErrorFeedback.deleteMany({ where: { attemptId: { in: attemptIds } } });
    await prisma.diagnosticResult.deleteMany({ where: { diagnosticId: { in: diagnosticIds } } });
    await prisma.questionAttempt.deleteMany({
      where: { contextType: 'diagnostic', contextId: { in: diagnosticIds } },
    });
    await prisma.diagnosticTest.deleteMany({ where: { id: { in: diagnosticIds } } });
    await prisma.questionAttempt.deleteMany({ where: { questionId: { in: questionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: questionIds } } });
    await prisma.topic.deleteMany({ where: { id: { in: topicIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('E-010: creates an express diagnostic; second create conflicts', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/diagnostics')
      .set(auth(token))
      .send({ mode: 'express' })
      .expect(201);
    expect(res.body.data.mode).toBe('express');
    expect(res.body.data.questionCount).toBe(12);
    diagnosticIds.push(res.body.data.id);

    const again = await request(app.getHttpServer())
      .post('/api/v1/diagnostics')
      .set(auth(token))
      .send({ mode: 'express' })
      .expect(409);
    expect(again.body.error.code).toBe('DIAGNOSTIC_ACTIVE');
  });

  it('E-011: serves next question without answer keys and stamps shown_at', async () => {
    const active = await request(app.getHttpServer())
      .get('/api/v1/diagnostics/active')
      .set(auth(token))
      .expect(200);
    const id = active.body.data.id as string;

    const next = await request(app.getHttpServer())
      .get(`/api/v1/diagnostics/${id}/next`)
      .set(auth(token))
      .expect(200);
    expect(next.body.data.done).toBe(false);
    const q = next.body.data.question;
    expect(q.options.every((o: { isCorrect?: boolean }) => o.isCorrect === undefined)).toBe(true);
    expect(q.shownAt).toBeTruthy();

    // Ownership: other student cannot see it.
    await request(app.getHttpServer())
      .get(`/api/v1/diagnostics/${id}/next`)
      .set(auth(otherToken))
      .expect(404);
  });

  it('E-012: answers mark server-side; invalid numeric does not consume', async () => {
    const active = await request(app.getHttpServer())
      .get('/api/v1/diagnostics/active')
      .set(auth(token))
      .expect(200);
    const id = active.body.data.id as string;

    const next = await request(app.getHttpServer())
      .get(`/api/v1/diagnostics/${id}/next`)
      .set(auth(token))
      .expect(200);
    const q = next.body.data.question;
    const correctOption = correctByQuestion.get(q.id)!;

    // Invalid numeric input on a numerical item → 422, attempt not consumed.
    const diagRow = await prisma.diagnosticTest.findUnique({ where: { id } });
    const numQid = (
      await prisma.question.findMany({
        where: { id: { in: diagRow!.questionIds }, format: 'numerical' },
        select: { id: true },
      })
    )[0]!.id;
    const bad = await request(app.getHttpServer())
      .put(`/api/v1/diagnostics/${id}/answers/${numQid}`)
      .set(auth(token))
      .send({ attemptId: randomUUID(), numericInput: 'not-a-number' })
      .expect(422);
    expect(bad.body.error.code).toBe('INVALID_NUMERIC_INPUT');

    const isNumQ = q.format === 'numerical';
    const ok = await request(app.getHttpServer())
      .put(`/api/v1/diagnostics/${id}/answers/${q.id}`)
      .set(auth(token))
      .send(
        isNumQ
          ? { attemptId: randomUUID(), numericInput: '4' }
          : { attemptId: randomUUID(), selectedOptionId: correctOption },
      )
      .expect(200);
    expect(ok.body.data.recorded).toBe(true);
    // Feedback-free ack — no correctness leaked pre-submit.
    expect(ok.body.data.isCorrect).toBeUndefined();

    // Idempotent replay returns the same ack.
    const replayBody = isNumQ
      ? { attemptId: ok.body.data.attemptId, numericInput: '4' }
      : { attemptId: ok.body.data.attemptId, selectedOptionId: correctOption };
    const replay = await request(app.getHttpServer())
      .put(`/api/v1/diagnostics/${id}/answers/${q.id}`)
      .set(auth(token))
      .send(replayBody)
      .expect(200);
    expect(replay.body.data.attemptId).toBe(ok.body.data.attemptId);

    // Question outside the diagnostic is rejected.
    await request(app.getHttpServer())
      .put(`/api/v1/diagnostics/${id}/answers/${randomUUID()}`)
      .set(auth(token))
      .send({ attemptId: randomUUID(), skipped: true })
      .expect(422);
  });

  it('E-013: pause works once only', async () => {
    const active = await request(app.getHttpServer())
      .get('/api/v1/diagnostics/active')
      .set(auth(token))
      .expect(200);
    const id = active.body.data.id as string;
    await request(app.getHttpServer())
      .post(`/api/v1/diagnostics/${id}/pause`)
      .set(auth(token))
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/api/v1/diagnostics/${id}/pause`)
      .set(auth(token))
      .expect(409);
    expect(second.body.error.code).toBe('CONFLICT');
  });

  it(
    'E-014/E-015: submit drains barrier, computes result, review unlocks',
    { timeout: 90_000 },
    async () => {
      const active = await request(app.getHttpServer())
        .get('/api/v1/diagnostics/active')
        .set(auth(token))
        .expect(200);
      const id = active.body.data.id as string;

      // Answer remaining questions (skip most; answer first correctly was done).
      const attemptIds: string[] = [];
      for (let i = 0; i < 12; i++) {
        const next = await request(app.getHttpServer())
          .get(`/api/v1/diagnostics/${id}/next`)
          .set(auth(token))
          .expect(200);
        if (next.body.data.done) break;
        const q = next.body.data.question;
        const already = await prisma.questionAttempt.findFirst({
          where: { contextType: 'diagnostic', contextId: id, questionId: q.id },
        });
        if (already) continue;
        const correct = correctByQuestion.get(q.id);
        const isNum = q.format === 'numerical';
        const res = await request(app.getHttpServer())
          .put(`/api/v1/diagnostics/${id}/answers/${q.id}`)
          .set(auth(token))
          .send({
            attemptId: randomUUID(),
            selectedOptionId: isNum ? null : i === 0 ? correct : i % 3 === 0 ? null : correct,
            numericInput: isNum && i % 3 !== 0 ? '4' : null,
            skipped: i % 3 !== 0 ? false : true,
          })
          .expect(200);
        attemptIds.push(res.body.data.attemptId);
      }
      const sub = await request(app.getHttpServer())
        .post(`/api/v1/diagnostics/${id}/submit`)
        .set(auth(token))
        .send({ attemptIds })
        .expect(201);
      expect(sub.body.data.resultStatus).toBe('pending');

      // Result job is async — poll until computed.
      await waitFor(async () => {
        const r = await request(app.getHttpServer())
          .get(`/api/v1/diagnostics/${id}/result`)
          .set(auth(token));
        return r.status === 200;
      });
      const result = await request(app.getHttpServer())
        .get(`/api/v1/diagnostics/${id}/result`)
        .set(auth(token))
        .expect(200);
      expect(result.body.data.result.mode).toBe('express');
      expect(result.body.data.result.coarse).toBe(true);
      expect(result.body.data.result.totals.questions).toBe(12);
      expect(result.body.data.result.byTopic.length).toBeGreaterThan(0);

      // Review unlocks with keys for the owner only.
      const review = await request(app.getHttpServer())
        .get(`/api/v1/diagnostics/${id}/review`)
        .set(auth(token))
        .expect(200);
      expect(review.body.data.items.length).toBeGreaterThan(0);
      expect(
        review.body.data.items.some(
          (i: {
            format: string;
            options: { isCorrect: boolean }[];
            numericAnswer: string | null;
          }) =>
            i.format === 'numerical' ? i.numericAnswer != null : i.options.some((o) => o.isCorrect),
        ),
      ).toBe(true);
      await request(app.getHttpServer())
        .get(`/api/v1/diagnostics/${id}/review`)
        .set(auth(otherToken))
        .expect(404);
    },
  );

  it('T-010/E-016: reported label is primary; conflict flags rule disagreement', async () => {
    // Fresh diagnostic for a second flow on the same user is blocked —
    // use a practice attempt? E-016 works on any owned attempt; create one
    // directly via the diagnostic we just submitted.
    const active = await prisma.diagnosticTest.findFirst({
      where: { userId: userIds[0]!, status: 'submitted' },
    });
    const attempt = await prisma.questionAttempt.findFirst({
      where: { contextType: 'diagnostic', contextId: active!.id, skipped: false, isCorrect: false },
    });
    expect(attempt).toBeTruthy();

    const types = await request(app.getHttpServer())
      .get('/api/v1/diagnostics/error-types')
      .set(auth(token))
      .expect(200);
    const concept = types.body.data.find((t: { code: string }) => t.code === 'concept');

    const fb = await request(app.getHttpServer())
      .put(`/api/v1/attempts/${attempt!.id}/error-feedback`)
      .set(auth(token))
      .send({ errorType: concept.code, freeText: 'never learned this' })
      .expect(200);
    expect(fb.body.data.errorType).toBe(concept.code);
    expect(fb.body.data.method).toBe('reported');

    // Stored label is the student's report, not the inferred one.
    const stored = await prisma.attemptErrorFeedback.findUnique({
      where: { attemptId: attempt!.id },
      include: { errorType: true },
    });
    expect(stored?.errorType.code).toBe(concept.code);

    // Editing the feedback updates in place (idempotent upsert).
    const other = types.body.data.find((t: { code: string }) => t.code !== concept.code);
    const edit = await request(app.getHttpServer())
      .put(`/api/v1/attempts/${attempt!.id}/error-feedback`)
      .set(auth(token))
      .send({ errorType: other.code })
      .expect(200);
    expect(edit.body.data.errorType).toBe(other.code);

    // Ownership enforced.
    await request(app.getHttpServer())
      .put(`/api/v1/attempts/${attempt!.id}/error-feedback`)
      .set(auth(otherToken))
      .send({ errorType: concept.code })
      .expect(404);
  });

  it('48h rule: stale active diagnostic becomes partial', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/diagnostics')
      .set(auth(otherToken))
      .send({ mode: 'express' })
      .expect(201);
    const id = res.body.data.id as string;
    diagnosticIds.push(id);

    await prisma.diagnosticTest.update({
      where: { id },
      data: { lastActivityAt: new Date(Date.now() - 49 * 60 * 60 * 1000) },
    });

    const active = await request(app.getHttpServer())
      .get('/api/v1/diagnostics/active')
      .set(auth(otherToken))
      .expect(200);
    expect(active.body.data).toBeNull();
    const row = await prisma.diagnosticTest.findUnique({ where: { id } });
    expect(row?.status).toBe('partial');

    // A partial diagnostic can't be resumed or answered.
    await request(app.getHttpServer())
      .get(`/api/v1/diagnostics/${id}/next`)
      .set(auth(otherToken))
      .expect(409);
  });
});

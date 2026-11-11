import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';
import { RedisService } from '../../src/common/redis/redis.service';
import { AttemptStreamService } from '../../src/attempts/attempt-stream.service';

/**
 * PH-4 integration tests: T-005..T-009, degraded mode, clock tampering,
 * ownership. Requires DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET.
 * NODE_ENV=test keeps the background consumer off; tests drain the
 * stream explicitly via AttemptStreamService.
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

async function waitFor(cond: () => Promise<boolean>, ms = 10_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (await cond()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('waitFor timed out');
}

describe('attempts (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisService;
  let stream: AttemptStreamService;
  let studentToken: string;
  let otherToken: string;
  let adminToken: string;
  let topicId: string;
  let mcqId: string;
  let correctOptionId: string;
  let wrongOptionId: string;
  let numId: string;
  const createdUserIds: string[] = [];
  const createdQuestionIds: string[] = [];
  const createdTopicIds: string[] = [];

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    for (const n of ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET']) {
      if (!process.env[n]) throw new Error(`${n} is not set`);
    }
    process.env.RATE_LIMIT_FACTOR ??= '1000';
    process.env.ATTEMPT_MIN_IDLE_MS ??= '50'; // fast pending reclaim in tests
    app = await createApp();
    prisma = app.get(PrismaService);
    stream = app.get(AttemptStreamService);
    redis = app.get(RedisService);
    await stream.ensureGroup();

    const topic = await prisma.topic.create({
      data: { slug: uniq('att-topic'), name: `Attempt Topic ${seq}`, level: 'topic' },
    });
    topicId = topic.id;
    createdTopicIds.push(topic.id);

    // Published MCQ, practice pool.
    const mcq = await prisma.question.create({
      data: {
        topicId,
        format: 'mcq',
        stem: uniq('MCQ stem') + ' — pick the even number.',
        difficultyPrior: 2,
        expectedTimeMs: 60_000,
        pool: 'practice',
        status: 'published',
        sourceName: 'test',
        author: 'test',
        stemHash: uniq('hash-mcq'),
        options: {
          create: [
            { text: '2', isCorrect: true, orderNo: 0 },
            { text: '3', isCorrect: false, orderNo: 1 },
            { text: '5', isCorrect: false, orderNo: 2 },
            { text: '7', isCorrect: false, orderNo: 3 },
          ],
        },
      },
      include: { options: true },
    });
    mcqId = mcq.id;
    createdQuestionIds.push(mcq.id);
    correctOptionId = mcq.options.find((o) => o.isCorrect)!.id;
    wrongOptionId = mcq.options.find((o) => !o.isCorrect)!.id;

    // Published numerical, practice pool, answer 42 tol 0.5.
    const num = await prisma.question.create({
      data: {
        topicId,
        format: 'numerical',
        stem: uniq('Numerical stem') + ' — what is 6 × 7?',
        difficultyPrior: 1,
        expectedTimeMs: 45_000,
        pool: 'practice',
        status: 'published',
        sourceName: 'test',
        author: 'test',
        stemHash: uniq('hash-num'),
        numericAnswer: '42',
        answerFormat: 'decimal',
        tolerance: '0.5',
      },
    });
    numId = num.id;
    createdQuestionIds.push(num.id);

    const hash = await argon2.hash(PASSWORD);
    const mk = async (role: string) => {
      const u = await prisma.user.create({
        data: {
          email: `${uniq(role)}@example.com`,
          passwordHash: hash,
          role,
          emailVerifiedAt: new Date(),
        },
      });
      createdUserIds.push(u.id);
      return u;
    };
    studentToken = await login(app, (await mk('student')).email);
    otherToken = await login(app, (await mk('student')).email);
    adminToken = await login(app, (await mk('admin')).email);
  });

  afterAll(async () => {
    // Remove fixtures: users cascade their sessions/attempts; attempts on
    // fixture questions are removed explicitly (question_id has no cascade).
    await prisma.questionAttempt.deleteMany({ where: { questionId: { in: createdQuestionIds } } });
    await prisma.question.deleteMany({ where: { id: { in: createdQuestionIds } } });
    await prisma.topic.deleteMany({ where: { id: { in: createdTopicIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await app.close();
  });

  async function newSession(token = studentToken) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sessions')
      .set(auth(token))
      .send({ kind: 'practice' })
      .expect(201);
    return res.body.data.id as string;
  }

  it('E-040: creates a session; students only', async () => {
    const id = await newSession();
    expect(id).toBeTruthy();
    await request(app.getHttpServer())
      .post('/api/v1/sessions')
      .set(auth(adminToken))
      .send({})
      .expect(403);
  });

  it('serve returns the question without answer keys and stamps shown_at', async () => {
    const sid = await newSession();
    const res = await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sid}/questions/${mcqId}`)
      .set(auth(studentToken))
      .expect(200);
    expect(res.body.data.question.stem).toContain('even number');
    for (const o of res.body.data.question.options) {
      expect(o.isCorrect).toBeUndefined();
      expect(o.text).toBeTruthy();
    }
    expect(res.body.data.question.shownAt).toBeTruthy();
    // Other student → 404 (no existence leak).
    await request(app.getHttpServer())
      .get(`/api/v1/sessions/${sid}/questions/${mcqId}`)
      .set(auth(otherToken))
      .expect(404);
  });

  it('T-005: MCQ wrong option marks false; key never appears in responses', async () => {
    const sid = await newSession();
    const res = await request(app.getHttpServer())
      .put(`/api/v1/sessions/${sid}/attempts/${mcqId}`)
      .set(auth(studentToken))
      .send({ attemptId: randomUUID(), selectedOptionId: wrongOptionId })
      .expect(200);
    expect(res.body.data.isCorrect).toBe(false);
    expect(res.body.data.expectedTimeMs).toBe(60_000);
    expect(JSON.stringify(res.body)).not.toContain(correctOptionId);
    expect(JSON.stringify(res.body)).not.toContain('isCorrect":true');
  });

  it('T-006: numerical tolerance variants; unparseable → 422, not consumed', async () => {
    const sid = await newSession();

    const ok = await request(app.getHttpServer())
      .put(`/api/v1/sessions/${sid}/attempts/${numId}`)
      .set(auth(studentToken))
      .send({ attemptId: randomUUID(), numericInput: '42.4' })
      .expect(200);
    expect(ok.body.data.isCorrect).toBe(true);

    const bad = await request(app.getHttpServer())
      .put(`/api/v1/sessions/${sid}/attempts/${numId}`)
      .set(auth(studentToken))
      .send({ attemptId: randomUUID(), numericInput: 'not-a-number' })
      .expect(422);
    expect(bad.body.error.code).toBe('INVALID_NUMERIC_INPUT');

    // Drain the stream: only the valid attempt may be persisted.
    for (let i = 0; i < 3; i++) await stream.processAvailable();
    const rows = await prisma.questionAttempt.findMany({ where: { contextId: sid } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isCorrect).toBe(true);
  });

  it('T-007: same attemptId returns stored result; one row persisted', async () => {
    const sid = await newSession();
    const attemptId = randomUUID();
    const payload = { attemptId, selectedOptionId: correctOptionId };
    const r1 = await request(app.getHttpServer())
      .put(`/api/v1/sessions/${sid}/attempts/${mcqId}`)
      .set(auth(studentToken))
      .send(payload)
      .expect(200);
    expect(r1.body.data.isCorrect).toBe(true);

    const r2 = await request(app.getHttpServer())
      .put(`/api/v1/sessions/${sid}/attempts/${mcqId}`)
      .set(auth(studentToken))
      .send(payload)
      .expect(200);
    expect(r2.body.data).toEqual(r1.body.data);

    // Drain the stream, then the row must exist exactly once.
    for (let i = 0; i < 3; i++) await stream.processAvailable();
    const rows = await prisma.questionAttempt.findMany({ where: { id: attemptId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.isCorrect).toBe(true);
    expect(rows[0]!.contextType).toBe('practice');
    expect(rows[0]!.contextId).toBe(sid);
  });

  it('clock tampering: client-supplied times are ignored (SEC-011/NFR-005)', async () => {
    const sid = await newSession();
    const attemptId = randomUUID();
    const res = await request(app.getHttpServer())
      .put(`/api/v1/sessions/${sid}/attempts/${numId}`)
      .set(auth(studentToken))
      .send({
        attemptId,
        numericInput: '42',
        // Malicious extras — must be stripped by the schema.
        shownAt: '2000-01-01T00:00:00Z',
        answeredAt: '2000-01-01T00:00:01Z',
        timeMs: 9_999_999,
        clientTimeMs: 123,
      })
      .expect(200);
    expect(res.body.data.timeMs).toBeLessThan(120_000);
    for (let i = 0; i < 3; i++) await stream.processAvailable();
    const row = await prisma.questionAttempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(row.timeMs).toBeLessThan(120_000);
    expect(row.timeMs).not.toBe(9_999_999);
    // shown_at/answered_at are server timestamps.
    expect(row.answeredAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('T-008: 1,000 events survive a consumer restart — persisted exactly once', async () => {
    const sid = await newSession();
    const userId = (await prisma.practiceSession.findUniqueOrThrow({ where: { id: sid } })).userId;
    const events = Array.from({ length: 1000 }, (_, i) => ({
      attemptId: randomUUID(),
      userId,
      questionId: mcqId,
      contextType: 'practice' as const,
      contextId: sid,
      shownAt: new Date().toISOString(),
      answeredAt: new Date().toISOString(),
      timeMs: 1000 + i,
      selectedOptionId: correctOptionId,
      numericInput: null,
      roundingSuspected: false,
      isCorrect: true,
      skipped: false,
      sequenceNo: i + 1,
      revisitCount: 0,
      answerChanges: 0,
    }));
    for (const e of events) await stream.append(e);

    // Simulate a crashed consumer: deliver 10 entries to a ghost consumer
    // that never acks → they sit pending in the group.
    await redis.client.xreadgroup(
      'GROUP',
      stream.group,
      'ghost-consumer',
      'COUNT',
      10,
      'STREAMS',
      stream.stream,
      '>',
    );
    expect(await stream.pendingCount()).toBeGreaterThanOrEqual(10);

    // "Restart": the live consumer drains unread entries, then reclaims
    // the ghost's pending batch.
    for (let i = 0; i < 12; i++) await stream.processAvailable();
    await new Promise((r) => setTimeout(r, 120)); // let entries go idle
    await stream.reclaimPending();
    const total = await prisma.questionAttempt.count({ where: { contextId: sid } });
    expect(total).toBe(1000);
    const distinct = await prisma.questionAttempt.findMany({
      where: { contextId: sid },
      select: { id: true },
      distinct: ['id'],
    });
    expect(distinct).toHaveLength(1000);
  });

  it('T-009: finish runs the flush barrier — recalc only after all ids persist', async () => {
    const sid = await newSession();
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/sessions/${sid}/attempts/${mcqId}`)
        .set(auth(studentToken))
        .send({
          attemptId: randomUUID(),
          selectedOptionId: i % 2 ? wrongOptionId : correctOptionId,
        })
        .expect(200);
      ids.push(res.body.data.attemptId as string);
    }
    // Attempts are still sitting in the stream (consumer off in tests).
    const fin = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sid}/finish`)
      .set(auth(studentToken))
      .send({ attemptIds: ids })
      .expect(202);
    expect(fin.body.data.status).toBe('finished');
    expect(fin.body.data.recalcStatus).toBe('pending');
    expect(fin.body.data.persistedCount).toBe(5);
    expect(fin.body.data.missingCount).toBe(0);

    const rows = await prisma.questionAttempt.count({ where: { contextId: sid } });
    expect(rows).toBe(5);

    // BullMQ placeholder job flips recalc_status → done.
    await waitFor(async () => {
      const s = await prisma.practiceSession.findUniqueOrThrow({ where: { id: sid } });
      return s.recalcStatus === 'done';
    });

    // Second finish → 409.
    await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sid}/finish`)
      .set(auth(studentToken))
      .send({})
      .expect(409);
  });

  it('degraded mode: stream failure falls back to direct DB write', async () => {
    const sid = await newSession();
    const spy = vi.spyOn(stream, 'append').mockRejectedValue(new Error('redis down'));
    try {
      const attemptId = randomUUID();
      const res = await request(app.getHttpServer())
        .put(`/api/v1/sessions/${sid}/attempts/${mcqId}`)
        .set(auth(studentToken))
        .send({ attemptId, selectedOptionId: correctOptionId })
        .expect(200);
      expect(res.body.data.isCorrect).toBe(true);
      const row = await prisma.questionAttempt.findUnique({ where: { id: attemptId } });
      expect(row).toBeTruthy();
      expect(row!.contextId).toBe(sid);
    } finally {
      spy.mockRestore();
    }
  });

  it('degraded mode: stream + DB both failing → 503', async () => {
    const sid = await newSession();
    const spyAppend = vi.spyOn(stream, 'append').mockRejectedValue(new Error('redis down'));
    const spyCreate = vi
      .spyOn(prisma.questionAttempt, 'create')
      .mockRejectedValue(new Error('db down'));
    try {
      await request(app.getHttpServer())
        .put(`/api/v1/sessions/${sid}/attempts/${mcqId}`)
        .set(auth(studentToken))
        .send({ attemptId: randomUUID(), selectedOptionId: correctOptionId })
        .expect(503);
    } finally {
      spyAppend.mockRestore();
      spyCreate.mockRestore();
    }
  });

  it("ownership: attempts on another student's session → 404", async () => {
    const sid = await newSession();
    await request(app.getHttpServer())
      .put(`/api/v1/sessions/${sid}/attempts/${mcqId}`)
      .set(auth(otherToken))
      .send({ attemptId: randomUUID(), selectedOptionId: correctOptionId })
      .expect(404);
  });

  it('pool enforcement: reassessment-pool question rejected in practice session', async () => {
    const reQ = await prisma.question.create({
      data: {
        topicId,
        format: 'numerical',
        stem: uniq('Reassessment stem') + ' — 2 + 2?',
        difficultyPrior: 1,
        expectedTimeMs: 30_000,
        pool: 'reassessment',
        status: 'published',
        sourceName: 'test',
        author: 'test',
        stemHash: uniq('hash-re'),
        numericAnswer: '4',
      },
    });
    createdQuestionIds.push(reQ.id);
    const sid = await newSession();
    await request(app.getHttpServer())
      .put(`/api/v1/sessions/${sid}/attempts/${reQ.id}`)
      .set(auth(studentToken))
      .send({ attemptId: randomUUID(), numericInput: '4' })
      .expect(422);
  });
});

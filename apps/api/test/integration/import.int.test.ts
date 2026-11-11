import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import argon2 from 'argon2';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/common/prisma/prisma.service';

/**
 * PH-3 integration tests: E-063 batch list/reversal, E-068/E-069 pattern
 * queue + mapping, coverage report, blueprint draft endpoint validation,
 * and the admin/reviewer/student role matrix. Network-dependent paths
 * (E-062/E-067 real fetches) are covered by @aptiva/ingest unit tests and
 * manual verification — these tests exercise the DB-backed surface.
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

describe('import & company data (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let reviewerToken: string;
  let studentToken: string;
  let topicId: string;
  let batchId: string;
  let patternBatchId: string;
  let patternId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    for (const name of ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET']) {
      if (!process.env[name]) throw new Error(`${name} is not set`);
    }
    process.env.RATE_LIMIT_FACTOR ??= '1000';
    app = await createApp();
    prisma = app.get(PrismaService);

    const topic = await prisma.topic.create({
      data: { slug: uniq('imp-topic'), name: `Import Topic ${seq}`, level: 'topic' },
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
    adminToken = await login(app, (await mk('admin')).email);
    reviewerToken = await login(app, (await mk('reviewer')).email);
    studentToken = await login(app, (await mk('student')).email);

    // Fixture: an import batch with two draft questions (reversed later).
    const batch = await prisma.importBatch.create({
      data: {
        sourceName: 'test-source',
        sourceRef: 'test://fixture',
        parserVersion: 't1',
        accepted: 2,
        createdBy: null,
      },
    });
    batchId = batch.id;
    await prisma.question.createMany({
      data: [1, 2].map((i) => ({
        topicId,
        format: 'numerical' as const,
        stem: `Fixture stem ${uniq('q')}-${i} with enough text to be valid.`,
        solution: null,
        difficultyPrior: 2,
        expectedTimeMs: 60_000,
        numericAnswer: '42',
        pool: 'practice',
        status: 'draft',
        sourceName: 'test-source',
        author: 'import:test',
        importBatchId: batchId,
        stemHash: `fixture-hash-${batchId}-${i}`,
      })),
    });

    // Second batch for pattern records — the first gets deleted by the
    // reversal test and company_pattern_records.import_batch_id has no
    // cascade.
    const patternBatch = await prisma.importBatch.create({
      data: {
        sourceName: 'ds-07-test',
        sourceRef: 'test://patterns',
        parserVersion: 't1',
        accepted: 1,
        createdBy: null,
      },
    });
    patternBatchId = patternBatch.id;

    // Fixture: a pattern record.
    const rec = await prisma.companyPatternRecord.create({
      data: {
        importBatchId: patternBatchId,
        company: 'TestCo',
        roundName: 'Online Assessment',
        sectionName: 'Aptitude',
        topicText: uniq('unmapped phrase'),
        sourcePath: 'Companies/99-Test/01-OA.md',
        sourceCommit: 'deadbeef',
        status: 'extracted',
      },
    });
    patternId = rec.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('role matrix: students and reviewers cannot run imports or map patterns', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/import')
      .set(auth(studentToken))
      .send({ source: 'ds-01', dryRun: true })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/admin/import')
      .set(auth(reviewerToken))
      .send({ source: 'ds-01', dryRun: true })
      .expect(403);
    await request(app.getHttpServer())
      .get('/api/v1/admin/import-batches')
      .set(auth(studentToken))
      .expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/admin/company-patterns/${patternId}/map`)
      .set(auth(reviewerToken))
      .send({ topicSlug: 'percentages' })
      .expect(403);
  });

  it('E-063: lists batches with question counts; validates payloads', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/import-batches')
      .set(auth(adminToken))
      .expect(200);
    const batch = res.body.data.find((b: { id: string }) => b.id === batchId);
    expect(batch).toBeTruthy();
    expect(batch.questionCount).toBe(2);
    expect(batch.sourceRef).toBe('test://fixture');

    await request(app.getHttpServer())
      .post('/api/v1/admin/import')
      .set(auth(adminToken))
      .send({ source: 'ds-99', dryRun: true })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/admin/company-imports')
      .set(auth(adminToken))
      .send({ source: 'ds-09', dryRun: true })
      .expect(400);
  });

  it('E-063: reverses a batch — questions and batch row are deleted', async () => {
    // 404 for unknown batch.
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/import-batches/${crypto.randomUUID()}`)
      .set(auth(adminToken))
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/import-batches/${batchId}`)
      .set(auth(adminToken))
      .expect(204);

    const remaining = await prisma.question.count({ where: { importBatchId: batchId } });
    expect(remaining).toBe(0);
    const batch = await prisma.importBatch.findUnique({ where: { id: batchId } });
    expect(batch).toBeNull();
    // Second reversal → 404.
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/import-batches/${batchId}`)
      .set(auth(adminToken))
      .expect(404);
  });

  it('E-068: lists pattern records and unmapped phrase queue', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/company-patterns?company=TestCo&unmapped=true')
      .set(auth(adminToken))
      .expect(200);
    const item = res.body.data.items.find((r: { id: string }) => r.id === patternId);
    expect(item).toBeTruthy();
    expect(item.topic).toBeNull();
    expect(item.sourceCommit).toBe('deadbeef');
    expect(res.body.data.unmappedPhrases.length).toBeGreaterThan(0);

    // Reviewers can read the queue too.
    await request(app.getHttpServer())
      .get('/api/v1/admin/company-patterns')
      .set(auth(reviewerToken))
      .expect(200);
  });

  it('E-069: maps a record to a topic, upserts synonym, retro-fits siblings', async () => {
    const target = await prisma.topic.findFirst({ where: { level: 'topic' } });
    expect(target).toBeTruthy();

    // Sibling with the same topic text should also get mapped.
    const phrase = (
      await prisma.companyPatternRecord.findUniqueOrThrow({ where: { id: patternId } })
    ).topicText!;
    const sibling = await prisma.companyPatternRecord.create({
      data: {
        importBatchId: patternBatchId,
        company: 'TestCo',
        topicText: phrase,
        sourcePath: 'Companies/99-Test/01-OA.md',
        sourceCommit: 'deadbeef',
        status: 'extracted',
      },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/company-patterns/${patternId}/map`)
      .set(auth(adminToken))
      .send({ topicSlug: target!.slug, addSynonym: true })
      .expect(201);
    expect(res.body.data.status).toBe('mapped');

    const syn = await prisma.topicSynonym.findUnique({
      where: { phrase: phrase.toLowerCase().replace(/\s+/g, ' ').trim() },
    });
    expect(syn?.topicId).toBe(target!.id);

    const sib = await prisma.companyPatternRecord.findUniqueOrThrow({ where: { id: sibling.id } });
    expect(sib.topicId).toBe(target!.id);
    expect(sib.status).toBe('mapped');

    // Reject path on a fresh record.
    const rej = await prisma.companyPatternRecord.create({
      data: {
        importBatchId: patternBatchId,
        company: 'TestCo',
        topicText: uniq('reject me'),
        sourcePath: 'x.md',
        sourceCommit: 'c',
      },
    });
    await request(app.getHttpServer())
      .post(`/api/v1/admin/company-patterns/${rej.id}/map`)
      .set(auth(adminToken))
      .send({ reject: true })
      .expect(201);
    // Invalid slug → 400.
    await request(app.getHttpServer())
      .post(`/api/v1/admin/company-patterns/${rej.id}/map`)
      .set(auth(adminToken))
      .send({ topicSlug: 'no-such-topic' })
      .expect(400);
  });

  it('coverage endpoint returns cells and threshold summary', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/coverage')
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.data.threshold).toBe(8);
    expect(res.body.data).toHaveProperty('belowThreshold');
    expect(res.body.data).toHaveProperty('totals');
    // Reviewer may read coverage too.
    await request(app.getHttpServer())
      .get('/api/v1/admin/coverage')
      .set(auth(reviewerToken))
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/admin/coverage')
      .set(auth(studentToken))
      .expect(403);
  });

  it('blueprint draft endpoint rejects companies without mapped records', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/admin/blueprints/draft-from-records')
      .set(auth(adminToken))
      .send({ company: 'NoSuchCompany-xyz' })
      .expect(400);
  });
});

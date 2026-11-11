import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  ENGINE_VERSION,
  EngineError,
  analyzeDiagnostic,
  markAttempt,
  type DiagnosticAttemptInput,
  type MarkingQuestion,
} from '@aptiva/engine';
import { ENV, type Env } from '../common/config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AttemptsService, type QuestionKey } from '../attempts/attempts.service';
import { AttemptStreamService, type AttemptEvent } from '../attempts/attempt-stream.service';
import { DiagnosticResultJobService } from './result-job.service';
import { composeDiagnostic, type ComposerCandidate } from './composer';
import type { DiagnosticCreateDto, DiagnosticSubmitDto } from './dto';
import type { AttemptSubmitDto } from '../attempts/dto';

const PARTIAL_AFTER_MS = 48 * 60 * 60 * 1000; // 48-hour abandoned rule
const ACTIVITY_TOUCH_MS = 60_000;

interface DiagnosticRow {
  id: string;
  userId: string;
  mode: string;
  status: string;
  questionIds: string[];
  pauseCount: number;
  startedAt: Date;
  submittedAt: Date | null;
  lastActivityAt: Date;
}

@Injectable()
export class DiagnosticService {
  private readonly logger = new Logger(DiagnosticService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly attempts: AttemptsService,
    private readonly stream: AttemptStreamService,
    private readonly resultJob: DiagnosticResultJobService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------------------------------------------------------- E-010

  async createDiagnostic(userId: string, dto: DiagnosticCreateDto) {
    await this.expireStale(userId);

    const existing = await this.prisma.diagnosticTest.findFirst({
      where: { userId, status: { in: ['active', 'paused'] } },
      orderBy: { startedAt: 'desc' },
    });
    if (existing) {
      throw new ConflictException({
        code: 'DIAGNOSTIC_ACTIVE',
        message: 'A diagnostic is already in progress — resume it instead',
        diagnosticId: existing.id,
      });
    }
    const completed = await this.prisma.diagnosticTest.findFirst({
      where: { userId, status: 'submitted' },
      select: { id: true },
    });
    if (completed) {
      throw new ConflictException({
        code: 'DIAGNOSTIC_COMPLETED',
        message: 'Diagnostic already completed',
      });
    }

    const candidates = await this.loadCandidates();
    const composed = composeDiagnostic(candidates, dto.mode);
    const target = dto.mode === 'standard' ? 27 : 12;
    if (!composed || composed.questionIds.length < target) {
      throw new UnprocessableEntityException({
        code: 'DIAGNOSTIC_BANK_INSUFFICIENT',
        message: `Diagnostic bank has ${candidates.length} published items; need ${target}`,
      });
    }

    const d = await this.prisma.diagnosticTest.create({
      data: {
        userId,
        mode: dto.mode,
        status: 'active',
        questionIds: composed.questionIds,
        pauseCount: 0,
      },
    });
    this.logger.log(
      `diagnostic ${d.id} composed: mode=${dto.mode} items=${composed.questionIds.length} shortSections=${composed.shortSections.join(',') || 'none'}`,
    );
    return { id: d.id, mode: d.mode, questionCount: composed.questionIds.length, status: 'active' };
  }

  /** Active/paused diagnostic for the resume button (P-06). */
  async getActive(userId: string) {
    await this.expireStale(userId);
    const d = await this.prisma.diagnosticTest.findFirst({
      where: { userId, status: { in: ['active', 'paused'] } },
      orderBy: { startedAt: 'desc' },
    });
    if (!d) return null;
    const answered = await this.servedIds(d.id);
    return {
      id: d.id,
      mode: d.mode,
      status: d.status,
      questionCount: d.questionIds.length,
      answeredCount: answered.size,
      pauseCount: d.pauseCount,
    };
  }

  // ---------------------------------------------------------- E-011

  async nextQuestion(userId: string, id: string) {
    const d = await this.requireOwned(userId, id);
    await this.expireIfStale(d);
    if (d.status === 'submitted' || d.status === 'partial') {
      throw new ConflictException({ code: 'CONFLICT', message: `Diagnostic is ${d.status}` });
    }
    if (d.status === 'paused') {
      // Resuming: next question implicitly unpauses.
      await this.prisma.diagnosticTest.update({
        where: { id: d.id },
        data: { status: 'active', lastActivityAt: new Date() },
      });
      d.status = 'active';
    }
    await this.touch(d.id);

    const served = await this.servedIds(d.id);
    const nextId = d.questionIds.find((qid) => !served.has(qid));
    if (!nextId) {
      return { done: true, answeredCount: served.size, totalCount: d.questionIds.length };
    }
    const q = await this.attempts.questionKey(nextId);
    this.assertDiagnosticPool(q);
    const full = await this.prisma.question.findUnique({
      where: { id: nextId },
      include: { options: { orderBy: { orderNo: 'asc' } } },
    });
    if (!full) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    const shownAt = await this.attempts.markShown(d.id, nextId);
    const position = d.questionIds.indexOf(nextId) + 1;
    return {
      done: false,
      position,
      total: d.questionIds.length,
      question: {
        id: full.id,
        format: full.format,
        stem: full.stem,
        expectedTimeMs: full.expectedTimeMs,
        difficultyPrior: full.difficultyPrior,
        answerFormat: full.answerFormat,
        decimalPlaces: full.decimalPlaces,
        shownAt: shownAt.toISOString(),
        options: full.options.map((o) => ({ id: o.id, text: o.text, orderNo: o.orderNo })),
      },
    };
  }

  // ---------------------------------------------------------- E-012

  async submitAnswer(userId: string, id: string, questionId: string, dto: AttemptSubmitDto) {
    // Idempotent replay — same attemptId returns the stored ack.
    const cached = await this.attempts.getCachedResult<Record<string, unknown>>(dto.attemptId);
    if (cached) return cached;
    const existing = await this.attempts.findAttemptRow(dto.attemptId);
    if (existing) {
      return { attemptId: dto.attemptId, recorded: true, sequenceNo: existing.sequenceNo };
    }

    const d = await this.requireOwned(userId, id);
    await this.expireIfStale(d);
    if (d.status !== 'active') {
      throw new ConflictException({
        code: 'CONFLICT',
        message: d.status === 'paused' ? 'Diagnostic is paused' : `Diagnostic is ${d.status}`,
      });
    }
    if (!d.questionIds.includes(questionId)) {
      throw new UnprocessableEntityException({
        code: 'NOT_IN_DIAGNOSTIC',
        message: 'Question is not part of this diagnostic',
      });
    }
    const q = await this.attempts.questionKey(questionId);
    this.assertDiagnosticPool(q);

    const markingQuestion: MarkingQuestion = {
      format: q.format,
      options: q.options,
      numericAnswer: q.numericAnswer != null ? Number(q.numericAnswer) : null,
      answerFormat: (q.answerFormat as 'integer' | 'decimal' | null) ?? null,
      decimalPlaces: q.decimalPlaces,
      tolerance: q.tolerance != null ? Number(q.tolerance) : null,
    };
    let marked;
    try {
      marked = markAttempt(
        markingQuestion,
        {
          selectedOptionId: dto.selectedOptionId ?? null,
          numericInput: dto.numericInput ?? null,
          skipped: dto.skipped,
        },
        { negativeMarking: null },
      );
    } catch (err) {
      if (err instanceof EngineError) {
        throw new UnprocessableEntityException({
          code:
            err.code === 'INVALID_NUMERIC_INPUT' ? 'INVALID_NUMERIC_INPUT' : 'VALIDATION_FAILED',
          message:
            err.code === 'INVALID_NUMERIC_INPUT'
              ? 'Answer could not be parsed — the attempt was not consumed'
              : err.message,
        });
      }
      throw err;
    }

    const answeredAt = new Date();
    const shownAt = (await this.attempts.getShown(d.id, questionId)) ?? answeredAt;
    const timeMs = Math.max(0, answeredAt.getTime() - shownAt.getTime());
    const sequenceNo = d.questionIds.indexOf(questionId) + 1;

    const event: AttemptEvent = {
      attemptId: dto.attemptId,
      userId,
      questionId,
      contextType: 'diagnostic',
      contextId: d.id,
      shownAt: shownAt.toISOString(),
      answeredAt: answeredAt.toISOString(),
      timeMs,
      selectedOptionId: dto.selectedOptionId ?? null,
      numericInput: dto.numericInput ?? null,
      roundingSuspected: marked.roundingSuspected,
      isCorrect: marked.isCorrect,
      skipped: dto.skipped,
      sequenceNo,
      revisitCount: dto.revisitCount,
      answerChanges: dto.answerChanges,
    };
    await this.attempts.persistAttempt(event);
    await this.redis.client.sadd(`diag:served:${d.id}`, questionId).catch(() => 0);
    await this.touch(d.id);

    // Feedback-free ack — correctness is revealed only after submit (P-08).
    const ack = {
      attemptId: dto.attemptId,
      recorded: true,
      sequenceNo,
      position: sequenceNo,
      total: d.questionIds.length,
    };
    await this.attempts.cacheAttemptResult(dto.attemptId, ack);
    return ack;
  }

  // ---------------------------------------------------------- E-013

  async pause(userId: string, id: string) {
    const d = await this.requireOwned(userId, id);
    await this.expireIfStale(d);
    if (d.status !== 'active') {
      throw new ConflictException({
        code: 'CONFLICT',
        message:
          d.pauseCount >= 1 || d.status === 'paused'
            ? 'Diagnostic can only be paused once'
            : `Diagnostic is ${d.status}`,
      });
    }
    await this.prisma.diagnosticTest.update({
      where: { id: d.id },
      data: { status: 'paused', pauseCount: { increment: 1 }, lastActivityAt: new Date() },
    });
    return { id: d.id, status: 'paused', pauseCount: d.pauseCount + 1 };
  }

  // ---------------------------------------------------------- E-014

  async submit(userId: string, id: string, dto: DiagnosticSubmitDto) {
    const d = await this.requireOwned(userId, id);
    await this.expireIfStale(d);
    if (d.status === 'submitted') {
      return { diagnosticId: id, resultStatus: 'ready' };
    }
    if (d.status !== 'active' && d.status !== 'paused') {
      throw new ConflictException({ code: 'CONFLICT', message: `Diagnostic is ${d.status}` });
    }

    // Flush barrier: drain the stream, then verify client-held ids.
    const deadline = Date.now() + this.env.FLUSH_BARRIER_TIMEOUT_MS;
    const clientIds = new Set(dto.attemptIds ?? []);
    const persisted = await this.persistedAttemptIds(d.id, [...clientIds]);
    while (Date.now() < deadline) {
      await this.stream.processAvailable().catch(() => 0);
      const now = await this.persistedAttemptIds(d.id, [...clientIds]);
      if (now.size >= clientIds.size && (await this.stream.pendingCount()) === 0) break;
      await sleep(50);
    }
    const missing = [...clientIds].filter((x) => !persisted.has(x));
    if (missing.length) {
      this.logger.warn(`diagnostic ${id} submit: ${missing.length} client attempt ids unpersisted`);
    }

    await this.prisma.diagnosticTest.update({
      where: { id: d.id },
      data: { status: 'submitted', submittedAt: new Date() },
    });
    try {
      await this.resultJob.enqueue(id, userId);
    } catch (err) {
      this.logger.error(`result job enqueue failed for ${id}: ${String(err).slice(0, 160)}`);
    }
    return { diagnosticId: id, resultStatus: 'pending' };
  }

  // ---------------------------------------------------------- E-015

  async getResult(userId: string, id: string) {
    const d = await this.requireOwned(userId, id);
    const result = await this.prisma.diagnosticResult.findUnique({ where: { diagnosticId: id } });
    if (!result) {
      throw new ConflictException({ code: 'RESULT_NOT_READY', message: 'Result is not ready yet' });
    }
    return { diagnosticId: id, status: d.status, result: result.summary };
  }

  /** P-09 review items — only after submission; includes keys (owner only). */
  async getReviewItems(userId: string, id: string) {
    const d = await this.requireOwned(userId, id);
    if (d.status !== 'submitted') {
      throw new ConflictException({ code: 'CONFLICT', message: 'Review unlocks after submit' });
    }
    const attempts = await this.prisma.questionAttempt.findMany({
      where: { contextType: 'diagnostic', contextId: id },
      orderBy: { sequenceNo: 'asc' },
      include: {
        question: {
          include: {
            options: { orderBy: { orderNo: 'asc' } },
            topic: { select: { id: true, name: true } },
          },
        },
        selectedOption: true,
        errorFeedback: { include: { errorType: true } },
        errorInference: { include: { errorType: true } },
      },
    });
    return {
      diagnosticId: id,
      mode: d.mode,
      items: attempts.map((a) => ({
        attemptId: a.id,
        sequenceNo: a.sequenceNo,
        questionId: a.questionId,
        stem: a.question.stem,
        solution: a.question.solution,
        format: a.question.format,
        options: a.question.options.map((o) => ({
          id: o.id,
          text: o.text,
          isCorrect: o.isCorrect,
        })),
        numericAnswer: a.question.numericAnswer?.toString() ?? null,
        answerFormat: a.question.answerFormat,
        decimalPlaces: a.question.decimalPlaces,
        tolerance: a.question.tolerance?.toString() ?? null,
        selectedOptionId: a.selectedOptionId,
        numericInput: a.numericInput?.toString() ?? null,
        isCorrect: a.isCorrect,
        skipped: a.skipped,
        timeMs: a.timeMs,
        expectedTimeMs: a.question.expectedTimeMs,
        topicName: a.question.topic.name,
        feedback: a.errorFeedback
          ? {
              errorType: a.errorFeedback.errorType.code,
              errorTypeLabel: a.errorFeedback.errorType.label,
              freeText: a.errorFeedback.freeText,
            }
          : null,
        inference: a.errorInference
          ? {
              errorType: a.errorInference.errorType?.code ?? null,
              method: a.errorInference.method,
              confidence: a.errorInference.confidence,
              conflict: a.errorInference.conflict,
            }
          : null,
      })),
    };
  }

  /** Error-type catalogue for the P-09 picker. */
  async errorTypes() {
    const rows = await this.prisma.errorType.findMany({ orderBy: { id: 'asc' } });
    return rows.map((r) => ({ id: r.id, code: r.code, label: r.label, category: r.category }));
  }

  // ---------------------------------------------------------- result job

  /** Called by the recalc worker — idempotent by diagnostic id. */
  async computeResult(diagnosticId: string): Promise<void> {
    const d = await this.prisma.diagnosticTest.findUnique({ where: { id: diagnosticId } });
    if (!d || d.status !== 'submitted') return;
    const existing = await this.prisma.diagnosticResult.findUnique({ where: { diagnosticId } });
    if (existing) return; // idempotent

    const attempts = await this.prisma.questionAttempt.findMany({
      where: { contextType: 'diagnostic', contextId: diagnosticId },
      orderBy: { sequenceNo: 'asc' },
      include: {
        question: {
          select: {
            id: true,
            topicId: true,
            difficultyPrior: true,
            expectedTimeMs: true,
            topic: { select: { id: true, name: true, parentId: true } },
          },
        },
      },
    });

    // Resolve section names (root ancestor) for each topic.
    const topicIds = [...new Set(attempts.map((a) => a.question.topicId))];
    const topics = await this.prisma.topic.findMany({ where: { id: { in: topicIds } } });
    const allTopics = await this.prisma.topic.findMany();
    const byId = new Map(allTopics.map((t) => [t.id, t]));
    const sectionName = (topicId: string): string | null => {
      let cur = byId.get(topicId);
      let hops = 0;
      while (cur?.parentId && hops++ < 5) cur = byId.get(cur.parentId);
      return cur?.level === 'section' ? cur.name : null;
    };
    void topics;

    const inputs: DiagnosticAttemptInput[] = attempts.map((a) => ({
      questionId: a.questionId,
      topicId: a.question.topicId,
      topicName: a.question.topic.name,
      sectionName: sectionName(a.question.topicId),
      difficultyPrior: a.question.difficultyPrior,
      isCorrect: a.isCorrect,
      skipped: a.skipped,
      timeMs: a.timeMs,
      expectedTimeMs: a.question.expectedTimeMs,
      sequenceNo: a.sequenceNo,
    }));

    const summary = analyzeDiagnostic(
      inputs,
      d.mode as 'standard' | 'express',
      ENGINE_VERSION,
      d.questionIds.length,
    );
    await this.prisma.diagnosticResult.upsert({
      where: { diagnosticId },
      create: {
        diagnosticId,
        userId: d.userId,
        summary: summary as object,
        engineVersion: ENGINE_VERSION,
      },
      update: { summary: summary as object, engineVersion: ENGINE_VERSION },
    });
    this.logger.log(
      `diagnostic ${diagnosticId} result computed: accuracy=${summary.totals.accuracy?.toFixed(3) ?? 'n/a'}`,
    );
  }

  // ---------------------------------------------------------- internals

  /** Published diagnostic-pool candidates with their root section. */
  private async loadCandidates(): Promise<ComposerCandidate[]> {
    const questions = await this.prisma.question.findMany({
      where: { pool: 'diagnostic', status: 'published' },
      select: { id: true, topicId: true, difficultyPrior: true },
    });
    if (questions.length === 0) return [];
    const topics = await this.prisma.topic.findMany();
    const byId = new Map(topics.map((t) => [t.id, t]));
    const sectionOf = (topicId: string): string | null => {
      let cur = byId.get(topicId);
      let hops = 0;
      while (cur?.parentId && hops++ < 5) cur = byId.get(cur.parentId);
      return cur?.level === 'section' ? cur.id : null;
    };
    return questions
      .map((q) => ({
        id: q.id,
        sectionId: sectionOf(q.topicId) ?? '',
        difficultyPrior: q.difficultyPrior,
      }))
      .filter((c) => c.sectionId !== '');
  }

  private assertDiagnosticPool(q: QuestionKey): void {
    if (q.status !== 'published' || q.pool !== 'diagnostic') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not available' });
    }
  }

  private async requireOwned(userId: string, id: string): Promise<DiagnosticRow> {
    const d = await this.prisma.diagnosticTest.findUnique({ where: { id } });
    if (!d || d.userId !== userId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Diagnostic not found' });
    }
    return d as DiagnosticRow;
  }

  /** 48-hour rule: stale active/paused diagnostics become 'partial'. */
  private async expireStale(userId: string): Promise<void> {
    const cutoff = new Date(Date.now() - PARTIAL_AFTER_MS);
    await this.prisma.diagnosticTest.updateMany({
      where: {
        userId,
        status: { in: ['active', 'paused'] },
        lastActivityAt: { lt: cutoff },
      },
      data: { status: 'partial' },
    });
  }

  private async expireIfStale(d: DiagnosticRow): Promise<void> {
    if (
      (d.status === 'active' || d.status === 'paused') &&
      Date.now() - d.lastActivityAt.getTime() > PARTIAL_AFTER_MS
    ) {
      await this.prisma.diagnosticTest.update({ where: { id: d.id }, data: { status: 'partial' } });
      d.status = 'partial';
    }
  }

  private async touch(id: string): Promise<void> {
    await this.prisma.diagnosticTest.updateMany({
      where: { id, lastActivityAt: { lt: new Date(Date.now() - ACTIVITY_TOUCH_MS) } },
      data: { lastActivityAt: new Date() },
    });
  }

  /** Question ids already served — DB rows ∪ Redis served-set (covers
   *  the stream-drain gap between submit and persist). */
  private async servedIds(diagnosticId: string): Promise<Set<string>> {
    const rows = await this.prisma.questionAttempt.findMany({
      where: { contextType: 'diagnostic', contextId: diagnosticId },
      select: { questionId: true },
    });
    const ids = new Set(rows.map((r) => r.questionId));
    try {
      const extra = await this.redis.client.smembers(`diag:served:${diagnosticId}`);
      for (const q of extra) ids.add(q);
    } catch {
      /* redis optional here */
    }
    return ids;
  }

  private async persistedAttemptIds(diagnosticId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) {
      const rows = await this.prisma.questionAttempt.findMany({
        where: { contextType: 'diagnostic', contextId: diagnosticId },
        select: { id: true },
      });
      return new Set(rows.map((r) => r.id));
    }
    const rows = await this.prisma.questionAttempt.findMany({
      where: { id: { in: ids }, contextType: 'diagnostic', contextId: diagnosticId },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

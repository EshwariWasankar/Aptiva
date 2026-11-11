import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EngineError, markAttempt, type MarkingQuestion } from '@aptiva/engine';
import { Prisma } from '../../generated/prisma/client';
import { ENV, type Env } from '../common/config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { AttemptStreamService, type AttemptEvent } from './attempt-stream.service';
import { RecalcService } from './recalc.service';
import type { AttemptSubmitDto, SessionCreateDto, SessionFinishDto } from './dto';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // stated 2h expiry [P]
const SESS_CACHE_TTL_S = 300;
const QKEY_CACHE_TTL_S = 3_600;
const RESULT_CACHE_TTL_S = 86_400;

interface SessionCache {
  id: string;
  userId: string;
  kind: string;
  status: string;
  startedAt: string;
}

export interface QuestionKey {
  id: string;
  format: 'mcq' | 'numerical';
  status: string;
  pool: string;
  expectedTimeMs: number;
  numericAnswer: string | null;
  answerFormat: string | null;
  decimalPlaces: number | null;
  tolerance: string | null;
  options: { id: string; isCorrect: boolean }[];
}

/** kind → required question pool (pools stay disjoint, DATA-003). */
const KIND_POOL: Record<string, string> = {
  practice: 'practice',
  mock: 'practice',
  check: 'reassessment',
  topic_test: 'reassessment',
};

@Injectable()
export class AttemptsService {
  private readonly logger = new Logger(AttemptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly stream: AttemptStreamService,
    private readonly recalc: RecalcService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ---------------------------------------------------------- E-040

  async createSession(userId: string, dto: SessionCreateDto) {
    const session = await this.prisma.practiceSession.create({
      data: {
        userId,
        kind: dto.kind,
        planItemId: dto.planItemId ?? null,
        plannedMinutes: dto.plannedMinutes ?? dto.minutes ?? null,
      },
    });
    await this.cacheSession(session);
    return {
      id: session.id,
      kind: session.kind,
      status: session.status,
      recalcStatus: session.recalcStatus,
      startedAt: session.startedAt,
      plannedMinutes: session.plannedMinutes,
    };
  }

  // ------------------------------------------- serve (shown_at stamp)

  /**
   * Serve one question inside a session: ownership + pool checks, then
   * stamps shown_at server-side (Redis; falls back to attempt time when
   * Redis is unavailable). Answer keys are never returned.
   */
  async serveQuestion(userId: string, sessionId: string, questionId: string) {
    const session = await this.requireSession(userId, sessionId);
    const q = await this.questionKey(questionId);
    this.assertQuestionUsable(session, q);

    const shownAt = await this.markShown(sessionId, questionId);
    const full = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: { orderBy: { orderNo: 'asc' } } },
    });
    if (!full) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    return {
      sessionId,
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

  // ---------------------------------------------------------- E-041

  async submitAttempt(
    userId: string,
    sessionId: string,
    questionId: string,
    dto: AttemptSubmitDto,
  ) {
    // ---- Idempotency fast paths (Redis result cache, then DB row) ----
    const cached = await this.redis.client.get(`attempt:result:${dto.attemptId}`);
    if (cached) return JSON.parse(cached) as Record<string, unknown>;
    const existing = await this.prisma.questionAttempt.findUnique({
      where: { id: dto.attemptId },
      include: { question: { select: { expectedTimeMs: true } } },
    });
    if (existing) return this.resultFromRow(existing);

    const session = await this.requireSession(userId, sessionId);
    const q = await this.questionKey(questionId);
    this.assertQuestionUsable(session, q);

    // ---- Mark from the cached key (no answer key leaves the server) ----
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
      // No blueprint is linked to practice sessions yet (PH-7); negative
      // marking stays off until a session carries blueprint context.
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
        if (err.code === 'INVALID_NUMERIC_INPUT') {
          throw new UnprocessableEntityException({
            code: 'INVALID_NUMERIC_INPUT',
            message: 'Answer could not be parsed — the attempt was not consumed',
          });
        }
        throw new UnprocessableEntityException({
          code: 'VALIDATION_FAILED',
          message: err.message,
        });
      }
      throw err;
    }

    // ---- Server-authoritative timestamps (SEC-011/NFR-005) ----
    const answeredAt = new Date();
    const shownAt = (await this.getShown(sessionId, questionId)) ?? answeredAt;
    const timeMs = Math.max(0, answeredAt.getTime() - shownAt.getTime());
    const sequenceNo = await this.nextSequenceNo('practice', sessionId);

    const event: AttemptEvent = {
      attemptId: dto.attemptId,
      userId,
      questionId,
      contextType: 'practice',
      contextId: sessionId,
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

    const response = {
      attemptId: dto.attemptId,
      isCorrect: marked.isCorrect,
      timeMs,
      expectedTimeMs: q.expectedTimeMs,
      paceRatio: q.expectedTimeMs > 0 ? Number((timeMs / q.expectedTimeMs).toFixed(3)) : null,
      correctAnswerShown: true,
      promptErrorCause: true,
      roundingSuspected: marked.roundingSuspected,
    };

    // ---- Persist: stream first, direct DB when Redis is down ----
    await this.persistAttempt(event);
    await this.cacheAttemptResult(dto.attemptId, response);
    return response;
  }

  /** Degraded mode (PH4-T04): write the attempt row directly. */
  async persistDirect(event: AttemptEvent): Promise<void> {
    try {
      await this.prisma.questionAttempt.create({
        data: {
          id: event.attemptId,
          userId: event.userId,
          questionId: event.questionId,
          contextType: event.contextType,
          contextId: event.contextId,
          shownAt: new Date(event.shownAt),
          answeredAt: new Date(event.answeredAt),
          timeMs: event.timeMs,
          selectedOptionId: event.selectedOptionId,
          numericInput: event.numericInput,
          roundingSuspected: event.roundingSuspected,
          isCorrect: event.isCorrect,
          skipped: event.skipped,
          sequenceNo: event.sequenceNo,
          revisitCount: event.revisitCount,
          answerChanges: event.answerChanges,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
      throw new ServiceUnavailableException({
        code: 'ATTEMPT_STORE_UNAVAILABLE',
        message: 'Could not persist the attempt — please retry',
      });
    }
  }

  private resultFromRow(row: {
    id: string;
    timeMs: number | null;
    isCorrect: boolean | null;
    roundingSuspected: boolean;
    question?: { expectedTimeMs: number } | null;
  }) {
    const expected = row.question?.expectedTimeMs ?? 0;
    return {
      attemptId: row.id,
      isCorrect: row.isCorrect,
      timeMs: row.timeMs,
      expectedTimeMs: expected,
      paceRatio:
        expected > 0 && row.timeMs != null ? Number((row.timeMs / expected).toFixed(3)) : null,
      correctAnswerShown: true,
      promptErrorCause: true,
      roundingSuspected: row.roundingSuspected,
    };
  }

  // ---------------------------------------------------------- E-042

  /**
   * Flush barrier (PH4-T05/T-009): compare client-held ids with
   * persisted rows and stream-pending ids, drain the stream, re-ingest
   * any payloads the client still holds, then finish + enqueue recalc.
   */
  async finishSession(userId: string, sessionId: string, dto: SessionFinishDto) {
    const session = await this.requireSession(userId, sessionId);
    if (session.status !== 'active') {
      throw new ConflictException({ code: 'CONFLICT', message: 'Session is not active' });
    }

    const clientAttempts = dto.attempts ?? [];
    const clientIds = new Set<string>([
      ...(dto.attemptIds ?? []),
      ...clientAttempts.map((a) => a.attemptId),
    ]);

    // Wait for the stream to drain, then verify every client id persisted.
    const deadline = Date.now() + this.env.FLUSH_BARRIER_TIMEOUT_MS;
    let persisted = await this.persistedIds([...clientIds], sessionId);
    while (persisted.size < clientIds.size && Date.now() < deadline) {
      await this.stream.processAvailable().catch(() => 0);
      await sleep(50);
      persisted = await this.persistedIds([...clientIds], sessionId);
    }

    // Re-ingest payloads the client still holds but the server lacks.
    let reingested = 0;
    for (const a of clientAttempts) {
      if (persisted.has(a.attemptId)) continue;
      try {
        await this.submitAttempt(userId, sessionId, a.questionId, a);
        reingested += 1;
      } catch (err) {
        this.logger.warn(
          `barrier re-ingest failed for ${a.attemptId}: ${String(err).slice(0, 160)}`,
        );
      }
    }
    if (reingested > 0) {
      // Give the stream a moment, then force-drain once more.
      await sleep(100);
      await this.stream.processAvailable().catch(() => 0);
      persisted = await this.persistedIds([...clientIds], sessionId);
    }

    const missing = [...clientIds].filter((id) => !persisted.has(id));
    if (missing.length > 0) {
      this.logger.warn(
        `flush barrier: ${missing.length} attempt ids not persisted for session ${sessionId}`,
      );
    }

    const now = new Date();
    const actualMinutes = Math.max(
      1,
      Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 60_000),
    );
    await this.prisma.practiceSession.update({
      where: { id: sessionId },
      data: {
        status: 'finished',
        finishedAt: now,
        actualMinutes,
        recalcStatus: 'pending',
      },
    });
    await this.invalidateSession(sessionId);
    try {
      await this.recalc.enqueueRecalc({ sessionId, userId });
    } catch (err) {
      // Queue down: session is still finished; recalc stays pending and
      // the student sees the neutral retry banner (Section 11.5).
      this.logger.error(`recalc enqueue failed for ${sessionId}: ${String(err).slice(0, 160)}`);
    }

    return {
      sessionId,
      status: 'finished',
      recalcStatus: 'pending',
      persistedCount: persisted.size,
      missingCount: missing.length,
    };
  }

  private async persistedIds(ids: string[], sessionId: string): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.questionAttempt.findMany({
      where: { id: { in: ids }, contextType: 'practice', contextId: sessionId },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /** Stream-first persistence with degraded direct-write fallback. */
  async persistAttempt(event: AttemptEvent): Promise<void> {
    try {
      await this.stream.append(event);
    } catch (err) {
      this.logger.warn(`stream append failed, degraded direct write: ${String(err).slice(0, 160)}`);
      await this.persistDirect(event);
    }
  }

  async findAttemptRow(attemptId: string) {
    return this.prisma.questionAttempt.findUnique({ where: { id: attemptId } });
  }

  async cacheAttemptResult(attemptId: string, payload: unknown): Promise<void> {
    await this.redis.client
      .set(`attempt:result:${attemptId}`, JSON.stringify(payload), 'EX', RESULT_CACHE_TTL_S)
      .catch(() => undefined);
  }

  async getCachedResult<T>(attemptId: string): Promise<T | null> {
    const v = await this.redis.client.get(`attempt:result:${attemptId}`).catch(() => null);
    return v ? (JSON.parse(v) as T) : null;
  }

  // ------------------------------------------------------- internals

  private async requireSession(userId: string, sessionId: string): Promise<SessionCache> {
    let s = await this.sessionFromCache(sessionId);
    if (!s) {
      const row = await this.prisma.practiceSession.findUnique({ where: { id: sessionId } });
      if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found' });
      if (row.userId !== userId) {
        throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found' });
      }
      s = {
        id: row.id,
        userId: row.userId,
        kind: row.kind,
        status: row.status,
        startedAt: row.startedAt.toISOString(),
      };
      await this.cacheSession(row);
    }
    if (s.userId !== userId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found' });
    }
    if (s.status !== 'active') {
      throw new ConflictException({ code: 'CONFLICT', message: `Session is ${s.status}` });
    }
    if (Date.now() - new Date(s.startedAt).getTime() > SESSION_TTL_MS) {
      throw new ConflictException({ code: 'SESSION_EXPIRED', message: 'Session expired' });
    }
    return s;
  }

  private assertQuestionUsable(session: SessionCache, q: QuestionKey): void {
    const requiredPool = KIND_POOL[session.kind] ?? 'practice';
    if (q.status !== 'published') {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not available' });
    }
    if (q.pool !== requiredPool) {
      throw new UnprocessableEntityException({
        code: 'WRONG_POOL',
        message: `This question is not in the ${requiredPool} pool`,
      });
    }
  }

  /** Answer-key cache — SEC-010: keys live server-side only. */
  async questionKey(questionId: string): Promise<QuestionKey> {
    const cached = await this.redis.client.get(`qkey:${questionId}`);
    if (cached) return JSON.parse(cached) as QuestionKey;
    const q = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: { options: { select: { id: true, isCorrect: true } } },
    });
    if (!q) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    const key: QuestionKey = {
      id: q.id,
      format: q.format as 'mcq' | 'numerical',
      status: q.status,
      pool: q.pool,
      expectedTimeMs: q.expectedTimeMs,
      numericAnswer: q.numericAnswer?.toString() ?? null,
      answerFormat: q.answerFormat,
      decimalPlaces: q.decimalPlaces,
      tolerance: q.tolerance?.toString() ?? null,
      options: q.options.map((o) => ({ id: o.id, isCorrect: o.isCorrect })),
    };
    await this.redis.client
      .set(`qkey:${questionId}`, JSON.stringify(key), 'EX', QKEY_CACHE_TTL_S)
      .catch(() => undefined);
    return key;
  }

  async markShown(sessionId: string, questionId: string): Promise<Date> {
    const now = Date.now();
    try {
      const set = await this.redis.client.hsetnx(`shown:${sessionId}`, questionId, String(now));
      if (set === 1) return new Date(now);
      const prev = await this.redis.client.hget(`shown:${sessionId}`, questionId);
      return prev ? new Date(Number(prev)) : new Date(now);
    } catch {
      return new Date(now);
    }
  }

  async getShown(sessionId: string, questionId: string): Promise<Date | null> {
    try {
      const v = await this.redis.client.hget(`shown:${sessionId}`, questionId);
      return v ? new Date(Number(v)) : null;
    } catch {
      return null;
    }
  }

  async nextSequenceNo(contextType: string, contextId: string): Promise<number> {
    try {
      return await this.redis.client.incr(`seq:${contextType}:${contextId}`);
    } catch {
      const count = await this.prisma.questionAttempt.count({
        where: { contextType, contextId },
      });
      return count + 1;
    }
  }

  private async cacheSession(s: {
    id: string;
    userId: string;
    kind: string;
    status: string;
    startedAt: Date;
  }): Promise<void> {
    const payload: SessionCache = {
      id: s.id,
      userId: s.userId,
      kind: s.kind,
      status: s.status,
      startedAt: s.startedAt.toISOString(),
    };
    await this.redis.client
      .set(`sess:${s.id}`, JSON.stringify(payload), 'EX', SESS_CACHE_TTL_S)
      .catch(() => undefined);
  }

  private async sessionFromCache(sessionId: string): Promise<SessionCache | null> {
    try {
      const v = await this.redis.client.get(`sess:${sessionId}`);
      return v ? (JSON.parse(v) as SessionCache) : null;
    } catch {
      return null;
    }
  }

  private async invalidateSession(sessionId: string): Promise<void> {
    await this.redis.client.del(`sess:${sessionId}`).catch(() => undefined);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

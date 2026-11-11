import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { inferError, type ErrorTypeCode } from '@aptiva/engine';
import { PrismaService } from '../common/prisma/prisma.service';
import type { ErrorFeedbackDto } from './dto';

/**
 * E-016 — error-cause feedback (PH5-T05, T-010, FR-006).
 * The student's report is the stored label; inference is recomputed on
 * every write and `conflict` flags rule/report disagreement.
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(private readonly prisma: PrismaService) {}

  async submitFeedback(userId: string, attemptId: string, dto: ErrorFeedbackDto) {
    const attempt = await this.prisma.questionAttempt.findUnique({
      where: { id: attemptId },
      include: { question: { select: { expectedTimeMs: true } } },
    });
    if (!attempt || attempt.userId !== userId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attempt not found' });
    }

    // Resolve the reported error type (code string or numeric id).
    const errorType =
      typeof dto.errorType === 'number'
        ? await this.prisma.errorType.findUnique({ where: { id: dto.errorType } })
        : await this.prisma.errorType.findUnique({ where: { code: dto.errorType } });
    if (!errorType) {
      throw new UnprocessableEntityException({
        code: 'UNKNOWN_ERROR_TYPE',
        message: 'Unknown error type',
      });
    }

    // Upsert the student report — idempotent and editable.
    await this.prisma.attemptErrorFeedback.upsert({
      where: { attemptId },
      create: {
        attemptId,
        errorTypeId: errorType.id,
        freeText: dto.freeText ?? null,
      },
      update: {
        errorTypeId: errorType.id,
        freeText: dto.freeText ?? null,
      },
    });

    // Recompute inference: report wins; rule supplies the conflict flag.
    const inference = inferError(
      {
        isCorrect: attempt.isCorrect ?? false,
        skipped: attempt.skipped,
        timeMs: attempt.timeMs,
        expectedTimeMs: attempt.question.expectedTimeMs,
        roundingSuspected: attempt.roundingSuspected,
      },
      errorType.code as ErrorTypeCode,
    );
    const inferredType = inference.errorType
      ? await this.prisma.errorType.findUnique({ where: { code: inference.errorType } })
      : null;

    await this.prisma.attemptErrorInference.upsert({
      where: { attemptId },
      create: {
        attemptId,
        errorTypeId: inferredType?.id ?? null,
        method: inference.method,
        confidence: inference.confidence,
        conflict: inference.conflict,
      },
      update: {
        errorTypeId: inferredType?.id ?? null,
        method: inference.method,
        confidence: inference.confidence,
        conflict: inference.conflict,
      },
    });

    return {
      attemptId,
      errorType: errorType.code,
      errorTypeLabel: errorType.label,
      method: inference.method,
      confidence: inference.confidence,
      conflict: inference.conflict,
    };
  }
}

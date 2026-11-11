import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { sanitizeContent, stemHash } from '../common/sanitize';
import type {
  BlueprintBody,
  BlueprintCreateDto,
  LessonUpdateDto,
  LessonUpsertDto,
  QuestionReviewDto,
  QuestionUpsertDto,
  QuestionListQuery,
} from './dto';

const QUESTION_INCLUDE = {
  topic: { select: { id: true, slug: true, name: true, level: true } },
  options: { orderBy: { orderNo: 'asc' as const } },
  reviews: {
    include: { reviewer: { select: { id: true, email: true, role: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
};

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

function constraintName(err: unknown): string {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.meta?.['constraint']?.toString() ?? '';
  }
  return '';
}

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------- questions

  async listQuestions(query: QuestionListQuery) {
    const where: Prisma.QuestionWhereInput = {
      ...(query.topicId ? { topicId: query.topicId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.format ? { format: query.format } : {}),
      ...(query.pool ? { pool: query.pool } : {}),
      ...(query.difficulty ? { difficultyPrior: query.difficulty } : {}),
      ...(query.q ? { stem: { contains: query.q, mode: 'insensitive' } } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        include: QUESTION_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: items.map((q) => this.toQuestionJson(q)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getQuestion(id: string) {
    const q = await this.prisma.question.findUnique({ where: { id }, include: QUESTION_INCLUDE });
    if (!q) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    return this.toQuestionJson(q);
  }

  async createQuestion(dto: QuestionUpsertDto) {
    const data = this.questionData(dto);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (data.status === 'published') {
          await this.assertPublishable(tx, dto, null);
        }
        const question = await tx.question.create({ data });
        await this.replaceOptions(tx, question.id, dto);
        return question;
      });
      return this.getQuestion(created.id);
    } catch (err) {
      throw this.mapQuestionError(err);
    }
  }

  async updateQuestion(id: string, dto: QuestionUpsertDto) {
    const existing = await this.prisma.question.findUnique({ where: { id } });
    if (!existing)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    if (existing.status === 'retired' && dto.status && dto.status !== 'retired') {
      throw new ConflictException({
        code: 'CONFLICT',
        message: 'Retired questions cannot be re-activated',
      });
    }
    // Preserve the current status when the payload doesn't set one —
    // otherwise every PUT would silently reset the question to draft.
    const effective: QuestionUpsertDto = {
      ...dto,
      status: (dto.status ?? existing.status) as QuestionUpsertDto['status'],
    };
    const data = this.questionData(effective);
    try {
      await this.prisma.$transaction(async (tx) => {
        if (data.status === 'published') {
          await this.assertPublishable(tx, effective, id);
        }
        await tx.question.update({ where: { id }, data });
        if (dto.options !== undefined) {
          await tx.questionOption.deleteMany({ where: { questionId: id } });
          await this.replaceOptions(tx, id, effective);
        }
      });
      return this.getQuestion(id);
    } catch (err) {
      throw this.mapQuestionError(err);
    }
  }

  /** E-061 — approve/reject with notes; same reviewer twice → 409. */
  async reviewQuestion(questionId: string, reviewerId: string, dto: QuestionReviewDto) {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    try {
      await this.prisma.questionReview.create({
        data: {
          questionId,
          reviewerId,
          decision: dto.decision,
          notes: dto.notes ?? null,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'This reviewer has already reviewed this question',
        });
      }
      throw err;
    }
    // First approval moves a draft to 'reviewed'.
    if (dto.decision === 'approve' && question.status === 'draft') {
      await this.prisma.question.update({
        where: { id: questionId },
        data: { status: 'reviewed' },
      });
    }
    await this.prisma.auditLog.create({
      data: {
        actorId: reviewerId,
        action: `question.review_${dto.decision}`,
        objectType: 'question',
        objectId: questionId,
      },
    });
    return this.getQuestion(questionId);
  }

  // -------------------------------------------------------- validation

  private questionData(dto: QuestionUpsertDto): Prisma.QuestionUncheckedCreateInput {
    const status = dto.status ?? 'draft';
    const stem = sanitizeContent(dto.stem);
    const base: Prisma.QuestionUncheckedCreateInput = {
      topicId: dto.topicId,
      format: dto.format,
      stem,
      solution: dto.solution != null ? sanitizeContent(dto.solution) : null,
      difficultyPrior: dto.difficultyPrior,
      expectedTimeMs: dto.expectedTimeMs,
      language: dto.language,
      pool: dto.pool,
      status,
      sourceName: dto.sourceName ?? null,
      author: dto.author ?? null,
      stemHash: stemHash(dto.stem),
      numericAnswer: dto.numericAnswer != null ? String(dto.numericAnswer) : null,
      answerFormat: dto.answerFormat ?? null,
      decimalPlaces: dto.decimalPlaces ?? null,
      tolerance: dto.tolerance != null ? String(dto.tolerance) : null,
    };
    return base;
  }

  /**
   * Publish rules (T-018), evaluated against the *effective* payload:
   * source required; exactly one correct option for MCQ; numeric_answer
   * required for numerical; diagnostic/reassessment pools additionally
   * need approvals from two distinct reviewers. Runs inside the write
   * transaction so the DB CHECK constraints stay a backstop, not the gate.
   */
  private async assertPublishable(
    tx: Prisma.TransactionClient,
    dto: QuestionUpsertDto,
    questionId: string | null,
  ): Promise<void> {
    const issues: string[] = [];
    if (!dto.sourceName) issues.push('source_name is required to publish');

    if (dto.format === 'mcq') {
      let correct: number;
      if (dto.options !== undefined) {
        correct = dto.options.filter((o) => o.isCorrect).length;
      } else if (questionId) {
        correct = await tx.questionOption.count({
          where: { questionId, isCorrect: true },
        });
      } else {
        correct = 0;
      }
      if (correct !== 1) issues.push('an MCQ needs exactly one correct option to publish');
    } else if (dto.numericAnswer == null) {
      issues.push('a numerical question needs numeric_answer to publish');
    }

    if (dto.pool === 'diagnostic' || dto.pool === 'reassessment') {
      const approvals = questionId
        ? await tx.questionReview.groupBy({
            by: ['reviewerId'],
            where: { questionId, decision: 'approve' },
          })
        : [];
      if (approvals.length < 2) {
        issues.push(`${dto.pool} pool items need approvals from two distinct reviewers`);
      }
    }

    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        code: 'PUBLISH_RULES',
        message: 'Question cannot be published',
        details: { issues },
      });
    }
  }

  private async replaceOptions(
    tx: Prisma.TransactionClient,
    questionId: string,
    dto: QuestionUpsertDto,
  ): Promise<void> {
    if (dto.format !== 'mcq' || !dto.options?.length) return;
    const correctCount = dto.options.filter((o) => o.isCorrect).length;
    if (correctCount > 1) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'At most one option may be marked correct',
        details: { issues: ['options: at most one is_correct'] },
      });
    }
    await tx.questionOption.createMany({
      data: dto.options.map((o, i) => ({
        questionId,
        text: sanitizeContent(o.text),
        isCorrect: o.isCorrect,
        trapTag: o.trapTag ?? null,
        orderNo: o.orderNo ?? i,
      })),
    });
  }

  private mapQuestionError(err: unknown): unknown {
    if (err instanceof UnprocessableEntityException) return err;
    if (isUniqueViolation(err)) {
      const constraint = constraintName(err);
      if (constraint.includes('uq_questions_hash')) {
        return new ConflictException({
          code: 'CONFLICT',
          message: 'A non-retired question with the same stem already exists',
        });
      }
      return new ConflictException({ code: 'CONFLICT', message: 'Duplicate value' });
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/numerical_needs_answer|published_needs_source|uq_one_correct/.test(msg)) {
      return new UnprocessableEntityException({
        code: 'PUBLISH_RULES',
        message: 'Question violates content constraints',
        details: { constraint: msg.slice(0, 200) },
      });
    }
    this.logger.error(`question write failed: ${msg}`);
    return err;
  }

  private toQuestionJson(q: Prisma.QuestionGetPayload<{ include: typeof QUESTION_INCLUDE }>) {
    return {
      id: q.id,
      topic: q.topic,
      format: q.format,
      stem: q.stem,
      solution: q.solution,
      difficultyPrior: q.difficultyPrior,
      eloRating: q.eloRating,
      expectedTimeMs: q.expectedTimeMs,
      language: q.language,
      numericAnswer: q.numericAnswer?.toString() ?? null,
      answerFormat: q.answerFormat,
      decimalPlaces: q.decimalPlaces,
      tolerance: q.tolerance?.toString() ?? null,
      pool: q.pool,
      status: q.status,
      sourceName: q.sourceName,
      author: q.author,
      llmAssisted: q.llmAssisted,
      stemHash: q.stemHash,
      createdAt: q.createdAt,
      updatedAt: q.updatedAt,
      options: q.options.map((o) => ({
        id: o.id,
        text: o.text,
        isCorrect: o.isCorrect,
        trapTag: o.trapTag,
        orderNo: o.orderNo,
      })),
      reviews: q.reviews.map((r) => ({
        id: r.id,
        reviewer: r.reviewer,
        decision: r.decision,
        notes: r.notes,
        createdAt: r.createdAt,
      })),
    };
  }

  // ---------------------------------------------------------- blueprints

  async listBlueprints() {
    const assessments = await this.prisma.assessment.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: { _count: { select: { sections: true } } },
        },
      },
    });
    return assessments.map((a) => ({
      id: a.id,
      slug: a.slug,
      company: a.company,
      name: a.name,
      versions: a.versions.map((v) => ({
        id: v.id,
        version: v.version,
        isCurrent: v.isCurrent,
        validFrom: v.validFrom,
        lastVerifiedAt: v.lastVerifiedAt,
        sectionCount: v._count.sections,
      })),
    }));
  }

  async getBlueprintDetail(assessmentId: string) {
    const a = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        versions: {
          orderBy: { version: 'desc' },
          include: {
            sources: true,
            sections: {
              orderBy: { orderNo: 'asc' },
              include: {
                source: true,
                weights: {
                  include: { topic: true, source: true },
                  orderBy: { share: 'desc' },
                },
              },
            },
          },
        },
      },
    });
    if (!a) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assessment not found' });
    return {
      id: a.id,
      slug: a.slug,
      company: a.company,
      name: a.name,
      versions: a.versions.map((v) => this.versionJson(v)),
    };
  }

  async createBlueprint(dto: BlueprintCreateDto) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const assessment = await tx.assessment.create({
          data: { slug: dto.slug, company: dto.company, name: dto.name },
        });
        await this.createVersion(assessment.id, 1, dto, tx);
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message: 'Assessment slug already exists',
        });
      }
      throw err;
    }
    const created = await this.prisma.assessment.findUniqueOrThrow({
      where: { slug: dto.slug },
    });
    return this.getBlueprintDetail(created.id);
  }

  /**
   * PH3-T10 — persist a drafter-produced blueprint as a non-current
   * version for admin review. Publishing happens later through the
   * normal PUT new-version flow (which flips isCurrent).
   */
  async createBlueprintDraft(dto: BlueprintCreateDto) {
    try {
      await this.prisma.$transaction(async (tx) => {
        const assessment = await tx.assessment.create({
          data: { slug: dto.slug, company: dto.company, name: dto.name },
        });
        await this.createVersion(assessment.id, 1, dto, tx, { isCurrent: false });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          code: 'CONFLICT',
          message:
            'Assessment slug already exists — draft a different company or delete the old one',
        });
      }
      throw err;
    }
    const created = await this.prisma.assessment.findUniqueOrThrow({
      where: { slug: dto.slug },
    });
    return this.getBlueprintDetail(created.id);
  }

  /** PUT creates a new immutable version; the previous current flips off. */
  async addBlueprintVersion(assessmentId: string, dto: BlueprintBody) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assessment not found' });
    const latest = await this.prisma.assessmentVersion.findFirst({
      where: { assessmentId },
      orderBy: { version: 'desc' },
    });
    const version = latest ? latest.version + 1 : 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.assessmentVersion.updateMany({
        where: { assessmentId, isCurrent: true },
        data: { isCurrent: false },
      });
      await this.createVersion(assessmentId, version, dto, tx);
    });
    return this.getBlueprintDetail(assessmentId);
  }

  private async createVersion(
    assessmentId: string,
    version: number,
    dto: BlueprintBody,
    db: Prisma.TransactionClient = this.prisma,
    opts: { isCurrent?: boolean } = {},
  ): Promise<string> {
    this.validateBlueprintBody(dto);
    const topicIds = await this.resolveTopicIds(dto, db);
    const versionRow = await db.assessmentVersion.create({
      data: {
        assessmentId,
        version,
        isCurrent: opts.isCurrent ?? true,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        lastVerifiedAt: dto.lastVerifiedAt ? new Date(dto.lastVerifiedAt) : null,
      },
    });
    const sourceIds: string[] = [];
    for (const s of dto.sources) {
      const row = await db.assessmentSource.create({
        data: {
          versionId: versionRow.id,
          sourceType: s.sourceType,
          reference: s.reference ?? null,
          confidence: s.confidence,
          lastVerifiedAt: s.lastVerifiedAt ? new Date(s.lastVerifiedAt) : null,
        },
      });
      sourceIds.push(row.id);
    }
    const src = (i?: number): string | null =>
      i != null && i < sourceIds.length ? (sourceIds[i] ?? null) : null;
    for (const s of dto.sections) {
      const section = await db.blueprintSection.create({
        data: {
          versionId: versionRow.id,
          name: s.name,
          orderNo: s.orderNo,
          durationMin: s.durationMin ?? null,
          questionCountMin: s.questionCountMin ?? null,
          questionCountMax: s.questionCountMax ?? null,
          negativeMarking: s.negativeMarking != null ? String(s.negativeMarking) : null,
          ...(s.formatMix ? { formatMix: s.formatMix } : {}),
          sourceId: src(s.sourceIndex),
        },
      });
      await db.blueprintTopicWeight.createMany({
        data: s.weights.map((w) => ({
          sectionId: section.id,
          topicId: topicIds.get(w.topicSlug)!,
          share: String(w.share),
          difficultyBand: w.difficultyBand ?? null,
          paceSeconds: w.paceSeconds ?? null,
          sourceId: src(w.sourceIndex),
        })),
      });
    }
    return versionRow.id;
  }

  private validateBlueprintBody(dto: BlueprintBody): void {
    const issues: string[] = [];
    for (const [i, s] of dto.sections.entries()) {
      for (const idx of [s.sourceIndex, ...s.weights.map((w) => w.sourceIndex)]) {
        if (idx != null && idx >= dto.sources.length) {
          issues.push(`sections[${i}]: sourceIndex ${idx} out of range`);
        }
      }
      const sum = s.weights.reduce((acc, w) => acc + w.share, 0);
      if (Math.abs(sum - 1) > 0.01) {
        issues.push(
          `sections[${i}] '${s.name}': topic shares sum to ${sum.toFixed(3)}, expected 1.0`,
        );
      }
      const slugs = s.weights.map((w) => w.topicSlug);
      if (new Set(slugs).size !== slugs.length) {
        issues.push(`sections[${i}] '${s.name}': duplicate topic weights`);
      }
    }
    if (issues.length > 0) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Invalid blueprint',
        details: { issues },
      });
    }
  }

  private async resolveTopicIds(
    dto: BlueprintBody,
    db: Prisma.TransactionClient = this.prisma,
  ): Promise<Map<string, string>> {
    const slugs = [...new Set(dto.sections.flatMap((s) => s.weights.map((w) => w.topicSlug)))];
    const topics = await db.topic.findMany({ where: { slug: { in: slugs } } });
    const map = new Map(topics.map((t) => [t.slug, t.id]));
    const missing = slugs.filter((s) => !map.has(s));
    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Unknown topic slugs',
        details: { issues: missing.map((m) => `unknown topic slug '${m}'`) },
      });
    }
    return map;
  }

  private versionJson(
    v: Prisma.AssessmentVersionGetPayload<{
      include: {
        sources: true;
        sections: {
          include: { source: true; weights: { include: { topic: true; source: true } } };
        };
      };
    }>,
  ) {
    return {
      id: v.id,
      version: v.version,
      isCurrent: v.isCurrent,
      validFrom: v.validFrom,
      lastVerifiedAt: v.lastVerifiedAt,
      sources: v.sources.map((s) => this.sourceJson(s)),
      sections: v.sections.map((s) => ({
        id: s.id,
        name: s.name,
        orderNo: s.orderNo,
        durationMin: s.durationMin,
        questionCountMin: s.questionCountMin,
        questionCountMax: s.questionCountMax,
        negativeMarking: s.negativeMarking?.toString() ?? null,
        formatMix: s.formatMix,
        source: s.source ? this.sourceJson(s.source) : null,
        weights: s.weights.map((w) => ({
          id: w.id,
          topic: { id: w.topic.id, slug: w.topic.slug, name: w.topic.name, level: w.topic.level },
          share: Number(w.share),
          difficultyBand: w.difficultyBand,
          paceSeconds: w.paceSeconds,
          source: w.source ? this.sourceJson(w.source) : null,
        })),
      })),
    };
  }

  private sourceJson(s: {
    id: string;
    sourceType: string;
    reference: string | null;
    confidence: string;
    lastVerifiedAt: Date | null;
  }) {
    return {
      id: s.id,
      sourceType: s.sourceType,
      reference: s.reference,
      confidence: s.confidence,
      lastVerifiedAt: s.lastVerifiedAt,
    };
  }

  // ------------------------------------------------- public (E-055/56)

  async listPublicAssessments() {
    const assessments = await this.prisma.assessment.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        versions: {
          where: { isCurrent: true },
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            sources: { select: { lastVerifiedAt: true, confidence: true } },
          },
        },
      },
    });
    return assessments.map((a) => {
      const v = a.versions[0];
      const verifiedDates = v?.sources.map((s) => s.lastVerifiedAt).filter(Boolean) ?? [];
      return {
        id: a.id,
        slug: a.slug,
        company: a.company,
        name: a.name,
        currentVersion: v
          ? {
              version: v.version,
              validFrom: v.validFrom,
              lastVerifiedAt:
                verifiedDates.length > 0
                  ? new Date(Math.max(...verifiedDates.map((d) => d!.getTime())))
                  : v.lastVerifiedAt,
            }
          : null,
      };
    });
  }

  async getPublicBlueprint(slug: string) {
    const a = await this.prisma.assessment.findUnique({
      where: { slug },
      include: {
        versions: {
          where: { isCurrent: true },
          orderBy: { version: 'desc' },
          take: 1,
          include: {
            sources: true,
            sections: {
              orderBy: { orderNo: 'asc' },
              include: {
                source: true,
                weights: { include: { topic: true, source: true }, orderBy: { share: 'desc' } },
              },
            },
          },
        },
      },
    });
    const version = a?.versions[0];
    if (!a || !version) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assessment not found' });
    }
    const detail = this.versionJson(version);
    const verifiedDates = version.sources.map((s) => s.lastVerifiedAt).filter(Boolean);
    return {
      assessment: { id: a.id, slug: a.slug, company: a.company, name: a.name },
      version: {
        ...detail,
        lastVerifiedAt:
          verifiedDates.length > 0
            ? new Date(Math.max(...verifiedDates.map((d) => d!.getTime())))
            : version.lastVerifiedAt,
      },
    };
  }

  /** Topic tree for admin pickers (P-20/P-21/P-23). */
  async listTopics() {
    const topics = await this.prisma.topic.findMany({
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
      include: { parent: { select: { id: true, slug: true, name: true } } },
    });
    return topics.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      level: t.level,
      parent: t.parent,
    }));
  }

  // ------------------------------------------------------------- lessons

  async listLessons(filters: { topicId?: string | undefined; status?: string | undefined }) {
    return this.prisma.lesson.findMany({
      where: {
        ...(filters.topicId ? { topicId: filters.topicId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: { topic: { select: { id: true, slug: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLesson(dto: LessonUpsertDto, actorId?: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id: dto.topicId } });
    if (!topic) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Topic not found' });
    return this.prisma.lesson.create({
      data: {
        topicId: dto.topicId,
        title: dto.title,
        content: sanitizeContent(dto.content),
        status: dto.status,
        ...(actorId ? { reviewedBy: actorId } : {}),
      },
      include: { topic: { select: { id: true, slug: true, name: true } } },
    });
  }

  async updateLesson(id: string, dto: LessonUpdateDto) {
    const existing = await this.prisma.lesson.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Lesson not found' });
    return this.prisma.lesson.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.content !== undefined ? { content: sanitizeContent(dto.content) } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.topicId !== undefined ? { topicId: dto.topicId } : {}),
        ...(dto.reviewedBy !== undefined ? { reviewedBy: dto.reviewedBy } : {}),
      },
      include: { topic: { select: { id: true, slug: true, name: true } } },
    });
  }
}

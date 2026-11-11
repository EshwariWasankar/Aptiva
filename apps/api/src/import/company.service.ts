import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  computeFit,
  difficultyProximity,
  draftBlueprintFromRecords,
  fetchGitHubRepo,
  formatShare,
  mapTopicText,
  normalisePhrase,
  parseDs07File,
  DS07_PARSER_VERSION,
  type MappedRecord,
} from '@aptiva/ingest';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { ContentService } from '../content/content.service';
import type { BlueprintDraftDto, CompanyImportDto, PatternMapDto } from './dto';

const DS07_REPO = 'abhishukla0807-dev/preperation-hub';
const DS08_REPO = 'Aftabkhan78621/Company_Wise_Placement_Resources';

@Injectable()
export class CompanyService {
  private readonly logger = new Logger(CompanyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly content: ContentService,
  ) {}

  /** E-067 — extract pattern records (DS-07) or coverage list (DS-08). */
  async runCompanyImport(dto: CompanyImportDto, actorId: string) {
    if (dto.source === 'ds-08') return this.ds08Coverage(dto);
    return this.ds07Import(dto, actorId);
  }

  // ---------------------------------------------------------- DS-07

  private async ds07Import(dto: CompanyImportDto, actorId: string) {
    const snap = await fetchGitHubRepo(DS07_REPO, dto.ref ?? 'main', { prefix: 'Companies' });
    const companyFilter = dto.company?.toLowerCase();

    const records: (ReturnType<typeof parseDs07File>['records'][number] & {
      sourceCommit: string;
    })[] = [];
    const rejectedFiles: { sourcePath: string; reason: string }[] = [];
    const companies = new Set<string>();

    for (const f of snap.files) {
      const { records: recs, rejected } = parseDs07File(f.path, f.content);
      rejectedFiles.push(...rejected);
      for (const r of recs) {
        if (companyFilter && !r.company.toLowerCase().includes(companyFilter)) continue;
        companies.add(r.company);
        records.push({ ...r, sourceCommit: snap.commit });
      }
    }

    // Classify: resolve topic_text through synonyms + taxonomy.
    const mapper = await this.mapperInput();
    const mapped = records.map((r) => ({
      ...r,
      topicId: mapTopicText(r.topicText, mapper),
      topicSlug: null as string | null,
    }));
    for (const m of mapped) {
      if (m.topicId) {
        m.topicSlug = mapper.topics.find((t) => t.id === m.topicId)?.slug ?? null;
      }
    }
    const unmapped = new Map<string, number>();
    for (const m of mapped) {
      if (m.topicText && !m.topicId) {
        const k = normalisePhrase(m.topicText);
        unmapped.set(k, (unmapped.get(k) ?? 0) + 1);
      }
    }

    const summary = {
      dryRun: dto.dryRun,
      source: 'ds-07',
      sourceRef: `github:${DS07_REPO}@${snap.commit}`,
      commit: snap.commit,
      filesSeen: snap.files.length,
      companies: [...companies].sort(),
      recordsFound: records.length,
      mapped: mapped.filter((m) => m.topicId).length,
      unmappedPhrases: [...unmapped.entries()].map(([phrase, count]) => ({ phrase, count })),
      rejectedFiles,
    };
    if (dto.dryRun) return summary;

    const batch = await this.prisma.$transaction(async (tx) => {
      const b = await tx.importBatch.create({
        data: {
          sourceName: 'DS-07 preperation-hub',
          sourceRef: summary.sourceRef,
          parserVersion: DS07_PARSER_VERSION,
          accepted: records.length,
          rejected: rejectedFiles.length,
          duplicates: 0,
          createdBy: actorId,
        },
      });
      await tx.companyPatternRecord.createMany({
        data: mapped.map((r) => ({
          importBatchId: b.id,
          company: r.company,
          roundName: r.roundName,
          sectionName: r.sectionName,
          topicText: r.topicText,
          topicId: r.topicId,
          questionCount: r.questionCount,
          minutes: r.minutes,
          negativeMarking: r.negativeMarking,
          difficultyNote: r.difficultyNote,
          sourcePath: r.sourcePath,
          sourceCommit: r.sourceCommit,
          status: r.topicId ? 'mapped' : 'extracted',
        })),
      });
      return b;
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'company_import.run',
        objectType: 'import_batch',
        objectId: batch.id,
        details: { source: 'ds-07', records: records.length },
      },
    });
    return { ...summary, batchId: batch.id };
  }

  // ---------------------------------------------------------- DS-08

  /**
   * DS-08 is reference-only: derive the company coverage list from the
   * Company_Wise_Aptitude PDF filenames. No records, no questions.
   */
  private async ds08Coverage(dto: CompanyImportDto) {
    const snap = await fetchGitHubRepo(DS08_REPO, dto.ref ?? 'main', {
      prefix: 'Company_Wise_Aptitude',
    });
    const companies = new Set<string>();
    for (const f of snap.files) {
      const base = f.path.split('/').pop() ?? '';
      if (!base.toLowerCase().endsWith('.pdf')) continue;
      const stem = base
        .replace(/\.pdf$/i, '')
        .replace(/_\d+_Questions$/i, '')
        .replace(/_Aptitude(_Reasoning)?$/i, '')
        .trim();
      if (stem) companies.add(stem);
    }
    return {
      dryRun: dto.dryRun,
      source: 'ds-08',
      sourceRef: `github:${DS08_REPO}@${snap.commit}`,
      commit: snap.commit,
      filesSeen: snap.files.length,
      companies: [...companies].sort(),
      note: 'DS-08 is coverage reference only — no pattern records or questions are imported (Section 14.1).',
    };
  }

  // ------------------------------------------------ E-068 queue

  async listPatterns(query: { company?: string; status?: string; unmapped?: boolean }) {
    const where: Prisma.CompanyPatternRecordWhereInput = {
      ...(query.company ? { company: { contains: query.company, mode: 'insensitive' } } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.unmapped ? { topicId: null, topicText: { not: null } } : {}),
    };
    const records = await this.prisma.companyPatternRecord.findMany({
      where,
      include: {
        topic: { select: { id: true, slug: true, name: true } },
        importBatch: { select: { id: true, sourceRef: true } },
      },
      orderBy: [{ company: 'asc' }, { sectionName: 'asc' }, { createdAt: 'asc' }],
      take: 500,
    });
    // Unmapped phrase counts for the queue header.
    const grouped = await this.prisma.companyPatternRecord.groupBy({
      by: ['topicText'],
      where: { topicId: null, topicText: { not: null }, status: { not: 'rejected' } },
      _count: { _all: true },
    });
    return {
      items: records.map((r) => ({
        id: r.id,
        company: r.company,
        roundName: r.roundName,
        sectionName: r.sectionName,
        topicText: r.topicText,
        topic: r.topic,
        questionCount: r.questionCount,
        minutes: r.minutes,
        negativeMarking: r.negativeMarking,
        difficultyNote: r.difficultyNote,
        sourcePath: r.sourcePath,
        sourceCommit: r.sourceCommit,
        status: r.status,
        importBatchId: r.importBatchId,
        sourceRef: r.importBatch.sourceRef,
      })),
      unmappedPhrases: grouped
        .filter((g) => g.topicText)
        .map((g) => ({ phrase: g.topicText, count: g._count._all })),
    };
  }

  // ------------------------------------------------ E-069 map

  async mapPattern(id: string, dto: PatternMapDto, actorId: string) {
    const record = await this.prisma.companyPatternRecord.findUnique({ where: { id } });
    if (!record)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Pattern record not found' });

    if (dto.reject) {
      await this.prisma.companyPatternRecord.update({
        where: { id },
        data: { status: 'rejected' },
      });
      return { id, status: 'rejected' };
    }

    if (!dto.topicSlug) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'topicSlug is required',
      });
    }
    const topic = await this.prisma.topic.findUnique({ where: { slug: dto.topicSlug } });
    if (!topic) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `Unknown topic slug '${dto.topicSlug}'`,
      });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.companyPatternRecord.update({
        where: { id },
        data: { topicId: topic.id, status: 'mapped' },
      });
      // Mapping a phrase teaches the synonym table and retro-fits sibling
      // records carrying the same normalised topic_text.
      if (record.topicText) {
        const phrase = normalisePhrase(record.topicText);
        await tx.topicSynonym.upsert({
          where: { phrase },
          create: { phrase, topicId: topic.id },
          update: { topicId: topic.id },
        });
        if (dto.addSynonym !== false) {
          await tx.companyPatternRecord.updateMany({
            where: {
              topicText: { equals: record.topicText, mode: 'insensitive' },
              status: { in: ['extracted', 'mapped'] },
            },
            data: { topicId: topic.id, status: 'mapped' },
          });
        }
      }
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'company_pattern.map',
        objectType: 'company_pattern_record',
        objectId: id,
        details: { topicSlug: dto.topicSlug },
      },
    });
    return { id, status: 'mapped', topicId: topic.id };
  }

  // --------------------------------------- PH3-T10 draft blueprint

  async draftBlueprint(dto: BlueprintDraftDto) {
    const records = await this.prisma.companyPatternRecord.findMany({
      where: {
        company: { equals: dto.company, mode: 'insensitive' },
        status: { in: ['mapped', 'used'] },
        topicId: { not: null },
        ...(dto.importBatchId ? { importBatchId: dto.importBatchId } : {}),
      },
      include: { topic: { select: { slug: true } } },
      orderBy: { createdAt: 'asc' },
    });
    if (records.length === 0) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: `No mapped pattern records for company '${dto.company}' — run E-067 and map phrases via E-069 first`,
      });
    }

    const mapped: MappedRecord[] = records.map((r) => ({
      company: r.company,
      roundName: r.roundName,
      sectionName: r.sectionName,
      topicText: r.topicText,
      topicId: r.topicId,
      topicSlug: r.topic?.slug ?? null,
      questionCount: r.questionCount,
      minutes: r.minutes,
      negativeMarking: r.negativeMarking,
      difficultyNote: r.difficultyNote,
      sourcePath: r.sourcePath,
      sourceCommit: r.sourceCommit,
    }));

    const draft = draftBlueprintFromRecords(dto.company, mapped, { commit: '' });
    // The drafter only sees mapped records; count the still-unmapped ones
    // for the review UI.
    draft.unmappedCount = await this.prisma.companyPatternRecord.count({
      where: {
        company: { equals: dto.company, mode: 'insensitive' },
        topicId: null,
        topicText: { not: null },
        status: { not: 'rejected' },
      },
    });
    if (draft.sections.every((s) => s.weights.length === 0)) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Records produced no topic weights — map more phrases first',
      });
    }

    // Convert drafter output into the BlueprintCreateDto shape.
    const body = {
      slug: draft.slug,
      company: draft.company,
      name: draft.name,
      validFrom: draft.validFrom,
      lastVerifiedAt: null,
      sources: draft.sources.map((s) => ({
        sourceType: s.sourceType,
        reference: s.reference,
        confidence: s.confidence,
        lastVerifiedAt: s.lastVerifiedAt,
      })),
      sections: draft.sections.map((s) => ({
        name: s.name,
        orderNo: s.orderNo,
        durationMin: s.durationMin,
        questionCountMin: s.questionCountMin,
        questionCountMax: s.questionCountMax,
        negativeMarking: s.negativeMarking,
        formatMix: s.formatMix,
        sourceIndex: s.sourceIndex,
        weights: s.weights.map((w) => ({
          topicSlug: w.topicSlug,
          share: w.share,
          difficultyBand: w.difficultyBand,
          paceSeconds: w.paceSeconds,
          sourceIndex: w.sourceIndex,
        })),
      })),
    };

    const detail = await this.content.createBlueprintDraft(body);
    return { draft, blueprint: detail };
  }

  // ------------------------------------------------ PH3-T11 fit job

  /**
   * Recompute question_assessment_tags for an assessment's current
   * version: fit = topic share × format match × difficulty proximity.
   * Idempotent — deletes and rewrites the section's tags each run.
   */
  async recomputeFitTags(assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        versions: {
          where: { isCurrent: true },
          include: {
            sections: {
              include: {
                weights: true,
              },
            },
          },
        },
      },
    });
    if (!assessment)
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assessment not found' });
    const version = assessment.versions[0];
    if (!version) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Assessment has no current version',
      });
    }
    const sectionIds = version.sections.map((s) => s.id);
    if (sectionIds.length === 0) {
      return { assessmentId, sections: 0, tags: 0 };
    }

    const questions = await this.prisma.question.findMany({
      where: { status: 'published' },
      select: { id: true, topicId: true, format: true, difficultyPrior: true },
    });

    const tags: { questionId: string; sectionId: string; fit: number; basis: string }[] = [];
    for (const section of version.sections) {
      const weightByTopic = new Map(section.weights.map((w) => [w.topicId, w]));
      for (const q of questions) {
        const w = weightByTopic.get(q.topicId);
        const topicShare = w ? Number(w.share) : 0;
        const fit = computeFit({
          topicShare,
          formatShare: formatShare(
            section.formatMix as { mcq?: number; numerical?: number } | null,
            q.format as 'mcq' | 'numerical',
          ),
          difficultyProximity: difficultyProximity(q.difficultyPrior, w?.difficultyBand ?? null),
        });
        tags.push({ questionId: q.id, sectionId: section.id, fit, basis: 'topic_match' });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.questionAssessmentTag.deleteMany({ where: { sectionId: { in: sectionIds } } });
      for (let i = 0; i < tags.length; i += 1000) {
        await tx.questionAssessmentTag.createMany({ data: tags.slice(i, i + 1000) });
      }
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: null,
        action: 'fit_tags.recompute',
        objectType: 'assessment',
        objectId: assessmentId,
        details: { sections: sectionIds.length, tags: tags.length },
      },
    });
    return { assessmentId, sections: sectionIds.length, tags: tags.length };
  }

  private async mapperInput() {
    const [synonyms, topics] = await Promise.all([
      this.prisma.topicSynonym.findMany(),
      this.prisma.topic.findMany({ select: { id: true, slug: true, name: true } }),
    ]);
    return {
      synonyms: new Map(synonyms.map((s) => [s.phrase, s.topicId])),
      topics,
    };
  }
}

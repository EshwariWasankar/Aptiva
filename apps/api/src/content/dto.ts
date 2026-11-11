import { z } from 'zod';

/** Request schemas for E-060, E-061, E-064, E-065 (playbook Section 11). */

const Uuid = z.string().uuid();
/** Accepts a finite number or a plain decimal string (rejects 'abc'). */
const NumericLike = z.union([
  z.number().finite(),
  z.string().regex(/^-?\d+(\.\d+)?$/, 'must be a number'),
]);

export const QuestionStatusSchema = z.enum(['draft', 'reviewed', 'published', 'retired']);
export const QuestionFormatSchema = z.enum(['mcq', 'numerical']);
export const QuestionPoolSchema = z.enum(['diagnostic', 'practice', 'reassessment']);

export const QuestionOptionInputSchema = z.object({
  id: Uuid.optional(),
  text: z.string().min(1).max(4000),
  isCorrect: z.boolean(),
  trapTag: z.string().max(120).nullish(),
  orderNo: z.number().int().min(0).max(100).optional(),
});
export type QuestionOptionInput = z.infer<typeof QuestionOptionInputSchema>;

export const QuestionUpsertSchema = z.object({
  topicId: Uuid,
  format: QuestionFormatSchema.default('mcq'),
  stem: z.string().min(1).max(20000),
  solution: z.string().max(40000).nullish(),
  difficultyPrior: z.number().int().min(1).max(3),
  expectedTimeMs: z.number().int().min(1000).max(3_600_000),
  language: z.string().min(2).max(10).default('en'),
  pool: QuestionPoolSchema.default('practice'),
  status: QuestionStatusSchema.optional(),
  sourceName: z.string().max(300).nullish(),
  author: z.string().max(200).nullish(),
  numericAnswer: NumericLike.nullish(),
  answerFormat: z.enum(['integer', 'decimal']).nullish(),
  decimalPlaces: z.number().int().min(0).max(10).nullish(),
  tolerance: NumericLike.nullish(),
  options: z.array(QuestionOptionInputSchema).max(10).optional(),
});
export type QuestionUpsertDto = z.infer<typeof QuestionUpsertSchema>;

export const QuestionReviewSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  notes: z.string().max(4000).nullish(),
});
export type QuestionReviewDto = z.infer<typeof QuestionReviewSchema>;

export const QuestionListQuerySchema = z.object({
  topicId: Uuid.optional(),
  status: QuestionStatusSchema.optional(),
  format: QuestionFormatSchema.optional(),
  pool: QuestionPoolSchema.optional(),
  difficulty: z.coerce.number().int().min(1).max(3).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type QuestionListQuery = z.infer<typeof QuestionListQuerySchema>;

// ------------------------------------------------------------- blueprints

export const SourceTypeSchema = z.enum([
  'official',
  'public',
  'candidate_reported',
  'pattern_inferred',
  'assumption',
]);
export const ConfidenceSchema = z.enum(['low', 'medium', 'high']);

export const BlueprintSourceInputSchema = z.object({
  sourceType: SourceTypeSchema,
  reference: z.string().max(500).nullish(),
  confidence: ConfidenceSchema,
  lastVerifiedAt: z.string().date().nullish(),
});
export type BlueprintSourceInput = z.infer<typeof BlueprintSourceInputSchema>;

export const BlueprintWeightInputSchema = z.object({
  topicSlug: z.string().min(1).max(120),
  share: z.number().min(0).max(1),
  difficultyBand: z.number().int().min(1).max(3).nullish(),
  paceSeconds: z.number().int().min(1).max(7200).nullish(),
  sourceIndex: z.number().int().min(0).optional(),
});
export type BlueprintWeightInput = z.infer<typeof BlueprintWeightInputSchema>;

export const BlueprintSectionInputSchema = z.object({
  name: z.string().min(1).max(200),
  orderNo: z.number().int().min(1).max(50),
  durationMin: z.number().int().min(1).max(600).nullish(),
  questionCountMin: z.number().int().min(1).max(500).nullish(),
  questionCountMax: z.number().int().min(1).max(500).nullish(),
  negativeMarking: z.number().min(0).max(4).nullish(),
  formatMix: z
    .object({ mcq: z.number().min(0).max(1), numerical: z.number().min(0).max(1) })
    .nullish(),
  sourceIndex: z.number().int().min(0).optional(),
  weights: z.array(BlueprintWeightInputSchema).min(1).max(50),
});
export type BlueprintSectionInput = z.infer<typeof BlueprintSectionInputSchema>;

export const BlueprintBodySchema = z.object({
  validFrom: z.string().date().optional(),
  lastVerifiedAt: z.string().date().nullish(),
  sources: z.array(BlueprintSourceInputSchema).min(1).max(20),
  sections: z.array(BlueprintSectionInputSchema).min(1).max(20),
});
export type BlueprintBody = z.infer<typeof BlueprintBodySchema>;

export const BlueprintCreateSchema = BlueprintBodySchema.extend({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/, 'slug must be kebab-case'),
  company: z.string().min(1).max(200),
  name: z.string().min(1).max(300),
});
export type BlueprintCreateDto = z.infer<typeof BlueprintCreateSchema>;

// ---------------------------------------------------------------- lessons

export const LessonUpsertSchema = z.object({
  topicId: Uuid,
  title: z.string().min(1).max(300),
  content: z.string().min(1).max(100000),
  status: z.enum(['draft', 'published']).default('draft'),
});
export type LessonUpsertDto = z.infer<typeof LessonUpsertSchema>;

export const LessonUpdateSchema = LessonUpsertSchema.partial().extend({
  reviewedBy: Uuid.nullish(),
});
export type LessonUpdateDto = z.infer<typeof LessonUpdateSchema>;

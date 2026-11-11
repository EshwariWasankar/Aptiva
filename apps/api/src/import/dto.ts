import { z } from 'zod';

/** E-062 — POST /admin/import */
export const ImportRunSchema = z.object({
  source: z.enum(['ds-01', 'ds-03']),
  /** Optional pinned ref (branch/tag/SHA); defaults to repo default branch. */
  ref: z.string().min(1).max(100).optional(),
  dryRun: z.boolean().default(true),
});
export type ImportRunDto = z.infer<typeof ImportRunSchema>;

/** E-067 — POST /admin/company-imports */
export const CompanyImportSchema = z.object({
  source: z.enum(['ds-07', 'ds-08']),
  /** Optional company filter for DS-07 (folder suffix, e.g. "TCS"). */
  company: z.string().min(1).max(80).optional(),
  ref: z.string().min(1).max(100).optional(),
  dryRun: z.boolean().default(true),
});
export type CompanyImportDto = z.infer<typeof CompanyImportSchema>;

/** E-069 — POST /admin/company-patterns/:id/map */
export const PatternMapSchema = z
  .object({
    /** Map to an existing topic slug. */
    topicSlug: z.string().min(1).max(120).optional(),
    /** Reject the record/phrase. */
    reject: z.boolean().optional(),
    /** Also upsert a topic_synonyms row for this phrase → topic. */
    addSynonym: z.boolean().optional(),
  })
  .refine((v) => (v.topicSlug != null) !== (v.reject === true), {
    message: 'provide exactly one of topicSlug or reject',
  });
export type PatternMapDto = z.infer<typeof PatternMapSchema>;

/** POST /admin/blueprints/draft-from-records */
export const BlueprintDraftSchema = z.object({
  company: z.string().min(1).max(80),
  /** Restrict to records from this import batch (optional). */
  importBatchId: z.string().uuid().optional(),
});
export type BlueprintDraftDto = z.infer<typeof BlueprintDraftSchema>;

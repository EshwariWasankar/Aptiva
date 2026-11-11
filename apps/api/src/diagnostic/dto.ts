import { z } from 'zod';
import { AttemptSubmitSchema } from '../attempts/dto';

/** E-010 — POST /diagnostics */
export const DiagnosticCreateSchema = z.object({
  mode: z.enum(['standard', 'express']).default('standard'),
});
export type DiagnosticCreateDto = z.infer<typeof DiagnosticCreateSchema>;

/** E-014 — submit accepts the client-held attempt ids for the barrier. */
export const DiagnosticSubmitSchema = z.object({
  attemptIds: z.array(z.string().uuid()).max(100).optional(),
});
export type DiagnosticSubmitDto = z.infer<typeof DiagnosticSubmitSchema>;

/** E-016 — PUT /attempts/:attemptId/error-feedback */
export const ErrorFeedbackSchema = z.object({
  /** error-type code (e.g. 'concept') or numeric id */
  errorType: z.union([z.string().min(1).max(40), z.number().int().positive()]),
  freeText: z.string().max(1000).nullish(),
});
export type ErrorFeedbackDto = z.infer<typeof ErrorFeedbackSchema>;

export { AttemptSubmitSchema };

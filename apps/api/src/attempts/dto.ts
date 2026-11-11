import { z } from 'zod';

/** E-040 — POST /sessions */
export const SessionCreateSchema = z.object({
  kind: z.enum(['practice', 'check', 'topic_test', 'mock']).default('practice'),
  planItemId: z.string().uuid().optional(),
  plannedMinutes: z.number().int().positive().max(600).optional(),
  topicId: z.string().uuid().optional(),
  minutes: z.number().int().positive().max(600).optional(),
});
export type SessionCreateDto = z.infer<typeof SessionCreateSchema>;

/** E-041 body — client-generated attemptId is the idempotency key.
 *  Unknown keys (e.g. client clocks) are stripped, never trusted. */
export const AttemptSubmitSchema = z.object({
  attemptId: z.string().uuid(),
  selectedOptionId: z.string().uuid().nullish(),
  numericInput: z.string().max(60).nullish(),
  skipped: z.boolean().default(false),
  answerChanges: z.number().int().min(0).max(100).default(0),
  revisitCount: z.number().int().min(0).max(100).default(0),
});
export type AttemptSubmitDto = z.infer<typeof AttemptSubmitSchema>;

/** Re-ingest payload: the normal attempt body plus the question id. */
export const BarrierAttemptSchema = AttemptSubmitSchema.extend({
  questionId: z.string().uuid(),
});
export type BarrierAttemptDto = z.infer<typeof BarrierAttemptSchema>;

/** E-042 — flush barrier. attemptIds alone can't be re-ingested; full
 *  attempt payloads are re-submitted through the normal path. */
export const SessionFinishSchema = z.object({
  attemptIds: z.array(z.string().uuid()).max(1000).optional(),
  attempts: z.array(BarrierAttemptSchema).max(1000).optional(),
});
export type SessionFinishDto = z.infer<typeof SessionFinishSchema>;

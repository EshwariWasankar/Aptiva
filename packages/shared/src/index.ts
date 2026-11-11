import { z } from 'zod';

/**
 * Shared API envelope and error shapes (playbook Section 11.1).
 * Consumed by apps/api (authoritative validation) and apps/web (parsing).
 */

export const ApiErrorCode = z.enum([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'INTERNAL',
  'SERVICE_UNAVAILABLE',
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiErrorBodySchema = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const SuccessMetaSchema = z.object({
  requestId: z.string(),
});
export type SuccessMeta = z.infer<typeof SuccessMetaSchema>;

export const HealthDataSchema = z.object({
  status: z.literal('ok'),
});
export type HealthData = z.infer<typeof HealthDataSchema>;

export function successEnvelope<T extends z.ZodType>(data: T) {
  return z.object({
    data,
    meta: SuccessMetaSchema,
  });
}

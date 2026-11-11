import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Parse a request body against a zod schema → 400 VALIDATION_FAILED. */
export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Invalid request body',
      details: { issues: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
    });
  }
  return result.data;
}

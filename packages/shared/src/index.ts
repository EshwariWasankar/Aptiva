/**
 * Aptiva Shared - Single source of truth for schemas and types
 * 
 * This package contains zod schemas, DTO types, enums, and OpenAPI types
 * used by both web and API.
 */

import { z } from 'zod';

// Simple schema to prove workspace linking
export const helloSchema = z.object({
  message: z.string(),
});

export type HelloInput = z.infer<typeof helloSchema>;

export function helloShared(): string {
  return 'Shared package initialized';
}

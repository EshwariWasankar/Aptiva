import { z } from 'zod';

/**
 * Typed configuration module (playbook Sections 10.2, 27.1).
 * Validates environment variables at start-up; the app refuses to start on
 * missing required values and reports every invalid variable at once.
 */

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  ENGINE_VERSION: z.string().default('0.0.0'),
  // PH-1 identity — required from this phase on.
  JWT_ACCESS_SECRET: z.string().min(16, 'JWT_ACCESS_SECRET must be at least 16 chars'),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_DOMAIN: z.string().default('localhost'),
  NOTICE_VERSION: z.string().default('2026-11'),
  WEB_BASE_URL: z.string().default('http://localhost:3000'),
  // Optional integrations (parsed when set).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default('http://localhost:4000/api/v1/auth/google/callback'),
  EMAIL_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  PLANNER_BUDGET_MS: z.coerce.number().int().positive().optional(),
  STREAM_BATCH_MAX: z.coerce.number().int().positive().default(100),
  STREAM_BATCH_MS: z.coerce.number().int().positive().default(1000),
  FLUSH_BARRIER_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  ATTEMPT_STREAM: z.string().default('aptiva:attempts'),
  ATTEMPT_GROUP: z.string().default('attempt-writers'),
  ATTEMPT_DEADLETTER_STREAM: z.string().default('aptiva:attempts:deadletter'),
  ATTEMPT_CONSUMER_ENABLED: z.enum(['true', 'false']).default('true'),
  ATTEMPT_MIN_IDLE_MS: z.coerce.number().int().positive().default(30_000),
  PAYMENT_KEY_ID: z.string().optional(),
  PAYMENT_KEY_SECRET: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
  // Multiplies every rate-limit ceiling. Tests raise it so a fast suite
  // doesn't trip the 10/min auth bucket; production leaves it unset (1).
  RATE_LIMIT_FACTOR: z.coerce.number().positive().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const ENV = Symbol('APTIVA_ENV');

/** Parse and validate a raw env record. Throws listing every problem. */
export function parseEnv(source: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}

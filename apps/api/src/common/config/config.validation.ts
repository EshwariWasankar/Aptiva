import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

class EnvironmentVariables {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;

  DATABASE_URL: string;
  REDIS_URL: string;

  JWT_ACCESS_SECRET: string;
  JWT_ACCESS_TTL_SECONDS: number;
  REFRESH_TOKEN_TTL_DAYS: number;
  COOKIE_DOMAIN: string;
  CORS_ORIGINS: string;

  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;

  EMAIL_API_KEY?: string;
  EMAIL_FROM?: string;

  S3_ENDPOINT?: string;
  S3_BUCKET?: string;
  S3_ACCESS_KEY?: string;
  S3_SECRET_KEY?: string;

  SENTRY_DSN?: string;
  POSTHOG_KEY?: string;

  PLANNER_BUDGET_MS: number;
  STREAM_BATCH_MAX: number;
  STREAM_BATCH_MS: number;
  FLUSH_BARRIER_TIMEOUT_MS: number;
  ENGINE_VERSION: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Configuration validation error: ${errors.toString()}`);
  }

  return validatedConfig;
}

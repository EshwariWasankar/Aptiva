import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/common/config/env';

const VALID = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
  JWT_ACCESS_SECRET: 'test-secret-at-least-16-chars',
};

describe('parseEnv', () => {
  it('returns parsed config with defaults for a valid minimal env', () => {
    const env = parseEnv(VALID);
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.CORS_ORIGINS).toBe('http://localhost:3000');
    expect(env.DATABASE_URL).toBe(VALID.DATABASE_URL);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30);
  });

  it('coerces PORT and numeric optionals', () => {
    const env = parseEnv({ ...VALID, PORT: '5000', PLANNER_BUDGET_MS: '250' });
    expect(env.PORT).toBe(5000);
    expect(env.PLANNER_BUDGET_MS).toBe(250);
  });

  it('fails fast listing every missing required variable', () => {
    expect(() => parseEnv({})).toThrowError(/DATABASE_URL/);
    expect(() => parseEnv({})).toThrowError(/REDIS_URL/);
    expect(() => parseEnv({})).toThrowError(/JWT_ACCESS_SECRET/);
  });

  it('rejects a JWT secret shorter than 16 chars', () => {
    expect(() => parseEnv({ ...VALID, JWT_ACCESS_SECRET: 'short' })).toThrowError(
      /JWT_ACCESS_SECRET/,
    );
  });

  it('rejects invalid NODE_ENV', () => {
    expect(() => parseEnv({ ...VALID, NODE_ENV: 'prod' })).toThrowError(/NODE_ENV/);
  });
});

import { defineConfig } from 'vitest/config';

/**
 * Integration tests run against real PostgreSQL and Redis (playbook Section 24).
 * Requires DATABASE_URL and REDIS_URL pointing at running services
 * (infra/docker-compose.yml locally, service containers in CI).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.int.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration files share one database; run sequentially.
    fileParallelism: false,
  },
});

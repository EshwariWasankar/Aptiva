import { defineConfig } from '@playwright/test';

/**
 * PH-5 e2e (T-004 keyboard pass). Expects the dev stack running:
 *   web  http://localhost:3000   api  http://localhost:4000
 * Run: pnpm --filter @aptiva/web test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

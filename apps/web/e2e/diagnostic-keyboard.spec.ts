import { expect, test } from '@playwright/test';

/**
 * T-004 — keyboard-only diagnostic flow (P-06 → P-07 → P-08 → P-09).
 * Requires a running stack and a student account seeded via
 * E2E_EMAIL / E2E_PASSWORD (defaults to the local dev admin).
 */

const EMAIL = process.env.E2E_EMAIL ?? 'admin@aptiva.local';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Admin-pass-123!';

test('keyboard-only diagnostic: intro → runner → result → review', async ({ page }) => {
  // ---- login (P-01 form) ----
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(EMAIL);
  await page.getByLabel(/password/i).fill(PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 15_000 });

  // ---- P-06 intro ----
  await page.goto('/onboarding/diagnostic');
  await expect(page.getByRole('heading', { name: /setup diagnostic/i })).toBeVisible();

  // If a diagnostic is already in progress, resume it; otherwise start express.
  const resume = page.getByRole('button', { name: /resume diagnostic/i });
  const startExpress = page.getByRole('button', { name: /start express diagnostic/i });
  if (await resume.isVisible().catch(() => false)) {
    await resume.click();
  } else {
    await startExpress.click();
  }
  await expect(page).toHaveURL(/\/diagnostic\/[0-9a-f-]{36}/, { timeout: 15_000 });

  // ---- P-07 runner: answer every question with keyboard only ----
  const next = page.getByRole('button', { name: /next|skip & next|answer & next/i });
  for (let i = 0; i < 15; i++) {
    const done = await page.getByRole('heading', { name: /all questions answered/i }).isVisible();
    if (done) break;
    // Prefer a real answer when an option is focused-able: Tab to first radio,
    // Space to select, then activate Next.
    const radio = page.locator('input[type="radio"]').first();
    if (await radio.count()) {
      await radio.focus();
      await page.keyboard.press('Space');
    }
    await next.focus();
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
  }

  // ---- submit → P-08 result (polls until computed) ----
  const submit = page.getByRole('button', { name: /submit diagnostic/i });
  await expect(submit).toBeVisible({ timeout: 10_000 });
  await submit.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/result/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /diagnostic result/i })).toBeVisible({
    timeout: 60_000,
  });

  // ---- P-09 review ----
  const review = page.getByRole('button', { name: /review mistakes/i });
  if (await review.isVisible().catch(() => false)) {
    await review.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/review/, { timeout: 10_000 });
  }
});

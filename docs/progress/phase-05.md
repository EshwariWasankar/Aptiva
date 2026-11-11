# Phase 05 — Diagnostic, result analysis and error feedback (PH-5)

Date: 2026-11-11 · Specification: playbook.md PH-5 (line ~3268), Sections 11.4/16, UI P-06–P-09, tests T-004/T-005/T-010/T-ML-04 · Prior phase: PH-4 (approved, verified locally).

## A. Summary of implementation changes (by task ID)

- **PH5-T01 — schema.** `diagnostic_tests` (user, mode standard|express, status active|paused|submitted|partial, ordered `question_ids` JSON, pause counter, server timestamps), `diagnostic_results` (summary JSON + engine_version), and the feedback pair `attempt_error_feedback` (student report) / `attempt_error_inference` (rule inference: method, confidence, conflict). Migration `20261111140000_diagnostic`.
- **PH5-T02 — composer.** `apps/api/src/diagnostic/composer.ts` — deterministic, pure: published `pool='diagnostic'` candidates resolved to root section; standard = 27 (per-section 7/7/7/6, bands ≈30/45/25), express = 12 (~10–15 min, `coarse` flag). Short sections reported, never padded; insufficient pool → `422 DIAGNOSTIC_BANK_INSUFFICIENT`. `pnpm db:seed-diagnostic` promotes a diverse slice of sourced banked items into the diagnostic pool (idempotent).
- **PH5-T03 — E-010…E-014.** `POST /diagnostics` (one active per user → 409 `DIAGNOSTIC_ACTIVE` with id; completed → 409; 48 h stale → `partial`), `GET /:id/next` (server `shown_at`, no keys, auto-resume from pause), `PUT /:id/answers/:qid` (server marking, `INVALID_NUMERIC_INPUT` → 422 unconsumed, feedback-free ack, attemptId idempotent, diagnostic-pool + membership enforced), `POST /:id/pause` (once), `POST /:id/submit` (flush barrier drains stream until client ids persist → `submitted` → BullMQ `aptiva-diagnostic-results` → 202 pending).
- **PH5-T04 — analysis + E-015.** Engine `analyzeDiagnostic` (pure): topic/difficulty accuracy, time-vs-expected, skip pattern+positions, half-split consistency drift, thin-evidence list, express `coarse`. `GET /:id/result` → 409 `RESULT_NOT_READY` until the worker upserts `diagnostic_results` (idempotent).
- **PH5-T05 — inferError + E-016.** Engine `inferError` (pure): reported label wins (`method='reported'`, 0.95); rule inference fills type/confidence and sets `conflict` on disagreement. `PUT /attempts/:attemptId/error-feedback` upserts the report (editable, owner-only) and recomputes inference.
- **PH5-T06 — UI P-06…P-09.** `/onboarding/diagnostic` (intro, standard/express, 48 h hint, resume), `/diagnostic/[id]` (KaTeX runner, MCQ/numeric, display-only timer, skip, pause-once, progress), `/result` (polls until ready; topic/difficulty/pace/skips/consistency/thin-evidence/coarse badge), `/review` (per-miss cards: stem, keyed options or numeric answer, worked solution, time ratio, `ErrorCausePicker` + `ConflictNote`, skip-for-now).

## B. Files created / modified

Created: `prisma/migrations/20261111140000_diagnostic/`, `prisma/seed-diagnostic.ts`, `packages/engine/src/{infer-error,diagnostic-analysis}.ts`, `packages/engine/test/diagnostic.test.ts`, `apps/api/src/diagnostic/{diagnostic.module,diagnostic.service,diagnostic.controller,feedback.service,result-job.service,composer,dto}.ts`, `apps/api/test/integration/diagnostic.int.test.ts`, `apps/api/test/unit/diagnostic-composer.test.ts`, `apps/web/src/lib/{diagnostic,uuid}.ts`, `apps/web/src/components/{ErrorCausePicker,ConflictNote}.tsx`, `apps/web/src/app/(student)/{onboarding/diagnostic,diagnostic/[id],diagnostic/[id]/result,diagnostic/[id]/review}/page.tsx`, `apps/web/e2e/diagnostic-keyboard.spec.ts`, `apps/web/playwright.config.ts`.

Modified: `prisma/schema.prisma`, `packages/engine/src/index.ts` (`ENGINE_VERSION 0.2.0`), `apps/api/src/attempts/{attempts.service,attempt-stream.service}.ts` (shared internals + **dedicated consumer connection**), `apps/api/src/app.module.ts`, `apps/api/package.json`, `apps/web/package.json` (`test:e2e`), root `package.json` (`db:seed-diagnostic`), `docs/STATUS.md`.

## C. Commands executed and observed results

| Command                                 | Result                                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:migrate:deploy`                | `20261111140000_diagnostic` applied; client regenerated                                                                                |
| `pnpm db:seed-diagnostic`               | **40 questions promoted** → diagnostic pool (see §D coverage note)                                                                     |
| `pnpm --filter @aptiva/engine test`     | **24/24**                                                                                                                              |
| `pnpm --filter @aptiva/api test`        | **39/39** unit (incl. 5 composer tests)                                                                                                |
| `pnpm test:integration` (real PG+Redis) | **51/51** — 7 new diagnostic tests + 44 prior                                                                                          |
| `pnpm lint` / `typecheck` / `build`     | clean (1 pre-existing warning); 23 web routes                                                                                          |
| Live API E2E (dev stack)                | create → 12 answers → submit 202 → result computed → review 12 items → E-016 feedback `method=reported conflict=true`, edit upserts    |
| Playwright keyboard spec                | written (`apps/web/e2e/diagnostic-keyboard.spec.ts`); run pending — needs `pnpm --filter @aptiva/web test:e2e` with browsers installed |

## D. Bugs found & fixed during verification

1. **Shared-client blocking (NFR-003 violation, real prod bug):** the stream consumer's `XREADGROUP … BLOCK` ran on the shared ioredis client, serialising every producer/cache command behind the block window — measured **~1–2 s per Redis op** (`/next` ≈ 4 s, answers ≈ 8 s; integration suite timed out at 90 s). Fixed: dedicated `consumerRedis` connection for the blocking read + reclaim; shared client stays non-blocking. After fix: `/next` ≈ 0.15 s, answer ≈ 0.6 s, suite 145 s → 15 s.
2. **`getActive` double envelope:** service returned `{data:…}` inside the global envelope → `body.data.data`. Fixed to return the object/null; web client type corrected.
3. **DI cycle:** `DiagnosticResultJobService ↔ DiagnosticService` — resolved via `ModuleRef` lazy lookup in the worker.
4. **UUID params:** non-UUID `:id` hit Prisma → 500; `ParseUUIDPipe` added → 400.
5. Test fixes: format-aware assertions (numerical items have no options), E-012 targets a numerical item for `INVALID_NUMERIC_INPUT`, review assertion accepts numerical answers.

## E. Composition rules, inference thresholds, coverage gaps (handover)

**Composition:** standard 27 items across 4 sections (quota 7/7/7/6 by sorted section id), express 12 (3/section); difficulty quotas ≈30/45/25 (express ≈33/42/25); deterministic id-sort + seeded shuffle; candidates = `status='published' AND pool='diagnostic'` resolved to root section; disjoint from reassessment by pool CHECK + composer filter; < total → 422 (no silent thin diagnostic); `shortSections` logged.

**inferError thresholds:** reported → `method='reported'`, confidence 0.95, `conflict = (rule.type !== report)`; rule-only → confidence per signal (fast-wrong/skipped/rounding); no signal → `errorType=null`. Stored label is always the student's; inference is advisory.

**Coverage gaps (honest):**

- **Section coverage is quant-only.** DS-01 (the only approved question source) contains exclusively quantitative files; Logical Reasoning / DI / Verbal have **zero** banked items. The composer still produces a valid diagnostic (all-quant) and reports short sections — four-section composition is blocked on content authoring or an approved non-quant source (DS-02 remains blocked, D-01).
- **Format mix:** diagnostic pool is 100 % numerical (DS-01 parser accepts single-answer numerical only; MCQ files were rejected at import). MCQ rendering path is implemented and unit/integration-tested via fixtures.
- **Difficulty priors:** all imported items carry `difficultyPrior=2` — band quotas can't be met until priors are curated; result `byDifficulty` will show a single band.
- Express diagnostic = coarse flag implemented; standard needs 27 items — pool has 40, OK.

## F. Completion gate status

FR-003/FR-005/FR-006 implemented and verified at API level end-to-end on the live stack (create → answer → submit → analysed result → mistake review → error tag → conflict flag). Remaining for sign-off: browser pass of P-06→P-09 (web dev server running on :3000 — register a **student** account; `diagtest@example.com` already completed one) and optional `test:e2e` Playwright run.

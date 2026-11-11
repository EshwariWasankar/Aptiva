# Phase 02 — Content foundation (PH-2)

Date: 2026-11-10 · Specification: playbook.md PH-2 (line ~3173), Sections 12.2, API E-055/056/060/061/064/065, UI P-01/P-02/P-20/P-21/P-23/P-24, marking API-ANS-03 · Prior phase: PH-1 (approved, verified locally).

## A. Summary of implementation changes (by task ID)

- **PH2-T01 — schema.** `prisma/schema.prisma` gained `Topic` (self-referencing hierarchy, `level` section|topic|subtopic|concept), `ConceptPrerequisite`, `Assessment`, `AssessmentVersion`, `AssessmentSource` (provenance type + confidence + last-verified), `BlueprintSection`, `BlueprintTopicWeight`, `ImportBatch`, `Question`, `QuestionOption`, `QuestionReview`, `Lesson`, `ErrorType`. Migration `20261109120000_content/migration.sql` reproduces the Section 12.2 DDL plus DB-level backstops Prisma can't express: `published_needs_source`, `numerical_needs_answer`, partial unique `uq_one_correct` (exactly one correct MCQ option), `uq_question_reviewer` (one review per reviewer per question), `uq_stem_hash`, provenance CHECKs. Follow-up migration `20261110120000_questionformat_case` renames the enum type to `"QuestionFormat"` to match Prisma's verbatim enum-name mapping (found by integration tests).
- **PH2-T02 — seed.** `prisma/seed.ts` (idempotent, upserts by slug): 4 sections (Quantitative, Logical Reasoning, Data Interpretation, Verbal), 12 topics with subtopics, 11 `error_types`, the generic fallback blueprint (`generic`, all fields `assumption`/`low` confidence, explicit "not verified" provenance) and a sample blueprint (`sample-it-company`) mixing `official`/`public`/`pattern_inferred` sources with per-section and per-weight provenance.
- **PH2-T03 — marking engine.** `packages/engine/src/marking.ts`: pure `markAttempt(question, input, ctx)` → `{ isCorrect, roundingSuspected, scoreDelta }`. MCQ validates selected option id; numerical parser accepts commas/spaces/signs/leading zeros/decimals/negatives, normalises `-0`→`0`, compares within `tolerance`, flags `roundingSuspected`, returns `scoreDelta` (1 correct, 0 blank/invalid, −penalty only when blueprint context allows). `ENGINE_VERSION` exported. No I/O, framework imports, or side effects.
- **PH2-T04 — admin APIs.** `apps/api/src/content/`:
  - E-060 `GET/POST/PUT /admin/questions` — Zod-validated (`dto.ts`), server-side HTML sanitisation (`common/sanitize.ts`: allowlist tags, strips scripts/handlers/`javascript:` URLs), `stemHash` dedupe → 409, format-specific publish rules → 422 `PUBLISH_RULES` (source required; exactly one correct MCQ option; `numeric_answer` required for numerical), partial-update preserves status/options when omitted.
  - E-061 `POST /admin/questions/:id/review` — reviewer/admin approve|reject with notes; unique per reviewer → 409 on repeat; approve → `reviewed`, reject → `draft`.
  - E-064 `GET/POST/PUT /admin/blueprints` — blueprint + immutable versions; PUT creates version N+1 transactionally (assessment + version + sources + sections + weights in one `$transaction`); per-field `sourceIndex` provenance; share-sum≈1 and index bounds validated → 422.
  - E-065 `GET/POST/PUT /admin/lessons` — concept-repair lessons CRUD.
  - Supporting `GET /admin/taxonomy` (admin+reviewer) for editor pickers.
  - Shared `common/http/zod.ts` `parseBody` maps Zod failures to the standard `VALIDATION_FAILED` envelope; auth/user controllers migrated to it.
- **PH2-T05 — public APIs.** E-055 `GET /assessments` and E-056 `GET /assessments/:slug/blueprint` (`@Public()`); responses embed provenance (sourceType, confidence, lastVerifiedAt, reference) per section/weight/source and never expose answer keys, `isCorrect`, `stemHash`, reviewer identities or internal fields.
- **PH2-T06 — frontend.**
  - P-01 `/` public landing (server component, fetches `/assessments` via `API_INTERNAL_URL`, 5-min revalidate): hero, 3-step explainer, blueprint cards, not-affiliated footer. Student home moved to `/dashboard`.
  - P-02 `/assessments/[slug]` public blueprint page (server component): sections with duration/question-count range/negative-marking/format-mix, topic weights with share/band/pace, `ProvenanceBadge` per field, unverified-fields notice, per-company disclaimer.
  - P-20 `/admin/questions` — filterable/paginated list (search, topic, status, format, pool, difficulty band).
  - P-21 `/admin/questions/[id]` + `/new` — `QuestionEditor`: topic/format/difficulty/pool/time/status/source/author, stem + solution with live KaTeX preview, MCQ options editor (single-correct radio, trap tags, add/remove), numerical fields, reviews list, API issue display.
  - P-23 `/admin/blueprints` — assessment list + version history + `BlueprintEditorForm` (sources with type/confidence/reference, sections with counts/duration/negative-marking/format-mix, topic-weight rows) for create and new-version (prefilled from current version, provenance indices preserved).
  - P-24 `/admin/review` — draft/reviewed queue with approve/reject + notes (E-061).
  - `components/Katex.tsx` lazy-loads KaTeX (`$…$`/`$$…$$`) — keeps test workers and initial bundles light; `components/ProvenanceBadge.tsx`; `lib/content.ts` typed API helpers; admin layout now allows `reviewer` role with role-filtered nav; `RequireAuth` accepts role arrays.
- **PH2-T07 — fallback + sample blueprint.** Seeded `generic` blueprint (unverified, assumption-sourced, no employer claims) and `sample-it-company` with mixed provenance — see T02.

## B. Files created / modified / deleted

Created: `prisma/migrations/20261109120000_content/`, `…/20261110120000_questionformat_case/`, `packages/engine/src/marking.ts`, `packages/engine/test/marking.test.ts`, `apps/api/src/content/{content.module,content.controller,admin-questions.controller,admin-blueprints.controller,admin-lessons.controller,admin-taxonomy.controller,content.service,dto}.ts`, `apps/api/src/common/{sanitize.ts,http/zod.ts}`, `apps/api/test/unit/{sanitize,content-dto}.test.ts`, `apps/api/test/integration/content.int.test.ts`, `apps/web/src/lib/content.ts`, `apps/web/src/components/{Katex,ProvenanceBadge,QuestionEditor,BlueprintEditorForm}.tsx`, `apps/web/src/components/QuestionEditor.test.tsx`, `apps/web/src/app/(public)/{page.tsx,assessments/[slug]/page.tsx}`, `apps/web/src/app/(admin)/admin/questions/[id]/page.tsx`.

Modified: `prisma/schema.prisma` (+13 models), `prisma/seed.ts` (stub → full seed), `packages/engine/src/index.ts` (exports), `apps/api/src/app.module.ts` (+ContentModule), `apps/api/src/auth/auth.controller.ts` + `apps/api/src/users/users.controller.ts` (shared zod parse), `apps/web/src/app/(student)/{page→dashboard/page}.tsx`, `(student)/layout.tsx` (nav → /dashboard), `(admin)/layout.tsx` (role-aware nav, reviewer allowed), `apps/web/src/components/RequireAuth.tsx` (role arrays), `apps/web/{admin pages}`, `apps/web/vitest.config.ts` (maxWorkers 2 — KaTeX OOM), `.github/workflows/ci.yml` (+`pnpm db:seed` step).

## C. Commands executed and observed results

| Command                                    | Result                                                                                       |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm db:migrate:deploy` (local Docker PG) | 3 migrations applied incl. content + enum-case fix                                           |
| `pnpm db:seed`                             | taxonomy 4 sections/12 topics, 11 error_types, `generic` + `sample-it-company` blueprints v1 |
| `pnpm lint`                                | 0 errors (1 warning resolved)                                                                |
| `pnpm typecheck`                           | all 6 projects pass                                                                          |
| `pnpm test`                                | api 34 unit, web 14 (incl. 3 QuestionEditor), packages/tools pass                            |
| `pnpm test:integration` (real PG+Redis)    | **25/25 pass** — 9 new content tests + 13 auth + 3 health                                    |
| `pnpm --filter @aptiva/web build`          | 19 routes; `/`, `/assessments/[slug]`, `/dashboard`, all admin pages                         |
| `pnpm --filter @aptiva/api build`          | nest build clean                                                                             |

Note: `pnpm build` (parallel) hit a transient native OOM (`uv_thread_create`) with ~1 GB free RAM; sequential builds pass. Not a code issue.

## D. Tests executed and actual results

- Engine (`packages/engine/test/marking.test.ts`, 10 tests): MCQ correct/incorrect/invalid option; numerical tolerance boundaries, rounding-suspect flag, negative marking on/off, malformed input → no attempt consumed semantics (`isCorrect:false, scoreDelta:0`), `-0` normalisation.
- API unit: `sanitize.test.ts` (script/handler/javascript: stripping, allowlist, stable stemHash — T-020), `content-dto.test.ts` (E-060 schema, blueprint body/create rules).
- Integration (`content.int.test.ts`, 9 tests, **executed against real PostgreSQL 18 + Redis 8**): E-060 CRUD/list/read; 422 on two-correct + empty stem 400; T-018 publish rules at API (422 `PUBLISH_RULES`) **and** DB CHECK backstops (`published_needs_source`, `numerical_needs_answer`, `uq_one_correct` via raw Prisma); T-020 XSS stem stored sanitised; duplicate normalised stem → 409; E-061 approve→reviewed, repeat → 409, student → 403; role matrix student 403 / reviewer 200; E-064 create→version→public E-055/E-056 with provenance assertions + bad share-sum 422; E-065 lesson CRUD.
- Web component (`QuestionEditor.test.tsx`, 3 tests): create-mode render + format switch, KaTeX preview, MCQ submit payload shape.

## E. Acceptance criteria status (PH-2 completion gate)

| Criterion                                                                                             | Status | Evidence                        |
| ----------------------------------------------------------------------------------------------------- | ------ | ------------------------------- |
| FR-009 content model (taxonomy, questions, blueprints, reviews, lessons, error types, import batches) | Done   | schema + migration + seed       |
| FR-020 admin content APIs (without bulk import — E-062/063 deferred to PH-3)                          | Done   | E-060/61/64/65 + tests          |
| DATA-001 taxonomy + error types + fallback/sample blueprint seeded                                    | Done   | `pnpm db:seed` verified locally |
| Marking tests (T-ML-03)                                                                               | Done   | 10 engine tests pass            |
| Publish rules + sanitisation + provenance                                                             | Done   | service + integration tests     |
| Public blueprint page with badges/disclaimer                                                          | Done   | P-02 + E-056                    |
| No later-phase code (no ingestion/diagnostic/planner/practice)                                        | Met    | —                               |

## F. Known issues, limitations, workarounds

- **Manual UI verification pending user**: create MCQ + numerical in `/admin/questions/new`, attempt publish without source → expect 422 banner; view `/assessments/sample-it-company` for provenance badges. Integration tests cover the same paths but the gate asks for a UI pass.
- `GET /admin/taxonomy` added beyond the E-list — required by P-20/P-21/P-23 pickers; flagged for playbook reconciliation.
- KaTeX renders `$…$`/`$$…$$` in stems/solutions; raw HTML in stems is shown as text (sanitised allowlist kept minimal — bold/italic/code/sub/sup only). Rich-text editor is a later-phase concern.
- Blueprint editor uses source **indices** (matching the API contract); UI labels rows "source #n".
- Integration tests leave fixture rows in the dev DB (unique slugs/emails per run); a `db reset` cleans them.
- Docker/DB now available locally — earlier PH-1/PH-0 "not run" caveats resolved; integration suite runs green on this machine.

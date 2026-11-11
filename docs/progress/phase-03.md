# Phase 03 — Ingestion and seed bank (PH-3 + company-data addendum)

Date: 2026-11-11 · Specification: playbook.md PH-3 (line ~3200) + PH-3 addendum (DS-07/DS-08, E-067–E-069, DATA-005–007) · Prior phase: PH-2 (approved, verified locally).

## A. Summary of implementation changes (by task ID)

- **PH3 schema — company-data tables.** `prisma/schema.prisma` gained `CompanyPatternRecord` (company, round, section, topic text, question count, minutes, negative marking, difficulty note, source path + pinned commit, status extracted|mapped|used|rejected), `TopicSynonym` (phrase → topic, upserted by admin mapping), `QuestionAssessmentTag` (question × blueprint-section fit, basis, CHECK 0–1). Migration `20261111120000_company_data/migration.sql`.
- **PH3-T01 — common pipeline.** `tools/ingest` (`@aptiva/ingest`): `github.ts` fetches pinned repos via codeload tarballs (commit SHA resolved + recorded, per-file sha256, injectable fetch for tests), `normalize.ts`, `pipeline.ts` (classify → validate → dedupe → report), `mapper.ts` (synonym table + taxonomy slug/name matching, unmapped phrases reported never guessed), `drafter.ts` (blueprint drafting), `fit.ts` (fit = topic share × format match × difficulty proximity, all factors [0,1]). DS-02 remains blocked (D-01, no Kaggle); DS-01 and DS-03 are live.
- **PH3-T02 — DS-01 parser.** `parsers/ds01.ts`: markdown problem files → single-answer numerical items only. Handles `Problem:`/`Solution:`/`Final Answer:` with and without colons, inline `👍 Final Answer:` endings, comma-grouped numbers, fractions, percentages; rejects multi-part files, ratio answers, non-numeric answers, missing sections.
- **PH3-T03 — DS-02.** Not implemented — blocked by D-01 (no approved non-Kaggle dataset).
- **PH3-T04 — DS-03 parser.** `parsers/dsm8k.ts`: GSM8K JSONL → stem from question, `####` final line as verified numeric answer, `practice` pool.
- **PH3-T05 — import APIs + UI.** `apps/api/src/import/`:
  - E-062 `POST /admin/import` `{source: ds-01|ds-03, ref?, dryRun}` — dry-run returns the full report (accepted/rejected/duplicate counts, unmapped topics, samples) without writes; confirmed run creates an `import_batches` row + draft `questions` (sanitised, stem-hashed, batch-linked) in one transaction → 201.
  - E-063 `GET /admin/import-batches` + `DELETE /admin/import-batches/:id` — reversal deletes only that batch's draft questions then the batch (409 if any item left draft).
  - E-066 coverage folded into `GET /admin/coverage` (topic × band × pool cells vs threshold 8, below-threshold list = authoring backlog).
  - P-22 `/admin/import` — three tabs: Question sources (source/ref, dry-run report, confirm, batch list + reverse), Company data (DS-07/DS-08 extraction, mapping queue, draft-blueprint, fit recompute), Coverage.
- **PH3-T06 — coverage report.** `GET /admin/coverage` + Coverage tab: cells of reviewed+published items per topic × difficulty band × pool, threshold 8 flagged.
- **PH3-T07 — DS-07 parser.** `parsers/ds07.ts`: company folders at pinned commit → `company_pattern_records` (only `0*-*.md` files; structure fields only — sections, topic phrases, counts, minutes, negative marking, difficulty notes; **no question text**). Verified real structure: TCS files have content; Accenture/Infosys files are zero-byte → rejected as `empty file`.
- **PH3-T08 — DS-08.** `POST /admin/company-imports {source:'ds-08'}` returns the company coverage list derived from `Company_Wise_Aptitude/*.pdf` filenames at a pinned commit. No records, no questions — reference only per Section 14.1.
- **PH3-T09 — synonyms + queue.** `topic_synonyms` table + mapper; seed ships 59 phrase→topic synonyms (DS-01 folder names + common DS-07 phrases). E-067 `POST /admin/company-imports`, E-068 `GET /admin/company-patterns` (filters + unmapped-phrase counts), E-069 `POST /admin/company-patterns/:id/map` (map to topic / reject; upserts the synonym and retro-fits sibling records with the same phrase).
- **PH3-T10 — blueprint drafter.** `drafter.ts`: groups mapped records by company → round → section; stated counts drive shares, missing counts → flagged even-split assumption; pace = minutes ÷ count; numeric conflicts → median after outlier removal else cautious max/range with assumptions; every field carries `candidate_reported` + `path @ commit` provenance. Persisted as a **non-current** draft version via `ContentService.createBlueprintDraft`; publishing goes through the normal PUT new-version flow.
- **PH3-T11 — fit job.** `POST /admin/blueprints/:id/fit-tags` recomputes `question_assessment_tags` for the current version (published questions × sections), idempotent delete+rewrite, audited.

## B. Files created / modified

Created: `prisma/migrations/20261111120000_company_data/`, `tools/ingest/{package.json,tsconfig.json,tsconfig.build.json,src/{index,types,normalize,github,mapper,drafter,fit,pipeline}.ts,src/parsers/{ds01,dsm8k,ds07}.ts,test/{parsers,pipeline}.test.ts}`, `apps/api/src/import/{import.module,import.controller,import.service,company.service,dto}.ts`, `apps/api/test/integration/import.int.test.ts`, `apps/web/src/lib/import.ts`, `apps/web/src/components/ImportPanel.tsx`.

Modified: `prisma/schema.prisma` (+3 models), `prisma/seed.ts` (+5 topics: percentages, ages, profit-loss, time-work, number-series + 59 synonyms), `apps/api/src/content/content.{module,service}.ts` (export service; `createBlueprintDraft` + `isCurrent` option), `apps/api/src/app.module.ts` (+ImportModule), `apps/api/src/main.ts` (`dotenv/config` — dev server previously required manual env export), `apps/api/package.json` (+`@aptiva/ingest`, dotenv, pre-hooks building ingest), `apps/web/.../admin/import/page.tsx` (real P-22), `apps/web/.../admin/blueprints/page.tsx` ("Draft from records" action), root `package.json` (ingest build prepended to test/build/dev), `pnpm-lock.yaml`.

## C. Real end-to-end verification (local Docker PG 18 + Redis 8)

| Step                               | Result                                                                                                                                                                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DS-01 dry-run `POST /admin/import` | 76 files @ `ee65675` → 66 accepted, 9 rejected (5 non-numeric, 4 ratio), 0 dup, 0 unmapped                                                                                                                                                           |
| DS-01 real import                  | batch `85f3c42a` → 66 draft questions, `import_batch_id` lineage                                                                                                                                                                                     |
| DS-07 dry-run + real               | 15 files @ `aee473a` → 132 records (TCS only; Accenture/Infosys OA files empty→rejected), 53 auto-mapped, 69 unmapped phrases queued                                                                                                                 |
| E-069 mapping                      | 12 aptitude phrases mapped (cyclicity/GCD/LCM/primes/factorials→number-system, fibonacci→number-series, tables→DI, statement-and-assumption/logical-puzzles/math-reasoning→logical, `[ ]` DI/LR headers); coding/DSA phrases left unmapped for admin |
| Draft blueprint                    | `tcs-online-assessment` drafted (6 sections, even-split assumptions flagged, `candidate_reported` + `Companies/01-TCS/01-OA.md @ aee473a…` on all 30 source rows) → reviewed → published as v2 current                                               |
| Fit tags                           | `POST …/fit-tags` → 12 tags (2 published questions × 6 sections); re-run idempotent                                                                                                                                                                  |
| Published questions                | 2 DS-01 items reviewed + published via normal workflow                                                                                                                                                                                               |

## D. DATA checks (executed against the live DB)

- **DATA-001** PASS — 0 published questions without `source_name`; all rows have status/author fields (17 legacy test-fixture drafts lack `author` — noted, drafts only).
- **DATA-002** PASS — 3 import batches; 66 questions carry `import_batch_id`; reversal verified by integration test (deletes only batch rows).
- **DATA-003** PASS — pools are a single enum column (disjoint by construction); only `practice` populated so far.
- **DATA-004** REPORTED — 5 topic×band×pool cells, all below the 8-item threshold → authoring backlog (expected per gate; PH-5 demo needs team authoring or further source unblocking).
- **DATA-005** PASS — all 30 blueprint source rows for `tcs-online-assessment` are `candidate_reported` with `path @ <sha>` references.
- **DATA-006** PASS — 0 questions sourced from DS-07; 0 stems containing recalled-question phrasing; DS-07/08 produce pattern records/coverage only, never `questions` rows.
- **DATA-007** PASS — 12 fit tags, all within [0,1]; recompute is delete+rewrite (idempotent, verified by double-run + property tests).

## E. Test results

- `pnpm --filter @aptiva/ingest test` — **22/22** (golden DS-01/DS-03 parser files, fetch-and-pin tarball test, dedupe, mapper, drafter median/outlier/range/even-split, fit 0–1 + stability property).
- `pnpm test` — api 34 unit, web 14, engine 16, shared 4, replay 1, ingest 22 — all pass.
- `pnpm test:integration` — **32/32** (13 auth + 9 content + 3 health + **7 new import tests**: role matrix, batch list/reverse, pattern queue, map+synonym+retro-fit, coverage, draft validation).
- `pnpm lint` 0 errors · `pnpm typecheck` all projects · `pnpm build` api+web clean (19 routes).

## F. Acceptance criteria status (PH-3 completion gate)

| Criterion                                                              | Status | Evidence                                                   |
| ---------------------------------------------------------------------- | ------ | ---------------------------------------------------------- |
| ≥1 source imported end-to-end with `import_batch` row                  | Done   | DS-01 batch `85f3c42a`, 66 drafts                          |
| DATA-001–004 run                                                       | Done   | §D — DATA-004 reports gaps (authoring backlog before PH-5) |
| Company blueprint from DS-07, `candidate_reported`, reviewed+published | Done   | `tcs-online-assessment` v2 current                         |
| Fit tags for published questions                                       | Done   | 12 tags, idempotent, [0,1]                                 |
| DATA-005–007 pass; no recalled-question text                           | Done   | §D                                                         |

## G. Known issues / handover notes

- `@aptiva/ingest` ships `dist/` for runtime; root `test`/`build`/`dev` and api `pre*` hooks build it first. Dev-server watch does **not** reload `node_modules` deps — restart `nest start` after rebuilding ingest.
- DS-01 yield: 66/76 files → numerical single-answer items; 9 rejects are genuinely non-numeric/multi-part (ratios, two-answer partnership splits). MCQ/DI/verbal content in DS-01's technical sections was out of scope for the numerical parser.
- DS-07 unmapped queue still holds coding/DSA phrases (C++, trees, sorting…) and resource-link rows — admin may reject them in P-22; they correctly produce no blueprint weights.
- `author` is nullable; 17 pre-PH-3 fixture drafts lack it. Consider tightening in a later phase.
- DS-02 stays blocked pending a named non-Kaggle dataset (D-01).

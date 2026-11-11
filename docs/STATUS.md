# Project status

Task tracking per playbook Sections 34–37. Task IDs are stable; statuses:
not started, in progress, blocked, done.

| Task    | Description                                                                                         | Status | Phase |
| ------- | --------------------------------------------------------------------------------------------------- | ------ | ----- |
| PH0-T01 | Look up versions, check peers, pin, record                                                          | done   | PH-0  |
| PH0-T02 | Monorepo layout (Section 31) with empty modules                                                     | done   | PH-0  |
| PH0-T03 | docker-compose, .env.example, typed config module                                                   | done   | PH-0  |
| PH0-T04 | Prisma baseline migration (extensions); /health /ready                                              | done   | PH-0  |
| PH0-T05 | Lint, format, typecheck, test runners, pre-commit                                                   | done   | PH-0  |
| PH0-T06 | CI workflow                                                                                         | done   | PH-0  |
| PH0-T07 | README, docs/STATUS.md, docs skeleton                                                               | done   | PH-0  |
| PH1-T01 | Identity migrations and Prisma models                                                               | done   | PH-1  |
| PH1-T02 | E-001 to E-007 auth endpoints                                                                       | done   | PH-1  |
| PH1-T03 | Auth/role/rate-limit guards                                                                         | done   | PH-1  |
| PH1-T04 | Audit-log writer                                                                                    | done   | PH-1  |
| PH1-T05 | Auth pages, shells, route guards, API client                                                        | done   | PH-1  |
| PH1-T06 | Consent notice versioning                                                                           | done   | PH-1  |
| PH2-T01 | Content migrations (taxonomy, blueprints, questions, reviews, lessons, error_types, import_batches) | done   | PH-2  |
| PH2-T02 | Seed taxonomy, error_types, fallback + sample blueprint                                             | done   | PH-2  |
| PH2-T03 | Engine markAttempt (MCQ + numerical tolerance/rounding)                                             | done   | PH-2  |
| PH2-T04 | Admin APIs E-060/61/64/65 with validation, sanitisation, publish rules                              | done   | PH-2  |
| PH2-T05 | Public APIs E-055/E-056                                                                             | done   | PH-2  |
| PH2-T06 | Frontend P-01/P-02 + admin P-20/P-21/P-23/P-24 with KaTeX                                           | done   | PH-2  |
| PH2-T07 | Generic fallback + seeded sample blueprint with provenance                                          | done   | PH-2  |

| PH3-T01 | tools/ingest common pipeline (fetch pinned, parse, classify, validate, dedupe) | done | PH-3 |
| PH3-T02 | DS-01 markdown parser (numerical single-answer) | done | PH-3 |
| PH3-T03 | DS-02 parser — blocked (D-01, no approved non-Kaggle dataset) | blocked| PH-3 |
| PH3-T04 | DS-03 GSM8K numerical parser | done | PH-3 |
| PH3-T05 | E-062/E-063 import APIs + P-22 import UI | done | PH-3 |
| PH3-T06 | Coverage report (topic x band x pool vs threshold) | done | PH-3 |
| PH3-T07 | DS-07 company pattern extractor -> company_pattern_records | done | PH-3 |
| PH3-T08 | DS-08 coverage/topic-emphasis list (no question import) | done | PH-3 |
| PH3-T09 | Topic synonyms + mapper + E-067/68/69 review queue | done | PH-3 |
| PH3-T10 | Blueprint drafter (provenance, conflicts, assumptions) + P-23 draft action | done | PH-3 |
| PH3-T11 | Fit job -> question_assessment_tags (recomputable, 0-1) | done | PH-3 |

| PH4-T01 | Migrations practice_sessions, question_attempts | done | PH-4 |
| PH4-T02 | AttemptService: ownership, server timestamps, cached keys, marking, idempotency | done | PH-4 |
| PH4-T03 | Redis Stream producer/consumer group, batch insert, backoff, dead-letter, pending reclaim | done | PH-4 |
| PH4-T04 | Degraded mode: direct DB write on stream failure; 503 when both fail | done | PH-4 |
| PH4-T05 | Flush barrier with client id-list reconciliation | done | PH-4 |
| PH4-T06 | E-040/41/42 session endpoints (finish → 202 + recalc job) | done | PH-4 |
| PH4-T07 | k6 submission-path script | done | PH-4 |

| PH5-T01 | Migrations diagnostic_tests, diagnostic_results + feedback tables | done | PH-5 |
| PH5-T02 | Diagnostic composer (27 std / 12 express, 4 sections, 30/45/25 bands, disjoint pools) + db:seed-diagnostic | done | PH-5 |
| PH5-T03 | E-010..E-014 diagnostic lifecycle, single pause, 48h partial rule, flush barrier | done | PH-5 |
| PH5-T04 | analyzeDiagnostic engine + E-015 result endpoint (coarse flag, thin evidence) | done | PH-5 |
| PH5-T05 | inferError engine + E-016 feedback (reported wins, conflict flag) | done | PH-5 |
| PH5-T06 | UI P-06..P-09 + ErrorCausePicker/ConflictNote + Playwright keyboard spec | done | PH-5 |

Phase detail and verification evidence: `docs/progress/phase-00.md`,
`docs/progress/phase-01.md`, `docs/progress/phase-02.md`, `docs/progress/phase-03.md`, `docs/progress/phase-04.md`, `docs/progress/phase-05.md`.

## Open decisions (playbook Section 40.2)

| ID     | Decision                    | Status                                                            |
| ------ | --------------------------- | ----------------------------------------------------------------- |
| D-01   | Which Kaggle dataset        | Open — team will not provide one; DS-01 GitHub repo is the source |
| D-05   | Hosting provider and budget | Open — blocks PH-12                                               |
| others | See playbook Section 40.2   | Defaults apply unless flagged                                     |

## Known issues / limitations

- Docker Desktop is installed and `infra/docker-compose.yml` services
  (PostgreSQL 18, Redis 8) run locally; migrations, seed and the full
  integration suite execute on this machine.
- `@aptiva/ingest` must be built (`pnpm --filter @aptiva/ingest build`) before the API runs/tests — root scripts do this automatically; `nest start --watch` does not reload workspace deps, restart after ingest changes.
- `pnpm build` runs both apps in parallel and can hit a transient native
  OOM on memory-constrained machines (~1 GB free); run the per-app builds
  sequentially if it recurs.

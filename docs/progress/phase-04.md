# Phase 04 — Attempt pipeline (PH-4)

Date: 2026-10-11 · Specification: playbook.md PH-4 (line ~3238), Sections 11.3/11.5/12.1/15.2/27.1, tests T-005–T-009 · Prior phase: PH-3 (approved, verified locally).

## A. Summary of implementation changes (by task ID)

- **PH4-T01 — schema.** `practice_sessions` and `question_attempts` per Section 12.1 DDL: client-generated `id` PK as the idempotency key, polymorphic `context_type`/`context_id` (`practice` now; `diagnostic`/`reassessment` reserved by CHECK), server `shown_at`/`answered_at`, `time_ms`, marking result, skip/revisit/answer-change counters, pool-disjoint contexts. Migration `20261111130000_attempts`.
- **PH4-T02 — AttemptService.** `apps/api/src/attempts/`:
  - Ownership: session row checked against `user_id` (404, no existence leak); 2 h stated expiry → 409 `SESSION_EXPIRED`.
  - Server timestamps: `shown_at` stamped by the serve call (`GET /sessions/:id/questions/:questionId`, Redis `HSETNX`, first-write-wins), `answered_at` at submit; `time_ms = answered_at − shown_at` — client clock fields are stripped by the Zod schema and never read (SEC-011/NFR-005).
  - Cached answer keys: `qkey:{questionId}` Redis cache (1 h TTL) holds format/options/numeric key server-side only; serve responses strip `isCorrect`/keys entirely (SEC-010). Session and per-context sequence counters are also Redis-cached, so the warm submit path performs **zero PostgreSQL queries** (NFR-003).
  - Marking: engine `markAttempt` (PH-2) — MCQ option lookup, numerical tolerance/rounding-suspect, `INVALID_NUMERIC_INPUT` → 422 **before** any stream/DB write so the attempt is not consumed. Negative marking is off for practice sessions (no blueprint link until PH-7 plan items).
  - Idempotency: `attemptId` checked against Redis result cache then the DB row; replays return the stored result. Persistence is `INSERT … ON CONFLICT (id) DO NOTHING` — duplicates are structurally impossible.
  - Pool enforcement: `practice|mock` sessions require `pool='practice'`; `check|topic_test` require `pool='reassessment'` (DATA-003 disjointness).
- **PH4-T03 — stream pipeline.** `AttemptStreamService`: producer `XADD aptiva:attempts` (env `ATTEMPT_STREAM`); consumer group `attempt-writers` batches up to `STREAM_BATCH_MAX` (100) or `STREAM_BATCH_MS` (1 s), inserts via `createMany skipDuplicates`, then `XACK`. `XAUTOCLAIM` reclaims pending entries idle > `ATTEMPT_MIN_IDLE_MS` (30 s); after 5 failed deliveries the event moves to `aptiva:attempts:deadletter` with an error log (alert hook). Consumer auto-starts unless `NODE_ENV=test` or `ATTEMPT_CONSUMER_ENABLED=false`.
- **PH4-T04 — degraded mode.** Stream append failure → direct `questionAttempt.create` (P2002 treated as already-persisted); both failing → 503 `ATTEMPT_STORE_UNAVAILABLE`. Verified by tests.
- **PH4-T05 — flush barrier.** `POST /sessions/:id/finish` compares client-held ids (`attemptIds` + full `attempts` payloads) with persisted rows, drains the stream until `XPENDING`/unread entries are persisted or `FLUSH_BARRIER_TIMEOUT_MS` (10 s) elapses, re-ingests any payloads the client still holds through the normal submit path, then marks the session `finished`/`recalc_status=pending` and returns **202**. Recalc therefore only ever runs on fully persisted attempts (T-009).
- **PH4-T06 — endpoints.** `POST /sessions` (E-040), `GET /sessions/:id/questions/:questionId` (serve + shown_at stamp, no keys), `PUT /sessions/:id/attempts/:questionId` (E-041, 200/422/409/503), `POST /sessions/:id/finish` (E-042, 202). `RecalcService` wraps BullMQ queue `aptiva-recalc` (3 attempts, exponential backoff) with a placeholder worker that marks `recalc_status=done` — real recalculation lands in PH-5/6. Queue is skipped when Redis is down at boot (NFR-004) and `enqueueRecalc` failure leaves the session finished with `pending` status + error log.
- **PH4-T07 — k6.** `tools/k6/attempt-submit.js`: login → session → submit → finish ramping to 10 VUs, `submit_ms` p95 < 150 ms threshold, `http_req_failed` < 1 %.

## B. Files created / modified

Created: `prisma/migrations/20261111130000_attempts/`, `apps/api/src/attempts/{attempts.module,attempts.service,attempt-stream.service,recalc.service,sessions.controller,dto}.ts`, `apps/api/test/integration/attempts.int.test.ts`, `tools/k6/attempt-submit.js`, `packages/engine/tsconfig.build.json`, `packages/engine/dist/` (gitignored build output).

Modified: `prisma/schema.prisma` (+`PracticeSession`, `+QuestionAttempt`, back-relations), `apps/api/src/app.module.ts` (+AttemptsModule), `apps/api/src/common/config/env.ts` (stream/group/dead-letter/batch/idle/consumer envs with Section 27.1 defaults), `apps/api/src/common/redis/redis.service.ts` (expose client), `apps/api/.env.example` (new vars), `packages/engine/{package.json,src/index.ts}` (dist build + `.js` specifier so Node can import it — same pattern as `@aptiva/ingest`), root + `apps/api` package.json (engine built alongside ingest in pre-hooks), `docs/STATUS.md`.

## C. Commands executed and observed results

| Command                  | Result                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| `pnpm db:migrate:deploy` | `20261111130000_attempts` applied on local PG 18                                      |
| `pnpm db:generate`       | client regenerated                                                                    |
| `pnpm lint`              | 0 errors (1 pre-existing warning)                                                     |
| `pnpm typecheck`         | all projects clean                                                                    |
| `pnpm test`              | api 34, web 14, engine 16, shared 4, ingest 22, replay 1 — all pass                   |
| `pnpm test:integration`  | **44/44** — 12 new attempt tests + prior 32                                           |
| `pnpm build`             | api + web clean                                                                       |
| Live smoke (dev API)     | register → `POST /sessions` → serve MCQ (no `isCorrect` leaked) → submit → finish 202 |

## D. Tests executed and actual results (`attempts.int.test.ts`, real PG + Redis)

- **T-005** MCQ wrong option → `isCorrect:false`; response contains no option key material.
- **T-006** numerical `42.4` within tolerance → correct; `'not-a-number'` → 422 `INVALID_NUMERIC_INPUT`; after stream drain exactly 1 row persisted (the valid one).
- **T-007** same `attemptId` twice → identical response; after drain exactly 1 row, `contextType=practice`.
- **Clock tamper** client-sent `shownAt/answeredAt/timeMs` stripped; stored `time_ms` and timestamps are server-derived.
- **T-008** 1,000 stream events + 10 delivered-to-ghost unacked (pending) → consumer drains + `XAUTOCLAIM` reclaim → exactly 1,000 distinct rows.
- **T-009** 5 buffered attempts → finish → barrier persists all 5 before enqueue; `recalc_status` flips `pending→done` via BullMQ; second finish → 409.
- **Degraded** stream down → direct DB write succeeds; stream+DB down → 503.
- **Ownership** other student's session → 404; reassessment-pool question in practice session → 422 `WRONG_POOL`; admin → 403 on `POST /sessions`.

## E. Acceptance criteria status (PH-4 completion gate)

| Criterion                                    | Status                    | Evidence                                                                                                                                                                     |
| -------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-004 server-side marking + timestamps      | Done                      | `markAttempt` + server `shown_at`/`answered_at`; client times stripped                                                                                                       |
| NFR-003 submit without waiting on PostgreSQL | Done (design + warm-path) | answer keys, session, sequence all Redis-cached; k6 threshold script provided. Full "DB paused" p95 measurement needs k6 + a paused-DB rig — script ready, not executed here |
| NFR-005 server timestamps authoritative      | Done                      | tamper test passes                                                                                                                                                           |
| SEC-010 key never before submission          | Done                      | serve strips `isCorrect`; `qkey` cache server-side only; test asserts no key in responses                                                                                    |
| SEC-011 timing tampering                     | Done                      | tamper test passes                                                                                                                                                           |
| T-005–T-009 + crash/degraded/tamper          | Done                      | 12/12 integration tests                                                                                                                                                      |

## F. Operations notes (handover)

- **Stream/group names**: `aptiva:attempts` (env `ATTEMPT_STREAM`), group `attempt-writers` (`ATTEMPT_GROUP`), dead-letter `aptiva:attempts:deadletter`.
- **Monitoring**: `XPENDING aptiva:attempts attempt-writers` (lag), `XLEN aptiva:attempts:deadletter` (alert when > 0), consumer name pattern `consumer-<pid>-*`.
- **Replay dead-letter**: `XRANGE aptiva:attempts:deadletter - +` → re-`XADD` each payload to `aptiva:attempts` (or re-submit via API with same attemptIds — idempotent).
- **k6**: `k6 run -e API_URL=… -e EMAIL=… -e PASSWORD=… -e QUESTION_ID=… [-e OPTION_ID=…|NUMERIC_INPUT=…] tools/k6/attempt-submit.js`.

## G. Known issues / simplifications

- `shown_at` for a question never served via the GET endpoint falls back to `answered_at` (time_ms = 0) — the serve endpoint is the intended path; runner UI lands in later phases.
- Dead-letter delivery counting is per-process (XAUTOCLAIM doesn't return delivery counts); a crash-looping entry dead-letters after ~5 claims within one consumer lifetime.
- Practice sessions carry no blueprint link yet → negative marking always off; wired when plan items/mocks arrive (PH-7+).
- `sequence_no` uses a Redis `INCR` per context (DB-count fallback); gaps are possible after Redis flush — ordering only, not correctness.
- Test fixtures now clean up after themselves (users/questions/topics deleted in `afterAll`).

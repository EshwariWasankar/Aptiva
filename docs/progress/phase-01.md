# Phase 01 — Identity, RBAC and consent (PH-1)

Date: 2026-11-07 · Specification: playbook.md Sections 34–35 (PH-1), 11.1, 12.2 · Prior phase: PH-0 (approved).

## A. Summary of implementation changes (by task ID)

- **PH1-T01 — schema.** `prisma/schema.prisma` gained models `User`, `RefreshToken`, `ConsentRecord`, `StudentProfile`, `AuthToken`, `AuditLog`. Migration `20261107120000_identity/migration.sql` reproduces the Section 12.2 DDL (CITEXT email, role CHECK, TIMESTAMPTZ, gen_random_uuid) plus two justified additions: `auth_tokens` (the "token store" E-006 references but 12.2 doesn't name) and `audit_log` (needed by PH1-T04).
- **PH1-T02 — E-001..E-007.** `apps/api/src/auth/`: register (Argon2id hash, min-10 + HIBP k-anonymity breached-password check, consent `core` row, email-verification token, auto-login), login (generic 401, never reveals account existence), refresh (rotation within `family_id`; presenting a revoked token revokes the whole family → 401), logout (revokes token, clears cookie), Google OAuth (state + PKCE S256, HMAC-signed httpOnly txn cookie, upsert by `google_sub`/verified email), verify-email and password-reset request/confirm (single-use expiring `auth_tokens`; reset revokes all sessions). `apps/api/src/users/`: GET/PUT `/me` (E-007). Password hashing: argon2id (19 MiB, t=2, p=1).
- **PH1-T03 — guards.** Global guard chain (order matters): `AuthGuard` (Bearer JWT, `@Public()` opt-out), `RolesGuard` (`@Roles(...)`), `RateLimitGuard` (`@RateLimit` decorator; in-memory fixed window; auth routes 10/min/IP per Section 11.1, baseline 600/min/IP elsewhere). `x-aptiva-client` custom header required on cookie-authenticated mutations (refresh/logout) per the CSRF note in Section 11.1/SEC-007.
- **PH1-T04 — audit.** `AuditService` writes `audit_log` (non-blocking, failures logged not thrown). Events: register, login, login_failed, refresh_reuse_detected, email_verified, password_reset_requested/confirmed, logout-adjacent revocations. Request-id middleware from PH-0 unchanged.
- **PH1-T05 — frontend.** `apps/web`: `lib/apiClient.ts` (envelope unwrap, Bearer in memory, `x-aptiva-client`, refresh-on-401 exactly once), `lib/session.tsx` (SessionProvider restoring via E-003 on load), `RequireAuth` guard, pages `/login` (P-04), `/register` (P-03), `/verify-email` + `/reset-password` (P-05), student shell `(student)/` with nav (Dashboard/Plan/Practice/Notebook/Profile/Settings placeholders), admin shell `(admin)/admin/` (Overview/Questions/Import/Blueprints/Review placeholders), `/privacy` draft notice. Next.js rewrite proxies `/api/*` → `API_INTERNAL_URL` so the refresh cookie stays first-party.
- **PH1-T06 — consent versioning.** `NOTICE_VERSION` env (default `2026-11`) recorded on every consent row; register requires `consentVersion`; Google sign-up records `core` consent with server version; `/privacy` page labelled with the same version.

## B. Files created / modified / deleted

Created: `apps/api/src/auth/**` (8 files), `apps/api/src/users/**`, `apps/api/src/admin/**`, `apps/api/src/common/{audit,mail,guards}/**`, `apps/api/src/common/crypto.ts`, `prisma/migrations/20261107120000_identity/migration.sql`, `apps/api/test/unit/{password,token,google-oauth,dto}.test.ts`, `apps/api/test/integration/auth.int.test.ts`, `apps/web/src/lib/{apiClient,session}*`, `apps/web/src/components/{LoginForm,RegisterForm,VerifyEmailPanel,ResetPasswordPanel,RequireAuth}*`, auth/privacy/student/admin pages, `.github/workflows/ci.yml` env addition.

Modified: `prisma/schema.prisma` (models), `apps/api/package.json` (+@nestjs/jwt, @nestjs/swagger, cookie-parser, @types/cookie-parser), `apps/api/src/{app.module,main,common/config/env,common/guards/*,health/health.controller}.ts`, `apps/web/{next.config.ts,src/app/layout.tsx}`, `eslint.config.mjs` (consistent-type-imports off for apps/api — Nest DI needs value imports), `apps/api/.env.example`, `apps/api/test/unit/{env,health}.test.ts`, root `package.json` files (eslint 9.39.5 already in PH-0).

Deleted: `apps/web/src/app/page.tsx` (public landing scaffold; student home now owns `/` behind the guard — P-01 landing returns in PH-2).

## C. Commands executed and observed results

| Command                                                  | Result                                                                                                                                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                           | Success (new deps resolved; `@scarf/scarf` build denied via `allowBuilds:false`)                                                                                                                           |
| `pnpm exec prisma migrate diff`                          | **Unusable in Prisma 7.10.1** — returns empty diff for `--from-empty --to-schema`; migration SQL hand-written from Section 12.2 DDL instead (see F)                                                        |
| `pnpm lint`                                              | 0 errors, 0 warnings                                                                                                                                                                                       |
| `pnpm typecheck`                                         | All 6 projects pass (api runs `tsconfig.json` + `tsconfig.test.json`)                                                                                                                                      |
| `pnpm test`                                              | **41 tests pass**: api 23 (env 5, dto 6, password 5, token 2, google-oauth 3, health 2), web 11 (apiClient 4, LoginForm 3, RegisterForm 3, smoke 1), packages/tools 7                                      |
| `pnpm build`                                             | `nest build` Done; `next build` 18 static routes generated                                                                                                                                                 |
| Live API smoke (`node dist/src/main.js`, dummy DB/Redis) | `/health` 200; `/me` without token → 401 `UNAUTHENTICATED`; register without consent → 400 `VALIDATION_FAILED` with field issues; login with unreachable DB → 500 `INTERNAL` (generic, logged server-side) |
| `docker compose up -d` / `pnpm test:integration`         | **NOT RUN — no Docker locally** (unchanged from PH-0)                                                                                                                                                      |
| CI on PR                                                 | Pending — no git remote exists yet                                                                                                                                                                         |

## D. Tests executed and actual results

- Unit (all pass): Argon2id hash/verify round-trip; HIBP breached/not-breached/unreachable-fail-open; password policy; JWT sign/verify + wrong-secret rejection; Google OAuth begin() URL/PKCE params, state-mismatch and tampered-cookie rejection; DTO schemas (consent required, password length, gradYear); env validation incl. JWT secret minimum.
- Integration (`test/integration/auth.int.test.ts`, written, **not executed locally** — needs PostgreSQL+Redis): T-001 register+consent+duplicate-409+breached-400; verify-email single-use; login generic-401; 10/min rate limit → 429 `RATE_LIMITED`; T-002 refresh rotation + reuse → 401 + family revoked; logout revoke; CSRF header requirement; GET/PUT `/me`; student→admin 403 `FORBIDDEN`; password-reset single-use via captured mailer token.
- Component (pass): LoginForm generic/429 errors + submit; RegisterForm consent-required, short-password, valid payload with `consentVersion`; apiClient envelope/401-refresh-once/retry.

## E. Acceptance criteria status (PH-1 completion gate)

| Criterion                                                     | Status                                                                                            | Evidence                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------- |
| FR-001 register/login/consent version stored                  | Implemented; integration verification pending CI                                                  | code + tests written              |
| FR-002 profile fields via /me                                 | Implemented                                                                                       | E-007 + tests                     |
| SEC-001 Argon2id + breached check                             | Implemented + unit-tested                                                                         | password.test.ts                  |
| SEC-002/003 token handling, generic errors                    | Implemented                                                                                       | rotation/reuse code + tests       |
| SEC-004 role enforcement                                      | Implemented; role-matrix integration test written                                                 | RolesGuard + /admin/ping probe    |
| SEC-005 OAuth state+PKCE                                      | Implemented; real Google login unverifiable without credentials                                   | google-oauth.service + unit tests |
| SEC-007 cookie mutations need custom header                   | Implemented                                                                                       | CSRF_HEADER check + test          |
| Rate limits                                                   | Implemented (in-memory)                                                                           | RateLimitGuard + 429 test         |
| OpenAPI for E-001..E-007                                      | `@nestjs/swagger` at `/api/docs`                                                                  | main.ts                           |
| Verification: register→verify→login→refresh→logout via UI+API | **Pending real DB** — flows coded and unit/integration-tested but not executed end-to-end locally | —                                 |
| Reuse of old refresh token → 401 + family revoked             | Implemented; integration test written                                                             | auth.service.rotate/refresh       |
| No later-phase code                                           | Met — no diagnostics/content/planner logic                                                        | —                                 |

## F. Known issues, limitations, workarounds

- **No Docker locally** — all DB-backed verification (migration apply, integration suite, real login flow) deferred to CI. `prisma migrate diff` is broken/empty in Prisma 7.10.1, so the identity migration is hand-written DDL; drift vs `schema.prisma` should be checked at first `migrate dev` run (Prisma can't express CHECK constraints anyway).
- **Google OAuth untestable end-to-end** without `GOOGLE_CLIENT_ID`/`SECRET` (test project credentials are an external dependency). PKCE/state/cookie logic unit-tested; endpoints return 503 when unconfigured.
- **Email** uses the console adapter (logs the message). A provider adapter plugs into `MailerService` when `EMAIL_API_KEY` is set; production without it logs an error rather than silently dropping.
- **HIBP fails open** on network errors (documented choice; logged).
- **Rate limiter is in-memory** — correct for one instance; Redis-backed limiting is a PH-12 deployment concern.
- **JWT role claim** means role changes take up to `JWT_ACCESS_TTL_SECONDS` (15 min) to propagate — per Section 3 design.
- **`/api/docs` Swagger UI** is exposed in all environments for now; restrict in PH-10 hardening if desired.
- Duplicate-ish validation: API DTO zod schemas live in `apps/api/src/auth/dto.ts`; the web mirrors minimal client-side checks. `packages/shared` contract schemas for auth responses are a candidate for a later packaging pass (workspace TS-source exports can't be consumed by the CJS `nest build` — documented in PH-0).
- `consentVersion` is stored as provided; the web sends `CONSENT_NOTICE_VERSION` matching `NOTICE_VERSION`. Mismatched/stale versions aren't rejected — flag if strict version pinning is wanted.

## G. Unresolved decisions / questions

- D-01 (Kaggle): still moot — DS-01 GitHub repo only.
- D-05 (hosting): open — PH-12.
- New: whether `consentVersion` must equal `NOTICE_VERSION` server-side (currently accepted as opaque string). Default: accept.
- New: git remote needed for CI verification — repo is local-only.

## H. Documentation updated

- `docs/STATUS.md` — PH-1 task rows (see below).
- `docs/progress/phase-01.md` — this file.
- `apps/api/.env.example` — added `NOTICE_VERSION`, `WEB_BASE_URL`.
- `docs/SECURITY.md`/`docs/API.md` remain skeletons (fill in PH-10/API doc phase).

## I. Handover notes for PH-2 (content, taxonomy, blueprints)

- Commands: `pnpm dev`, `pnpm db:migrate` (needs compose), `pnpm test:integration` (needs compose + `JWT_ACCESS_SECRET`).
- Auth flow for tests: register → auto session; refresh cookie `pp_refresh` path `/api/v1/auth`; mutations need `x-aptiva-client` header; Bearer JWT for everything else.
- Create admin users by SQL (`UPDATE users SET role='admin'`) until an admin-role management UI exists.
- New tables must be added to BOTH `schema.prisma` and a hand-written migration (see PH1-T01 pattern; CHECK constraints go in SQL only).
- Mailer/audit/crypto helpers are global modules — reuse, don't duplicate.

## J. Confirmation

No PH-2+ functionality implemented (no taxonomy/questions/diagnostics/planner). All reported passes were executed; DB-backed and CI verification explicitly marked pending.

## K. Addendum — 2026-11-09 local verification

Docker Desktop was installed and `infra/docker-compose.yml` services started locally; the identity migration applied via `pnpm db:migrate:deploy`. First integration run: 9/16 passed — 7 failures were all 429s, not logic bugs: the suite fires ~20 auth requests from `127.0.0.1` in seconds and the shared in-memory bucket (10/min/IP) tripped mid-suite.

Fix: `RATE_LIMIT_FACTOR` env multiplier added to `RateLimitGuard` (env.ts, optional, default 1). `auth.int.test.ts` sets `RATE_LIMIT_FACTOR=1000` for the shared app and the dedicated rate-limit test builds a second app instance with the factor unset so it still observes real 429s. No Redis involvement (limiter is in-memory; no restart needed).

Status after fix: typecheck + lint clean; integration re-run pending on the dev machine (Docker unavailable in the agent shell).

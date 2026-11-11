# Phase 00 — Foundation, versions and decisions (PH-0)

Date: 2026-11-07 · Specification: playbook.md Sections 34–35 (PH-0), 37 · Governing document: Aptiva End-to-End Implementation Guide v1.0 (the docx also contained an unrelated "PrepPilot" Sections 16–21 document; the team confirmed Document A only).

## A. Summary of implementation changes (by task ID)

- **PH0-T01 — versions recorded.** Queried the npm registry for every Section 6 package; checked peer ranges; pinned exact versions; recorded in `docs/ARCHITECTURE.md`. Notable resolutions: TypeScript **6.0.3** (not 7.x — `typescript-eslint@8.72.1` peer range is `<6.1.0`), ESLint **9.39.5** (eslint-config-next plugin peers cap at 9), Prisma **7.10.1** (8.x is RC — excluded per version policy), pnpm workspaces (D-11).
- **PH0-T02 — monorepo layout.** Section 31 tree created: `apps/web`, `apps/api` (modules: health only), `packages/engine`, `packages/shared` (one trivial function/schema each), `tools/ingest`, `tools/replay` skeletons, `services/batch` README, `prisma/`, `infra/`, `docs/`, `data/raw/` (gitignored, `MANIFEST.sha256` committed).
- **PH0-T03 — services and config.** `infra/docker-compose.yml`: `postgres:18-alpine` (5432) and `redis:8-alpine` (6379) with `--appendonly yes --appendfsync everysec` per Section 15.2. `.env.example` files copied from Section 27.1 for api and web. Typed config module `apps/api/src/common/config/env.ts` (zod) fails fast listing every invalid variable; global `ConfigModule` provides `ENV`.
- **PH0-T04 — Prisma + health.** `prisma/schema.prisma` (no models — extensions only), baseline migration `20261107000000_extensions` (`citext`, `pgcrypto`), `migration_lock.toml`, `prisma.config.ts` (Prisma 7: datasource URL lives here, not in the schema), `prisma/seed.ts` stub. E-080: `GET /api/v1/health` (liveness) and `GET /api/v1/ready` (PostgreSQL `SELECT 1` + Redis `PING`, bounded 2 s, 503 `SERVICE_UNAVAILABLE` with `details.failed` when a dependency is down). Global envelope interceptor (`{data, meta.requestId}`), exception filter (error envelope, generic INTERNAL for unknown errors), request-id middleware, Helmet, CORS from `CORS_ORIGINS`, `trust proxy` flag.
- **PH0-T05 — tooling.** Root `eslint.config.mjs` (typescript-eslint recommended), Prettier, `.editorconfig`, per-package `lint`/`typecheck`/`test` scripts, Vitest 5 unit + integration configs, husky + lint-staged pre-commit (verified working — hook ran on the PH-0 commit).
- **PH0-T06 — CI.** `.github/workflows/ci.yml`: checkout (full history), pnpm/action-setup, setup-node from `.nvmrc` with pnpm cache, `pnpm install --frozen-lockfile`, `prisma generate`, `prisma migrate deploy` against a `postgres:18-alpine` service container, `redis:8-alpine` service container, lint → typecheck → unit tests → integration tests (`DATABASE_URL`/`REDIS_URL` env) → build → `pnpm audit --audit-level high` → gitleaks (`gitleaks/gitleaks-action@v3.0.0`).
- **PH0-T07 — docs.** `README.md`, `docs/STATUS.md`, `docs/ARCHITECTURE.md` (pinned versions + compatibility notes), and skeletons for all Section 33 docs.

## B. Files created / modified / deleted

Created: everything listed in Section 31 expected files — root configs (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.nvmrc`, `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`, `eslint.config.mjs`), `apps/api/**` (src, test, configs, `.env.example`), `apps/web/**`, `packages/{engine,shared}/**`, `tools/{ingest,replay}/**`, `services/batch/README.md`, `prisma/**`, `infra/docker-compose.yml`, `.github/workflows/ci.yml`, `.husky/pre-commit`, `docs/**`, `data/raw/{README.md,MANIFEST.sha256}`, `playbook.md` (extracted copy of the source docx).

Modified after creation: `apps/api/tsconfig.json` + `tsconfig.test.json` (NodeNext/Bundler split — see F), `apps/api/package.json` (start path `dist/src/main.js`, `@aptiva/engine` dep), `apps/web/tsconfig.json` (Next.js auto-adjusted `jsx`, `include`), `pnpm-workspace.yaml` (pnpm auto-added `minimumReleaseAgeExclude` and `allowBuilds`), `package.json`/`apps/web/package.json` (eslint 10→9.39.5).

Deleted: none. `aptiva_tmp/` extraction dir outside the repo was removed earlier; the source `.docx` untouched.

## C. Commands executed and observed results

| Command                                                                                | Result                                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm view <pkg> version` / `dist-tags` / `peerDependencies` for all Section 6 packages | Versions recorded (see ARCHITECTURE.md)                                                                                                                                                                                                           |
| `pnpm install`                                                                         | Success after `pnpm approve-builds --all -y` (argon2, esbuild, prisma engines, msgpackr postinstalls approved; recorded as `allowBuilds` in `pnpm-workspace.yaml`)                                                                                |
| `pnpm install --frozen-lockfile`                                                       | `Done in 174ms` — lockfile consistent                                                                                                                                                                                                             |
| `pnpm db:generate` (postinstall)                                                       | `✔ Generated Prisma Client (7.10.1) to .\apps\api\generated\prisma`                                                                                                                                                                               |
| `pnpm lint`                                                                            | `eslint .` — 0 errors, 0 warnings                                                                                                                                                                                                                 |
| `pnpm typecheck`                                                                       | All 6 projects pass (`tsc --noEmit`)                                                                                                                                                                                                              |
| `pnpm test`                                                                            | 13 tests passed across 6 projects (engine 1, shared 4, ingest 1, replay 1, api 6, web 1)                                                                                                                                                          |
| `pnpm build`                                                                           | `nest build` Done; `next build` compiled, TS passed, 3 static routes generated                                                                                                                                                                    |
| `node apps/api/dist/src/main.js` (dummy `DATABASE_URL`/`REDIS_URL`)                    | Booted; `GET /api/v1/health` → **200** `{"data":{"status":"ok"},...}`; `GET /api/v1/ready` → **503** `{"error":{"code":"SERVICE_UNAVAILABLE","details":{"failed":["postgres","redis"]}}}`; unknown route → 404 envelope; security headers present |
| `git commit` (husky pre-commit)                                                        | Commit `2bc6a7c`; lint-staged ran eslint --fix + prettier on staged files                                                                                                                                                                         |
| `docker compose -f infra/docker-compose.yml up -d`                                     | **NOT RUN — Docker is not installed on this machine**                                                                                                                                                                                             |
| `pnpm test:integration`                                                                | **NOT RUN locally — requires PostgreSQL/Redis.** Written and wired into CI service containers                                                                                                                                                     |
| CI green on a pull request                                                             | **NOT VERIFIED — no remote/PR exists yet**                                                                                                                                                                                                        |

## D. Tests executed and actual results

- Unit: `env.test.ts` (4: defaults, coercion, missing-var failure listing both `DATABASE_URL` and `REDIS_URL`, bad `NODE_ENV`), `health.test.ts` (2: `/health` 200 envelope + request id + workspace smoke imports of `@aptiva/engine`/`@aptiva/shared`), package smoke tests (engine 1, shared 4, ingest 1, replay 1, web 1). **All pass.**
- Integration (`test/integration/health.int.test.ts`, requires services): `/health` 200, `/ready` 200 with both deps up, `/ready` 503 `SERVICE_UNAVAILABLE`/`failed:["redis"]` with `REDIS_URL` pointed at a dead port. **Written, not executed locally.**
- Skipped: none locally; integration deferred to CI/Docker.

## E. Acceptance criteria status (PH-0 completion gate, Section 37)

| Criterion                                 | Status                                                                                            | Evidence                                                                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile` succeeds | Met                                                                                               | Section C                                                                                                                                                         |
| `docker compose up -d`                    | **Not verified locally** — no Docker; compose file written, CI uses equivalent service containers | —                                                                                                                                                                 |
| `pnpm lint`                               | Met                                                                                               | 0 problems                                                                                                                                                        |
| `pnpm typecheck`                          | Met                                                                                               | 6/6 projects                                                                                                                                                      |
| `pnpm test`                               | Met                                                                                               | 13/13 pass                                                                                                                                                        |
| `GET /api/v1/health` → 200                | Met                                                                                               | Live curl output above                                                                                                                                            |
| `/ready` → 503 when Redis stopped         | Met in substance                                                                                  | Live curl with unreachable Redis/PG returned 503 `SERVICE_UNAVAILABLE`; dedicated integration test written for CI                                                 |
| CI green on a PR                          | Pending — workflow written, needs a remote push                                                   | —                                                                                                                                                                 |
| Versions recorded with reasons            | Met                                                                                               | `docs/ARCHITECTURE.md`                                                                                                                                            |
| No feature code                           | Met                                                                                               | Only health endpoints, envelope plumbing, config, Prisma client shell; no auth, no tables beyond extensions migration, no real UI, no engine logic, no deployment |

## F. Known issues, limitations, workarounds

- **Docker absent locally** — all DB-backed verification deferred to CI. If Docker Desktop is installed later, run `docker compose -f infra/docker-compose.yml up -d && pnpm db:migrate:deploy && pnpm test:integration`.
- **`apps/api` is CommonJS** (`nest build` → `dist/src/`). Workspace packages export TypeScript source (`exports: ./src/index.ts`) consumed by Vitest/`tsc` paths; `apps/api/tsconfig.test.json` maps `@aptiva/*` to source for typecheck. If a later phase needs runtime imports inside `nest build` output, switch packages to built `dist/` — decide then (recorded in ARCHITECTURE.md).
- **api `typecheck` runs two configs**: `tsconfig.json` (src only, NodeNext emit config) and `tsconfig.test.json` (tests + configs, Bundler resolution, `rootDir: ../..`).
- **Prisma 7 changes**: `url` removed from `schema.prisma` datasource (now `prisma.config.ts` `datasource.url`, only when `DATABASE_URL` set so `prisma generate` works without a DB); client requires `@prisma/adapter-pg`; generated client lands in `apps/api/generated/prisma` (gitignored, regenerated by root `postinstall`).
- **pnpm `allowBuilds`/`minimumReleaseAgeExclude`** in `pnpm-workspace.yaml` were written by pnpm itself (approve-builds / supply-chain policy) — kept as-is.
- Local Node is **22.15.1**; `.nvmrc` pins **24** for CI/fresh clones (`engines: >=22` keeps local dev working).
- `playbook.md` in repo root is a formatted-text extraction of the source `.docx` (the docx itself is not committed).

## G. Unresolved decisions / questions

- D-01 (Kaggle dataset): team confirmed it will not be provided; DS-01 GitHub repo (`drsarveshwarbharti/Aptitude-For-Placements`) is the aptitude source. PH-3 must adapt: no DS-02 parser.
- D-05 (hosting/budget): still open — blocks PH-12 only.
- No new blockers for PH-1.

## H. Documentation updated

- `docs/ARCHITECTURE.md` — pinned versions, peer-compat rationale, Prisma 7 notes, workspace packaging note.
- `docs/STATUS.md` — PH0-T01…T07 marked done; open decisions listed.
- `docs/progress/phase-00.md` — this file.
- Docs skeletons for all Section 33 files created.

## I. Handover notes for PH-1 (Identity, RBAC, consent)

- Commands that work: `pnpm dev` (web+api parallel), `pnpm --filter @aptiva/api dev`, `pnpm db:migrate`, `pnpm db:seed` (stub), `pnpm test:integration` (needs compose).
- Env: copy `apps/api/.env.example` → `apps/api/.env`; required vars are only `DATABASE_URL` + `REDIS_URL` today — PH-1 must add `JWT_ACCESS_SECRET` etc. to the **required** set when auth lands.
- Conventions: global prefix `api/v1`; envelope `{data, meta.requestId}` via `EnvelopeInterceptor`; errors via `HttpExceptionFilter` + `ApiErrorCode` from `@aptiva/shared`; request id on `AptivaRequest.requestId`.
- Prisma: add models to `prisma/schema.prisma`, run `pnpm db:migrate` (needs compose up), client regenerates on postinstall.
- Nest DI note: constructor-injected classes need value imports (two `eslint-disable consistent-type-imports` comments mark this).
- Git repo initialized; commit style used: `PH-0: <summary>`.

## J. Confirmation

No work from later phases was performed (no auth, no domain tables, no product UI, no engine logic, no deployment). Nothing is reported as passing that was not executed; DB-backed and CI verification is explicitly marked pending.

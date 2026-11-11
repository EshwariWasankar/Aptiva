# Architecture

Selected at PH-0 per playbook Section 6 ("Version rule"): current stable or
LTS releases were queried from the npm registry on 2026-11-07, peer
dependencies checked, and exact versions pinned in `pnpm-lock.yaml`.

## Runtime and toolchain

| Item              | Version | Notes                                                                        |
| ----------------- | ------- | ---------------------------------------------------------------------------- |
| Node.js           | 24 LTS  | `.nvmrc`; `engines: >=22`. Local dev machine runs 22.15.1.                   |
| pnpm              | 12.15.0 | Workspaces (decision D-11). `packageManager` field pinned.                   |
| TypeScript        | 6.0.3   | Latest 6.x. TS 7.x excluded: `typescript-eslint@8.x` peer range is `<6.1.0`. |
| ESLint            | 10.14.0 | Flat config at repo root (`eslint.config.mjs`).                              |
| typescript-eslint | 8.72.1  | Recommended ruleset shared by all packages.                                  |
| Prettier          | 3.9.10  | Config in `.prettierrc.json`; lint-staged on pre-commit.                     |
| Vitest            | 5.1.0   | Unit and component tests.                                                    |
| Husky             | 9.1.7   | `prepare` script installs git hooks.                                         |
| lint-staged       | 17.6.0  | ESLint --fix + Prettier on staged files.                                     |
| tsx               | 4.23.15 | Runs `prisma/seed.ts`.                                                       |

## Application stack

| Layer         | Package(s)                                                        | Version                                 | Why / notes                                                                                                                                |
| ------------- | ----------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend      | next, react, react-dom                                            | 16.4.5 / 19.3.1                         | App Router, SSR for public pages (Section 5.1).                                                                                            |
| Styling       | tailwindcss, @tailwindcss/postcss                                 | 4.3.5                                   | Tailwind v4 via PostCSS plugin.                                                                                                            |
| Data fetching | @tanstack/react-query                                             | 5.107.1                                 | Server-state cache (Section 9).                                                                                                            |
| Forms         | react-hook-form                                                   | 7.91.0                                  | With zod schemas shared from `packages/shared`.                                                                                            |
| Validation    | zod                                                               | 4.6.7                                   | Shared schemas; authoritative validation in API.                                                                                           |
| Math          | katex                                                             | 0.19.1                                  | LaTeX rendering, trust disabled (SEC-006).                                                                                                 |
| Charts        | recharts                                                          | 3.10.1                                  | Radar and band charts (Section 8).                                                                                                         |
| Backend       | @nestjs/common, core, platform-express                            | 12.4.0                                  | Modular monolith, Express adapter.                                                                                                         |
| API testing   | @nestjs/testing, supertest                                        | 12.4.0 / 7.3.2                          | Integration tests against real services.                                                                                                   |
| ORM           | prisma, @prisma/client, @prisma/adapter-pg, pg                    | 7.10.1 / 8.23.1                         | Prisma 7 Rust-free client requires a driver adapter (`@prisma/adapter-pg` + `pg`). `prisma@8.x` is still RC — excluded per version policy. |
| Database      | PostgreSQL                                                        | 18                                      | `postgres:18-alpine` in compose/CI; extensions `citext`, `pgcrypto` (baseline migration).                                                  |
| Cache/queue   | ioredis                                                           | 6.0.0                                   | Streams, cache, BullMQ transport (Sections 5, 15).                                                                                         |
| Jobs          | bullmq                                                            | 6.7.1                                   | Post-session recalculation, emails (Section 10.2).                                                                                         |
| Passwords     | argon2                                                            | 0.45.2                                  | Argon2id (SEC-001); used from PH-1.                                                                                                        |
| Security      | helmet                                                            | 8.3.0                                   | Baseline HTTP headers on the API.                                                                                                          |
| E2E           | @playwright/test                                                  | 1.65.0                                  | Installed now; browser install deferred to PH-11.                                                                                          |
| Web tests     | vitest, jsdom, @testing-library/react, @vitejs/plugin-react, vite | 5.1.0 / 31.0.0 / 16.3.3 / 6.2.1 / 8.3.6 | Component tests (Section 24).                                                                                                              |
| Audit/scan    | pnpm audit, gitleaks-action                                       | —                                       | CI: `pnpm audit --audit-level high`, `gitleaks/gitleaks-action@v3.0.0`.                                                                    |

## Compatibility notes and workarounds

- **TypeScript 6.0.3, not 7.x.** `typescript@latest` is 7.0.2, but
  `typescript-eslint@8.72.1` declares `typescript: >=4.8.4 <6.1.0`. TS 6.0.3
  is the newest release inside the lint toolchain's peer range.
- **Prisma 7 driver adapter.** Prisma 7 removed the Rust query engine; the
  client runs on driver adapters. `PrismaService` therefore wraps
  `PrismaClient` with `PrismaPg` (`@prisma/adapter-pg`) using `DATABASE_URL`.
- **Generated client location.** `prisma-client` generator outputs to
  `apps/api/generated/prisma` (gitignored, regenerated by the root
  `postinstall` → `prisma generate`).
- **Workspace packages ship TypeScript source** (`exports` → `src/index.ts`)
  so Vitest and `tsc --noEmit` consume them without a build step. `apps/api`
  compiles to CommonJS; if a later phase needs runtime imports of
  `@aptiva/shared`/`@aptiva/engine` inside `nest build` output, switch those
  packages to built `dist/` output or an ESM toolchain — decide in that phase.
- **Redis append-only persistence** is enabled in
  `infra/docker-compose.yml` (`--appendonly yes --appendfsync everysec`) to
  match Section 15.2.

## Decisions referenced

- D-11: pnpm workspaces (default accepted).
- D-01 (Kaggle dataset): unresolved — does not block PH-0. Per team
  instruction, no Kaggle dataset will be used; DS-01 GitHub repository is the
  aptitude source.
- Hosting provider/budget (D-05): unresolved — blocks PH-12 only.

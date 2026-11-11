# Aptiva

A planning layer above question banks for placement aptitude preparation.
Students get an assessment-specific target level, a measured skill profile,
error-cause diagnosis, and a time-boxed daily plan that is recomputed after
every session.

This repository is a pnpm monorepo:

| Path              | Package          | Purpose                                       |
| ----------------- | ---------------- | --------------------------------------------- |
| `apps/web`        | `@aptiva/web`    | Next.js student/admin web app (PWA-ready)     |
| `apps/api`        | `@aptiva/api`    | NestJS modular monolith, REST `/api/v1`       |
| `packages/engine` | `@aptiva/engine` | Pure TypeScript estimation/planning engine    |
| `packages/shared` | `@aptiva/shared` | Shared zod schemas and API types              |
| `tools/ingest`    | `@aptiva/ingest` | Dataset parsers and import CLI (PH-3)         |
| `tools/replay`    | `@aptiva/replay` | Offline engine evaluation (PH-6)              |
| `prisma/`         | —                | Schema and migrations                         |
| `infra/`          | —                | docker-compose for local PostgreSQL and Redis |
| `docs/`           | —                | Project documentation (see `docs/STATUS.md`)  |

The authoritative specification is `playbook.md` (Aptiva End-to-End
Implementation Guide v1.0). Work proceeds phase by phase (PH-0 … PH-13);
see `docs/STATUS.md` for progress.

## Prerequisites

- Node.js 24 (see `.nvmrc`; Node 22+ works locally)
- pnpm 12 (`corepack enable` or `npm i -g pnpm`)
- Docker with Compose (for PostgreSQL and Redis)

## Quick start

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env   # fill in local values
cp apps/web/.env.example apps/web/.env
docker compose -f infra/docker-compose.yml up -d
pnpm db:migrate:deploy
pnpm db:generate        # already runs on postinstall
pnpm dev                # web + api in parallel
```

API health checks: `GET http://localhost:4000/api/v1/health` and
`GET http://localhost:4000/api/v1/ready`.

## Common commands

| Task              | Command                                            |
| ----------------- | -------------------------------------------------- |
| Lint              | `pnpm lint`                                        |
| Format            | `pnpm format` / `pnpm format:check`                |
| Type check        | `pnpm typecheck`                                   |
| Unit tests        | `pnpm test`                                        |
| Integration tests | `pnpm test:integration` (needs compose up)         |
| Build             | `pnpm build`                                       |
| Migrations        | `pnpm db:migrate` (dev) / `pnpm db:migrate:deploy` |
| Seed              | `pnpm db:seed`                                     |

## Conventions

- Exact pinned versions; lockfile committed. See `docs/ARCHITECTURE.md`.
- No secrets, datasets or real student data in the repository.
- Raw datasets live outside git under `data/raw/` (gitignored, checksum
  manifest only).
- Task IDs (`PH#-T##`) and requirement IDs (`FR-`, `NFR-`, `DATA-`, `ML-`,
  `SEC-`) from the playbook are used in commits and `docs/STATUS.md`.

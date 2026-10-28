# Aptiva

Planning layer above question banks for aptitude assessment preparation.

## Overview

Aptiva helps engineering students in India optimize their limited preparation time for placement aptitude assessments. It combines:

- Student's measured ability (accuracy, speed, error causes)
- Target assessment's blueprint
- Time available

Then produces a time-boxed daily plan that adapts after every session.

## Tech Stack

- **Frontend**: Next.js 16, React 19, TypeScript, Tailwind CSS, TanStack Query, KaTeX, Recharts
- **Backend**: NestJS 11, TypeScript, PostgreSQL with Prisma, Redis, BullMQ
- **ML/Engine**: Pure TypeScript (Elo/Glicko-2, EMA, rules, knapsack planner) - NO trained models in MVP
- **Package Manager**: pnpm workspaces
- **Testing**: Vitest, Playwright, k6

## Quick Start

### Prerequisites

- Node.js >= 22.15.1
- pnpm >= 12.15.0
- Docker (for PostgreSQL and Redis)

### Installation

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Start PostgreSQL and Redis
docker compose -f infra/docker-compose.yml up -d

# Set up environment variables
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# Run Prisma migrations
pnpm prisma:migrate

# Seed database (optional)
pnpm db:seed
```

### Development

```bash
# Start all services
pnpm dev

# Start web only
pnpm dev:web

# Start API only
pnpm dev:api

# Start workers
pnpm worker:dev
```

### Commands

```bash
# Build
pnpm build

# Test
pnpm test
pnpm test:integration
pnpm e2e

# Lint and typecheck
pnpm lint
pnpm typecheck

# Format
pnpm format

# Prisma
pnpm prisma:migrate
pnpm prisma:migrate:deploy
pnpm db:seed
```

## Project Structure

```
aptiva/
├── apps/
│   ├── web/              # Next.js frontend
│   └── api/              # NestJS backend
├── packages/
│   ├── engine/           # Pure TypeScript estimation/planning library
│   └── shared/           # Shared schemas and types
├── tools/
│   ├── ingest/           # Content import tools
│   └── replay/           # Engine replay and evaluation
├── prisma/               # Database schema and migrations
├── infra/                # Docker compose and infrastructure
├── docs/                 # Documentation
└── .github/workflows/    # CI/CD
```

## Documentation

- [Project Overview](docs/PROJECT_OVERVIEW.md)
- [Architecture](docs/ARCHITECTURE.md)
- [API Documentation](docs/API.md)
- [Database Schema](docs/DATABASE.md)
- [Testing Strategy](docs/TESTING.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Status](docs/STATUS.md)

## Implementation Status

See [docs/STATUS.md](docs/STATUS.md) for detailed phase and task status.

## License

[Specify your license here]

# Aptiva Architecture

## Technology Stack and Versions

Pinned versions as of October 2025 (PH-0):

### Core Runtime
- **Node.js**: v22.15.1 (Current LTS)
- **TypeScript**: v5.9.3
- **Package Manager**: pnpm v12.15.0 (workspaces)

### Frontend
- **Next.js**: v16.4.3 (Active LTS)
- **React**: v19.2.1
- **React DOM**: v19.2.1
- **Tailwind CSS**: v4.3.3
- **TanStack Query**: v5.104.5
- **react-hook-form**: v7.91.0
- **zod**: v4.6.7
- **KaTeX**: v0.19.1
- **Recharts**: v3.10.1

### Backend
- **NestJS**: v11.1.11
- **@nestjs/common**: v11.0.0
- **@nestjs/core**: v11.0.0
- **@nestjs/platform-express**: v11.0.0
- **@nestjs/config**: v4.0.0
- **@nestjs/swagger**: v8.0.0
- **@nestjs/bullmq**: v11.0.0
- **Prisma**: v7.9.1
- **@prisma/client**: v7.0.0
- **ioredis**: v5.0.0
- **bullmq**: v6.3.19
- **argon2**: v0.41.0
- **class-validator**: v0.14.0
- **class-transformer**: v0.5.0

### Testing
- **Vitest**: v5.0.5
- **Playwright**: v1.64.1
- **@axe-core/playwright**: v4.14.0
- **k6**: v2.3.0
- **supertest**: v7.0.0

### Code Quality
- **ESLint**: v9.0.0
- **Prettier**: v3.0.0
- **Husky**: v9.0.0

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Client                               │
│  ┌──────────────┐          ┌──────────────┐                 │
│  │ Next.js Web  │          │ Admin Console│                 │
│  └──────────────┘          └──────────────┘                 │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS REST
┌───────────────────────────┴─────────────────────────────────┐
│                    NestJS Backend                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Controllers  │  │   Guards     │  │   Engine     │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└───────┬────────────────────┬────────────────────┬───────────┘
        │                    │                    │
┌───────┴─────────┐  ┌───────┴─────────┐  ┌───────┴─────────┐
│  PostgreSQL     │  │      Redis      │  │  Object Storage│
│  (Primary DB)   │  │ (Stream/Cache) │  │  (Optional)     │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

## Module Architecture

### Frontend (apps/web)
- Route groups: `(public)`, `(student)`, `(admin)`
- Server rendering for public pages (SEO)
- Client rendering for practice runner
- State management with TanStack Query
- Forms with react-hook-form + zod

### Backend (apps/api)
- Modular monolith structure
- Modules: auth, users, catalog, questions, diagnostic, attempts, feedback, profile, requirements, planner, practice, reassessment, analytics, admin
- Cross-cutting: guards, filters, interceptors, logging, config
- Workers: stream consumer, recalculation, email jobs

### Engine (packages/engine)
- Pure TypeScript, no framework imports
- Functions: rating, EMA, marking, errors, priority, planner, readiness
- Versioned and extensively tested
- No trained models in MVP

### Shared (packages/shared)
- zod schemas
- DTO types
- Enums
- OpenAPI types

## Database Architecture

### Primary: PostgreSQL
- Relational data across attempts, profiles, blueprints, plans
- Prisma ORM with migrations
- Extensions: citext (case-insensitive), pgcrypto (UUID)

### Transient: Redis
- Attempt stream buffer
- Rate limiting
- Sessions
- Job queues (BullMQ)
- Caching

### Optional: Object Storage
- Uploaded documents
- Data exports
- S3-compatible bucket

## Request Lifecycle

1. Browser request → CDN/host edge
2. NestJS guard chain (rate limit, JWT, role, object ownership)
3. Validation (zod or class-validator)
4. Controller → Service → Engine (pure functions) → Prisma
5. Response envelope

**Answer submissions diverge**:
- Mark from cache
- Append to Redis stream
- Return before database write
- Consumer batch inserts asynchronously

## Security Architecture

- Auth: JWT access token (15 min), rotating refresh token (httpOnly cookie)
- RBAC: role-based access control
- OWASP Top 10 coverage
- Sanitised rich content
- Rate limiting
- Secrets in environment variables

## Performance Targets

- Read APIs: p95 under 300 ms
- Plan generation: under 1 s from cached state
- Answer submission: p95 under 150 ms with database paused
- Availability: 99.5% for MVP

## Decision Records

See the Implementation Guide for detailed decision records (Section 40).

# Testing Strategy

*This documentation will be expanded as tests are developed.*

## Test Layers

### Unit Tests
- **Tool**: Vitest
- **Scope**: Engine, services, validators, parsers
- **Location**: Each package's `src/**/*.test.ts`

### Integration Tests
- **Tool**: Vitest with supertest
- **Scope**: Endpoints, guards, pipeline, migrations
- **Requirements**: Real PostgreSQL and Redis (docker compose)
- **Location**: `apps/api/test/**/*.e2e-spec.ts`

### End-to-End Tests
- **Tool**: Playwright
- **Scope**: Full student journey and admin import
- **Location**: `apps/web/tests/e2e/**`

### Data Validation Tests
- **Tool**: Golden file parsers, schema tests
- **Scope**: Ingestion
- **Location**: `tools/ingest/**/*.test.ts`

### Security Tests
- **Tool**: OWASP ZAP, authorization matrix tests
- **Scope**: Section 21 of Implementation Guide
- **Trigger**: CI

### Performance Tests
- **Tool**: k6
- **Scope**: Submission path, plan generation, dashboard reads
- **Location**: `k6/scripts/**`

### Accessibility Tests
- **Tool**: axe-core in CI, manual keyboard pass
- **Scope**: Core screens
- **Trigger**: CI

## Test Commands

```bash
# Unit tests
pnpm test

# Integration tests
pnpm test:integration

# End-to-end tests
pnpm e2e

# Load tests
pnpm k6:submit
pnpm k6:plan
```

## Key Scenarios

From Implementation Guide Section 24:

- T-001: Registration
- T-002: Refresh reuse
- T-003: Cross-student access
- T-004: Diagnostic pause
- T-005: MCQ marking
- T-006: Numeric marking
- T-007: Idempotency
- T-008: Pipeline durability
- T-009: Flush barrier
- T-010: Error feedback priority
- T-011: Profile thin evidence
- T-012: Requirements validation
- T-013: Planner budget
- T-014: Planner fallback
- T-015: Daily loop
- T-016: Reassessment
- T-017: Import dry run
- T-018: Publish rules
- T-019: Export and delete
- T-020: XSS

*See the Implementation Guide Section 24 for the complete test strategy.*

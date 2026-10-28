# Database Documentation

*This documentation will be expanded as the schema is developed.*

## Technology

- **Database**: PostgreSQL
- **ORM**: Prisma
- **Migrations**: Prisma Migrate

## Current Schema

### Baseline Migration (PH-0)

Extensions only:
- `citext` - Case-insensitive text (for email)
- `pgcrypto` - UUID generation

No tables yet. Tables will be added in PH-1 onwards as per the Implementation Guide Section 12.

## Planned Tables

From the Implementation Guide Section 12.2:

### Identity
- `users`
- `refresh_tokens`
- `consent_records`
- `student_profiles`

### Taxonomy and Blueprints
- `topics`
- `concepts`
- `assessments`
- `assessment_versions`
- `assessment_sources`
- `blueprint_sections`
- `blueprint_topic_weights`

### Content
- `import_batches`
- `questions`
- `question_options`
- `question_reviews`
- `lessons`
- `error_types`

### Diagnostic, Sessions, Attempts
- `diagnostic_tests`
- `diagnostic_results`
- `practice_sessions`
- `question_attempts`
- `attempt_error_feedback`
- `attempt_error_inference`

### Profile, Requirements, Plans
- `student_topic_profiles`
- `profile_snapshots`
- `preparation_requirements`
- `practice_plans`
- `practice_plan_items`
- `plan_change_log`
- `readiness_estimates`

### Additional
- `reassessment_results`
- `mistake_entries`
- `uploaded_documents`
- `audit_log`

## Migration Commands

```bash
# Development
pnpm prisma:migrate

# Deployment
pnpm prisma:migrate:deploy

# Seed data
pnpm db:seed
```

*See the Implementation Guide Section 12 for the complete schema definition.*

-- PH-0 baseline migration: extensions only (playbook Section 12.2 conventions).
-- citext  : case-insensitive email column on users (PH-1)
-- pgcrypto: gen_random_uuid() primary keys (built into PG13+, kept explicit)

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

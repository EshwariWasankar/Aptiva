-- PH-2 content migration (playbook Section 12.2 DDL, verbatim where the
-- section specifies it). Adds: topics, concept_prerequisites, assessments,
-- assessment_versions, assessment_sources, blueprint_sections,
-- blueprint_topic_weights, import_batches, questions (+ question_format
-- enum), question_options, question_reviews, lessons, error_types.
-- CHECK constraints and the partial unique indexes live here only —
-- Prisma cannot express them.

-- Taxonomy and blueprints
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES topics(id),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('section','topic','subtopic','concept'))
);
CREATE TABLE concept_prerequisites (
  concept_id UUID REFERENCES topics(id),
  prerequisite_id UUID REFERENCES topics(id),
  PRIMARY KEY (concept_id, prerequisite_id)
);
CREATE TABLE assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  company TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE assessment_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id),
  version INT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from DATE NOT NULL,
  last_verified_at DATE,
  UNIQUE (assessment_id, version)
);
CREATE TABLE assessment_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES assessment_versions(id),
  source_type TEXT NOT NULL CHECK (source_type IN
    ('official','public','candidate_reported','pattern_inferred','assumption')),
  reference TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('low','medium','high')),
  last_verified_at DATE
);
CREATE TABLE blueprint_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES assessment_versions(id),
  name TEXT NOT NULL,
  order_no SMALLINT NOT NULL,
  duration_min SMALLINT,
  question_count_min SMALLINT,
  question_count_max SMALLINT,
  negative_marking NUMERIC(4,2), -- null means none or unknown, see source
  format_mix JSONB,              -- for example {"mcq":0.6,"numerical":0.4}
  source_id UUID REFERENCES assessment_sources(id)
);
CREATE TABLE blueprint_topic_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES blueprint_sections(id),
  topic_id UUID NOT NULL REFERENCES topics(id),
  share NUMERIC(4,3) NOT NULL CHECK (share BETWEEN 0 AND 1),
  difficulty_band SMALLINT CHECK (difficulty_band BETWEEN 1 AND 3),
  pace_seconds INT,
  source_id UUID REFERENCES assessment_sources(id),
  UNIQUE (section_id, topic_id)
);

-- Content
CREATE TABLE import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT NOT NULL,
  source_ref TEXT NOT NULL, -- URL plus commit or version
  parser_version TEXT NOT NULL,
  accepted INT NOT NULL DEFAULT 0,
  rejected INT NOT NULL DEFAULT 0,
  duplicates INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES users(id),
  reversed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TYPE question_format AS ENUM ('mcq','numerical');
CREATE TABLE questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id),
  format question_format NOT NULL DEFAULT 'mcq',
  stem TEXT NOT NULL,
  solution TEXT,
  difficulty_prior SMALLINT NOT NULL CHECK (difficulty_prior BETWEEN 1 AND 3),
  elo_rating REAL NOT NULL DEFAULT 1000,
  expected_time_ms INT NOT NULL CHECK (expected_time_ms > 0),
  language TEXT NOT NULL DEFAULT 'en',
  numeric_answer NUMERIC,
  answer_format TEXT CHECK (answer_format IN ('integer','decimal')),
  decimal_places SMALLINT,
  tolerance NUMERIC,
  pool TEXT NOT NULL DEFAULT 'practice' CHECK (pool IN ('diagnostic','practice','reassessment')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','published','retired')),
  source_name TEXT,
  author TEXT,
  llm_assisted BOOLEAN NOT NULL DEFAULT FALSE,
  import_batch_id UUID REFERENCES import_batches(id),
  stem_hash TEXT NOT NULL, -- normalised text hash for dedupe
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT numerical_needs_answer CHECK (format = 'mcq' OR numeric_answer IS NOT NULL),
  CONSTRAINT published_needs_source CHECK (status <> 'published' OR source_name IS NOT NULL)
);
CREATE INDEX idx_questions_cell ON questions (topic_id, difficulty_prior, pool, status);
CREATE UNIQUE INDEX uq_questions_hash ON questions (stem_hash) WHERE status <> 'retired';
CREATE TABLE question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  trap_tag TEXT,
  order_no SMALLINT NOT NULL
);
CREATE UNIQUE INDEX uq_one_correct ON question_options (question_id) WHERE is_correct;
CREATE TABLE question_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES questions(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (question_id, reviewer_id)
);
CREATE TABLE lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES topics(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  reviewed_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE error_types (
  id SMALLINT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  category TEXT NOT NULL
);

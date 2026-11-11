-- PH-5 (Section 12.1): diagnostic tests, results, error feedback,
-- error inference. last_activity_at added for the 48-hour partial rule.

CREATE TABLE diagnostic_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('standard','express')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','submitted','partial')),
  question_ids UUID[] NOT NULL,
  pause_count SMALLINT NOT NULL DEFAULT 0 CHECK (pause_count <= 1),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diagnostic_user_status ON diagnostic_tests (user_id, status);

CREATE TABLE diagnostic_results (
  diagnostic_id UUID PRIMARY KEY REFERENCES diagnostic_tests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  summary JSONB NOT NULL,
  engine_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attempt_error_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL UNIQUE REFERENCES question_attempts(id) ON DELETE CASCADE,
  error_type_id SMALLINT NOT NULL REFERENCES error_types(id),
  free_text TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE attempt_error_inference (
  attempt_id UUID PRIMARY KEY REFERENCES question_attempts(id) ON DELETE CASCADE,
  error_type_id SMALLINT REFERENCES error_types(id),
  method TEXT NOT NULL CHECK (method IN ('reported','rule')),
  confidence REAL NOT NULL,
  conflict BOOLEAN NOT NULL DEFAULT FALSE
);

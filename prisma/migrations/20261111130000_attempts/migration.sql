-- PH-4 (Section 12.1): practice sessions and question attempts.
-- context_id is polymorphic (practice_sessions.id for 'practice',
-- diagnostic_tests.id for 'diagnostic' later) so it has no FK.

CREATE TABLE practice_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('practice','check','topic_test','mock')),
  plan_item_id UUID,
  planned_minutes SMALLINT,
  actual_minutes SMALLINT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','finished','expired')),
  recalc_status TEXT NOT NULL DEFAULT 'none'
    CHECK (recalc_status IN ('none','pending','done','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_sessions_user_time ON practice_sessions (user_id, started_at);

CREATE TABLE question_attempts (
  id UUID PRIMARY KEY, -- client-generated idempotency key
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES questions(id),
  context_type TEXT NOT NULL
    CHECK (context_type IN ('diagnostic','practice','reassessment')),
  context_id UUID NOT NULL,
  shown_at TIMESTAMPTZ NOT NULL,
  answered_at TIMESTAMPTZ NOT NULL,
  time_ms INT,
  selected_option_id UUID REFERENCES question_options(id),
  numeric_input NUMERIC,
  rounding_suspected BOOLEAN NOT NULL DEFAULT FALSE,
  is_correct BOOLEAN,
  skipped BOOLEAN NOT NULL DEFAULT FALSE,
  sequence_no INT NOT NULL,
  revisit_count SMALLINT NOT NULL DEFAULT 0,
  answer_changes SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attempts_user_time ON question_attempts (user_id, answered_at);
CREATE INDEX idx_attempts_context ON question_attempts (context_type, context_id);

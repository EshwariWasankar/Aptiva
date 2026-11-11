-- PH-3 (Section 12.5): company pattern records, topic synonyms,
-- question-assessment fit tags.

CREATE TABLE company_pattern_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID NOT NULL REFERENCES import_batches(id),
  company TEXT NOT NULL,
  round_name TEXT,
  section_name TEXT,
  topic_text TEXT,
  topic_id UUID REFERENCES topics(id),
  question_count INT,
  minutes INT,
  negative_marking TEXT,
  difficulty_note TEXT,
  source_path TEXT NOT NULL,
  source_commit TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'extracted'
    CHECK (status IN ('extracted','mapped','used','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cpr_company ON company_pattern_records (company, status);

CREATE TABLE topic_synonyms (
  phrase TEXT PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES topics(id)
);

CREATE TABLE question_assessment_tags (
  question_id UUID NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES blueprint_sections(id) ON DELETE CASCADE,
  fit REAL NOT NULL CHECK (fit BETWEEN 0 AND 1),
  basis TEXT NOT NULL CHECK (basis IN ('topic_match','format_match','manual')),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (question_id, section_id)
);
CREATE INDEX idx_qat_section_fit ON question_assessment_tags (section_id, fit DESC);

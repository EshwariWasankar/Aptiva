-- Prisma maps the schema enum name verbatim to the Postgres type name;
-- the content migration created it lowercase. Rename to match.
ALTER TYPE question_format RENAME TO "QuestionFormat";

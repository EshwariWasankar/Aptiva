-- Baseline migration: extensions only
-- This migration sets up the database extensions needed for Aptiva
-- More tables will be added in later phases (PH-1 onwards)

-- Enable citext extension for case-insensitive text (needed for email)
CREATE EXTENSION IF NOT EXISTS citext;

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

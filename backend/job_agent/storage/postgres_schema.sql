-- PostgreSQL schema for DB-backed multi-user job alerts (central sender model)
-- Safe to run repeatedly because objects are created IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email_to TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  timezone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  keyword TEXT,
  llm_input_limit INTEGER,
  max_bullets INTEGER,
  remote_only BOOLEAN,
  strict_senior_only BOOLEAN,
  profile_overrides_jsonb JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migration cleanup: sources are now config-driven (YAML/shared config), not DB-driven.
ALTER TABLE user_preferences
  DROP COLUMN IF EXISTS sources_jsonb;

CREATE TABLE IF NOT EXISTS user_state (
  user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_job_keys_jsonb JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_run_at TIMESTAMPTZ,
  last_email_sent_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS run_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  run_type TEXT NOT NULL,           -- scheduled / manual
  status TEXT NOT NULL,             -- success / skipped / error
  fetched_jobs_count INTEGER,
  keyword_jobs_count INTEGER,
  emailed_jobs_count INTEGER,
  sources_used_jsonb JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  admin_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  admin_username TEXT,
  admin_email_to TEXT,
  action TEXT NOT NULL,              -- activate_user / deactivate_user
  target_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  target_username TEXT,
  target_email_to TEXT,
  metadata_jsonb JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sent_job_records (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL,
  source TEXT,
  job_url TEXT,
  title TEXT,
  company TEXT,
  location_text TEXT,
  normalized_location_jsonb JSONB,
  first_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  UNIQUE (user_id, job_key)
);

ALTER TABLE sent_job_records
  ADD COLUMN IF NOT EXISTS location_text TEXT;

ALTER TABLE sent_job_records
  ADD COLUMN IF NOT EXISTS normalized_location_jsonb JSONB;

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (is_active);

CREATE INDEX IF NOT EXISTS idx_run_logs_user_started_at
  ON run_logs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at
  ON admin_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sent_job_records_user_last_seen
  ON sent_job_records (user_id, last_seen_at DESC);

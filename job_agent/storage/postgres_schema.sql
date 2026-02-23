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
  sources_jsonb JSONB,
  llm_input_limit INTEGER,
  max_bullets INTEGER,
  remote_only BOOLEAN,
  strict_senior_only BOOLEAN,
  profile_overrides_jsonb JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS sent_job_records (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_key TEXT NOT NULL,
  source TEXT,
  job_url TEXT,
  title TEXT,
  company TEXT,
  first_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ,
  UNIQUE (user_id, job_key)
);

CREATE INDEX IF NOT EXISTS idx_users_active
  ON users (is_active);

CREATE INDEX IF NOT EXISTS idx_run_logs_user_started_at
  ON run_logs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_sent_job_records_user_last_seen
  ON sent_job_records (user_id, last_seen_at DESC);


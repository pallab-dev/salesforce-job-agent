# Changelog

This project keeps a lightweight iteration log tied to Git commit IDs so collaborators can understand what changed and why.

## Iteration History

### 2026-02-24 - Email digest dedupe and grouped rendering polish

- Summary: Deduplicated repeated LLM bullets by URL, switched digest sections to grouped job rendering (company-level compression for larger clusters), and updated subject lines to count-based alert wording.
- Why: Fix noisy/repeated emails and make the digest easier to scan without changing the underlying fetch/filter pipeline.
- Commit: pending (local changes not pushed yet)

### 2026-02-24 - Scheduler caching, carryover digests, and filtering hardening

- Summary: Added shared per-run source fetch caching, `new + carryover` digest behavior (LLM on new jobs only), sent-job persistence/TTL, Groq payload retry-downsizing, run metrics logging, and deterministic filtering upgrades including user `negative_keywords`.
- Why: Improve scalability and reliability for multi-user scheduling while reducing LLM payload size/cost and keeping the codebase extensible at an early stage.
- Commit: `67e2780` - `Improve scheduler caching and job digest filtering`

### 2026-02-23 - PostgreSQL schema and DB layer skeleton (planned migration)

- Summary: Added Postgres schema SQL and a Python DB access layer skeleton for users, preferences, runtime state, and run logs.
- Why: Prepare migration from GitHub Environment-based per-user config to DB-backed user management with a central sender model.
- Commit: pending (local changes not pushed yet)

### 2026-02-23 - Shared config fallback for all profiles

- Summary: Profiles now fall back to `config/profiles/default.yml` when a profile-specific YAML file is missing.
- Why: Allows one shared config for all users while preserving optional per-user overrides.
- Commit: `23c759b` - `Use default profile config as shared fallback`

### 2026-02-23 - Config-driven profiles + Remotive source

- Summary: Added YAML-based profile config loading, source registry, and the first multi-source integration (`Remotive`) alongside `RemoteOK`.
- Why: Start moving source selection/limits into config and increase job coverage with multiple sources.
- Commit: `b50eb2c` - `Add config-driven profiles and Remotive source`

### 2026-02-23 - Manual profile workflow execution fix

- Summary: Split GitHub Actions into matrix/all-profiles and single-profile jobs.
- Why: Fix invalid `matrix.profile` usage in a job-level `if` condition.
- Commit: `b9cf4b2` - `Fix manual profile workflow execution`

### 2026-02-23 - Multi-profile GitHub Actions environments

- Summary: Added profile-aware CLI and GitHub Actions environment-based multi-user scheduling.
- Why: Allow multiple users to run scheduled jobs with isolated email credentials.
- Commit: `43b0f40` - `Add multi-profile GitHub Actions environment support`

### 2026-02-23 - Snapshot-based email list + onboarding docs

- Summary: Changed email behavior to send the current matching job list snapshot (not only newly discovered jobs) and expanded `README.md`.
- Why: Match expected email behavior and make the repo usable by collaborators.
- Commit: `89049f4` - `Update README and use snapshot-based job list emails`

### 2026-02-23 - Modular Python package refactor

- Summary: Moved workflow inline Python into a structured `job_agent` package with CLI entrypoint and minimal GitHub Actions workflow.
- Why: Improve maintainability and prepare for future features (dedupe, multi-source, config-driven setup).
- Commit: `0cf8309` - `Refactor job agent into modular Python package`

### Earlier workflow-only iterations (YAML-inline phase)

- `9735e12` - Improve job fetching and email notification process
- `81191bd` - Enhance job alert bot functionality and output
- `73368aa` - Refactor email sending in workflow
- `4eaf0a4` - Enhance email sending process in workflow
- `0e2f5b0` - Update job filtering and API call in workflow
- `ee98ff3` - Update model name in workflow configuration

## How to update this file

For each significant iteration:

1. Add a new entry at the top
2. Include:
   - what changed
   - why it changed
   - commit ID and commit message
3. If the change is larger, add a detailed note in `docs/iterations/`

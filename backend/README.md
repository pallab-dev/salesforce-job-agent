# AI Job Alert Agent (Groq + Gmail + GitHub Actions)

Monorepo note:

- Python/backend commands in this file assume you are running from the `backend/` directory.
- The React UI lives in the top-level `frontend/` directory.

Automated job alert agent that:

- fetches jobs from multiple sources (`RemoteOK`, `Remotive`, `Greenhouse`, `Lever`, `Workday`/company boards, global ATS adapters, custom careers pages)
- filters them with Groq (`llama-3.1-8b-instant`)
- emails results through Gmail SMTP
- runs on GitHub Actions every 8 hours

It can also run locally from the CLI for testing.

## Project History

- `CHANGELOG.md` contains iteration summaries linked to commit IDs
- `docs/iterations/` can be used for detailed milestone notes

## Next Architecture (Planned)

- Central sender mode (shared sender credentials, per-user `EMAIL_TO`)
- PostgreSQL-backed user registry and preferences (`DATABASE_URL`)
- Single scheduled workflow run that loads active users from DB

## What It Does

Current flow:

1. Fetch jobs from enabled sources
2. Filter by keyword and apply deterministic ranking/filtering
3. Send only `new` jobs to Groq for AI relevance filtering
4. Reuse previously sent jobs as carryover (no extra LLM call)
5. Clean/assemble the digest and send email
6. Persist snapshot state, sent-job history, and run metrics

## Current Email Behavior (Important)

The digest is `new + carryover`:

- `New matches` are sent to Groq and included in the email if selected by the LLM.
- `Still open / previously shared` carryover jobs are reused from sent history if they still appear in the current run (no LLM call).
- Email sections are deduplicated by job URL/key before sending.
- Companies with many jobs are grouped into a compact summary line in the email body (instead of repeating every job bullet).

Subject line format:

- count-based alert/update style (examples: `Developer Jobs: 3 New + 4 Still Open`, `Java Jobs Alert: 2 New Matches`)

Current carryover policy (backend defaults):

- max carryover jobs per email: `10`
- carryover age window (TTL): `14` days

State tracking:

- `.job_agent/seen_jobs.json` (or DB `user_state.current_job_keys_jsonb`) is used for add/remove snapshot comparisons
- DB `sent_job_records` stores jobs that were actually emailed

## Project Structure

```text
config/
  profiles/
    default.yml            # profile defaults (config-driven behavior)
  sources/
    companies.yml          # Company source config (ATS + custom careers candidates)

job_agent/
  main.py                  # CLI entrypoint
  config.py                # env/config loading
  profile_config.py        # YAML profile config loader
  agent.py                 # orchestration logic
  sources/remoteok.py      # job source integration
  sources/registry.py      # source selection/aggregation (config-driven + source metadata)
  sources/global_ats.py    # global ATS + custom careers adapters
  source_onboarding.py     # source validation cache / auto-onboarding
  llm/groq.py              # Groq API call + prompt
  notify/emailer.py        # Gmail SMTP sender
  utils/cleaning.py        # LLM output cleanup
  utils/location_normalization.py  # normalized location fields for downstream filtering/insights
  storage/seen_jobs.py     # snapshot file read/write

.github/workflows/agent.yml
requirements.txt
```

## Requirements

- Python `3.11+` (local)
- A Groq API key
- A Gmail account with an App Password (recommended)

## Environment Variables

Required for normal runs:

- `GROQ_API_KEY`
- `EMAIL_USER`
- `EMAIL_PASS`

Notes:

- `EMAIL_USER` is the Gmail login/sender.
- `EMAIL_PASS` should be a Gmail App Password (16 characters). Spaces are stripped automatically in code.
- `EMAIL_TO` is optional for single-user/local runs. If set, email is sent to `EMAIL_TO`; otherwise it sends to `EMAIL_USER`.
- In the DB-backed multi-user workflow, recipients come from PostgreSQL (`users.email_to`) instead of `EMAIL_TO` secrets.

Optional env vars (advanced):

- `GROQ_MODEL` (default: `llama-3.1-8b-instant`)
- `GROQ_API_URL`
- `SMTP_HOST` (default: `smtp.gmail.com`)
- `SMTP_PORT` (default: `587`)
- `REMOTEOK_API_URL`
- `REQUEST_TIMEOUT_SECONDS`
- `GROQ_TIMEOUT_SECONDS`

## Local Setup

1. Clone the repo
2. Create and activate a virtual environment
3. Install dependencies
4. Export environment variables
5. Run the CLI

Example:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

export GROQ_API_KEY="your_groq_key"
export EMAIL_USER="your_email@gmail.com"
export EMAIL_PASS="your_gmail_app_password"

python -m job_agent.main --keyword developer
```

## CLI Usage

Basic run:

```bash
python -m job_agent.main --keyword developer
```

Dry run (prints output instead of sending email):

```bash
python -m job_agent.main --keyword developer --dry-run
```

Profile-based run (stores snapshot state separately per profile):

```bash
python -m job_agent.main --profile pallab --keyword developer
```

Profile config-driven run (no keyword/limits flags needed if configured in YAML):

```bash
python -m job_agent.main --profile pallab
```

Useful options:

- `--keyword` title keyword match (default `developer`)
- `--profile` profile name used for per-profile snapshot file paths
- `--sources` comma-separated sources (overrides profile YAML, e.g. `remoteok,remotive`)
- `--llm-input-limit` max jobs sent to Groq (overrides profile YAML)
- `--max-bullets` max bullet results in output/email (overrides profile YAML)
- `--dry-run` print instead of email
- `--disable-dedupe` disables previous/current snapshot comparison
- `--seen-file` custom snapshot file path (default `.job_agent/seen_jobs.json`)
- `--profile-config` custom YAML config path (default `config/profiles/<profile>.yml`)

## DB CLI (Users + Source Validation)

Initialize / migrate schema (safe to run repeatedly):

```bash
python -m job_agent.db_main db init
```

Validate configured company source candidates and update runtime activation cache:

```bash
python -m job_agent.db_main sources validate --timeout-seconds 15
```

Print a readable validation cache report (stdout only):

```bash
python -m job_agent.db_main sources report --max-rows 10
```

Scheduled all-user run with automatic source validation first (default behavior for `--all-users`):

```bash
python -m job_agent.db_main run --all-users --source-validate-timeout-seconds 15
```

Notes:

- `run --all-users` validates company source candidates before fetching jobs unless `--no-validate-sources` is used.
- Validation state is cached in `backend/.job_agent/source_validation_cache.json`.
- `sources report` reads the cache and prints a grouped summary (`active / paused / error / no_jobs / candidate`).
- Scheduled runs now also print per-source fetched/matched breakdown logs inside the agent run (useful for verifying global ATS and `custom_careers` contribution).
- PostgreSQL connections disable psycopg server-side prepared statements by default to avoid PgBouncer/Supabase transaction-pooling errors (for example `prepared statement "_pg3_0" does not exist`).

## Minimal Login UI (Prototype)

You can run a very small local web UI that creates/updates a user in PostgreSQL on login.

Prerequisite:

- `DATABASE_URL` must be set

Run:

```bash
python -m job_agent.web_app --init-db --host 127.0.0.1 --port 8080
```

Then open `http://127.0.0.1:8080` and submit:

- `username`
- `email`
- optional `timezone`

This prototype stores the user via `users` table upsert and does not implement password authentication yet.

## Config-Driven Profiles (New)

You can now control profile behavior from YAML instead of hardcoding values in Python.

Default lookup:

- `--profile pallab` -> `config/profiles/pallab.yml` (if present)
- no `--profile` -> `config/profiles/default.yml` (if present)
- missing profile file -> falls back to `config/profiles/default.yml`
- if `default.yml` is also missing -> built-in defaults are used safely

Example `config/profiles/default.yml`:

```yaml
keyword: developer

sources:
  - remoteok
  - remotive

limits:
  llm_input_limit: 15
  max_bullets: 8

filters:
  remote_only: true
  strict_senior_only: true
```

What this gives you today:

- Change keyword per profile without editing Python
- Prepare source lists per profile (`remoteok` and `remotive` currently implemented)
- Add many company boards via config only (Greenhouse/Lever adapters now implemented)
- Change LLM/email output limits per profile

Shared config mode (recommended if all users should behave the same):

- Keep only `config/profiles/default.yml`
- Do not create `config/profiles/<profile>.yml` unless a user needs custom settings
- `--profile pallab` / `--profile saikia` will automatically use `default.yml` when their profile file is missing

Note:

- If you add an unimplemented source (for example `workday` before its adapter exists) the agent will print a skip message and continue.
- This is the first step toward fully config-driven multi-source support.

### Company Board Plugins + Global ATS / Custom Careers

You can now enable company career pages (via ATS platforms) without changing Python code.

Supported plugins:

- `greenhouse`
- `lever`
- `workday` (starter/custom path implemented; company-specific endpoints may still be needed)
- `workday` / `custom` / `salesforce_careers` (via the `workday` plugin path)
- `ashby`
- `smartrecruiters`
- `bamboohr`
- `jobvite`
- `icims`
- `personio`
- `recruitee`
- `custom_careers` (generic public careers page / JSON / XML best-effort adapter)

Add them to your shared profile config (already enabled in `config/profiles/default.yml` in this repo):

```yaml
sources:
  - remoteok
  - remotive
  - greenhouse
  - lever
```

Then configure companies in `config/sources/companies.yml`:

```yaml
greenhouse:
  - company: ExampleCo
    board_token: exampleco
    active: true

lever:
  - company: ExampleOrg
    company_slug: exampleorg
    active: true

workday:
  - company: ExampleBigCo
    platform: custom
    careers_url: https://careers.example.com/jobs
    active: false
  - company: Salesforce
    platform: salesforce_careers
    listing_url: https://careers.salesforce.com/jobs
    max_pages: 5
    active: true
```

Notes:

- These adapters are best for company career pages at scale (many companies use Greenhouse/Lever)
- If one company token/slug fails, the agent logs it and continues
- For India-focused coverage, add India companies that use these platforms
- FAANG + Salesforce targets are added in `config/sources/companies.yml` under `workday` as planned entries
- Salesforce is wired now via the `salesforce_careers` listing parser (configured under `workday`)
- Most other FAANG targets will still need company-specific `api_url` values (or dedicated adapters) before they return jobs
- A curated `custom_careers` candidate pack (service/product/startup mix) is included and uses `onboarding_state: candidate` so runtime activation is automatic after validation.
- Mark repeated hard-fail candidates as `onboarding_state: paused` to reduce validation noise until a better endpoint/URL is available.

### Automatic Source Onboarding (Candidates -> Active)

Company-source entries can be onboarded without manual activation by using:

- `onboarding_state: candidate` in `config/sources/companies.yml`
- `python -m job_agent.db_main sources validate` to check candidates and update runtime state cache
- `python -m job_agent.db_main run --all-users` (auto-validates first by default)

Only runtime-validated candidates are used in scheduled runs. This keeps onboarding broad while keeping runs fail-soft and fast.

## Email / Filtering Reliability Notes

- LLM output cleanup preserves valid bullets even if the model wraps them in markdown fences (fence markers are stripped, bullet content is kept).
- If fallback email rendering is used (LLM bullets cannot be mapped back to fetched jobs), bullet lines are parsed and recorded into sent-job history to reduce duplicate re-sends in later runs.
- Keyword ranking now understands comma-separated multi-keyword preferences and malformed repeated multi-keyword strings, aligning ranking behavior with deterministic keyword filtering.
- Deterministic pre-LLM filtering is now intent-aware and can widen matches using profile signals / inferred keyword intent:
  - role-like terms (for example `backend engineer`, `salesforce developer`)
  - tech stack tags (matched with `OR` semantics, e.g. `java OR golang OR angular`)
  - seniority hints (`junior`, `senior`, `lead`, etc.)
  - work-mode hints (`remote`, `hybrid`, `onsite`)
- This widening is bounded and still followed by deterministic ranking + LLM selection.

## GitHub Actions Setup

The workflow is in `.github/workflows/agent.yml` and runs:

- on a schedule (`every 8 hours`)
- manually (`workflow_dispatch`)

### Add Repository Secrets (DB + central sender mode)

In GitHub:

`Repo -> Settings -> Secrets and variables -> Actions -> New repository secret`

Add:

- `DATABASE_URL`
- `GROQ_API_KEY`
- `EMAIL_USER`
- `EMAIL_PASS`

Recommended:

- Keep `EMAIL_USER` / `EMAIL_PASS` as a single central sender mailbox at repo level
- Store user recipients in PostgreSQL (`users.email_to`)

### Trigger a Manual Run

1. Open the repo in GitHub
2. Go to `Actions`
3. Open `AI Job Alert Agent`
4. Click `Run workflow`

## Multi-User Setup (PostgreSQL + Central Sender)

This repo now supports multi-user scheduled runs from a single GitHub Actions job by loading users from PostgreSQL.

How it works:

- GitHub Actions stores shared secrets only: `DATABASE_URL`, `GROQ_API_KEY`, `EMAIL_USER`, `EMAIL_PASS`
- The workflow initializes the schema (`python -m job_agent.db_main db init`)
- The workflow runs all active DB users (`python -m job_agent.db_main run --all-users`) and auto-validates company source candidates first by default
- Users are stored in PostgreSQL (`users` table) with `username` + `email_to`
- User-specific preferences (optional) are stored in `user_preferences` (keyword/limits/filters; sources stay in shared YAML config)
- Shared defaults continue to come from `config/profiles/default.yml`
- Scheduler fetches each unique source-set once per run and reuses the result for multiple users (shared in-memory cache)
- `run_logs` now records fetched/keyword/emailed counts for each DB user run
- `sent_job_records` is used to build carryover sections without re-sending old jobs to Groq
- `sent_job_records` now stores normalized location metadata used by dashboard market opportunity insights
- Single-user DB runs (`run --user ...`) and all-user DB runs now use the same state/logging behavior (`run_logs` + `user_state` updates)

### What You Need To Sign Up For (Free)

You need a PostgreSQL database and connection string (`DATABASE_URL`).

Free options:

- Supabase (Postgres): https://supabase.com/
- Neon (Postgres): https://neon.tech/

After signup:

1. Create a project/database
2. Copy the Postgres connection string
3. Add it as repo secret: `DATABASE_URL`

### Initialize DB Schema

Local or CI:

```bash
export DATABASE_URL="postgresql://..."
python -m job_agent.db_main db init
```

### Add / Manage Users

Add users:

```bash
python -m job_agent.db_main users add --username pallab --email-to pallab@example.com
python -m job_agent.db_main users add --username saikia --email-to saikia@example.com
```

Add user with overrides (optional):

```bash
python -m job_agent.db_main users add \
  --username saikia \
  --email-to saikia@example.com \
  --keyword "salesforce developer" \
  --llm-input-limit 25 \
  --max-bullets 12
```

Validation / safety notes:

- `llm_input_limit` is validated to `1..80`
- `max_bullets` is validated to `1..20`
- runtime also clamps unsafe values before Groq calls

List users:

```bash
python -m job_agent.db_main users list
```

Activate/deactivate:

```bash
python -m job_agent.db_main users deactivate --username saikia
python -m job_agent.db_main users activate --username saikia
```

Optional config-driven defaults:

- Keep only `config/profiles/default.yml` for shared defaults
- Add `config/profiles/<username>.yml` only if needed
- Sources are intentionally config-driven now (not stored in DB)
- Additional profile signals can be stored in `user_preferences.profile_overrides_jsonb` (for example `target_roles`, `tech_stack_tags`, `negative_keywords`)

### Manual Run for One DB User

The workflow has a `username` input.

- Leave it empty: runs all active DB users
- Set it to `saikia`: runs only that DB user

Important:

- The input value must match a `users.username` row in the DB
- The user must be active

## Gmail Setup (App Password)

If using Gmail SMTP:

1. Enable 2-Step Verification on the Google account:
   - https://myaccount.google.com/security
2. Create an App Password:
   - https://myaccount.google.com/apppasswords
3. Use that App Password as `EMAIL_PASS`

Do not use your normal Gmail password.

Reference (Google Help):
- https://support.google.com/accounts/answer/185833

## Troubleshooting

- `Missing required environment variables`:
  - Check that `GROQ_API_KEY`, `EMAIL_USER`, `EMAIL_PASS` are set (unless `--dry-run`)
  - For DB commands/workflow, also set `DATABASE_URL`
- Gmail login fails:
  - Confirm you are using an App Password, not the account password
  - Re-copy the App Password (spaces are okay; code strips them)
- Groq errors:
  - Check model name (`llama-3.1-8b-instant`)
  - Confirm API key is valid and active
  - Groq `413 Payload Too Large` is automatically retried with a smaller LLM input batch
- No email sent:
  - Groq may return `NONE` (no relevant jobs found)
  - If there are no new jobs and no carryover jobs, the digest is skipped

## Filtering & Optimization Notes

- Deterministic pre-LLM filtering now:
  - boosts title matches over description-only matches
  - reduces obvious non-software title noise for software-focused searches
  - supports user `negative_keywords` (dashboard/API preference)
- LLM payload controls:
  - only `new` jobs go to Groq
  - max `3` jobs/company are sent to Groq
  - oversized Groq requests are reduced and retried automatically
- Email rendering controls:
  - deduplicates repeated LLM bullets by URL (helps when the model repeats the same job)
  - groups larger company clusters in the digest for better readability

## Notes for Contributors

- Main entrypoint: `job_agent/main.py`
- DB CLI entrypoint: `job_agent/db_main.py`
- Core workflow logic: `job_agent/agent.py`
- Keep the GitHub Actions workflow minimal; put logic in Python modules
- `.job_agent/` is ignored in git because it contains local snapshot state
- DB schema and access layer live in `job_agent/storage/postgres_schema.sql` and `job_agent/storage/postgres_db.py`

## Roadmap (Planned)

- GitHub Actions cache for snapshot persistence between runs
- Additional job sources (e.g. Remotive)
- Better ranking/filtering (salary, seniority, Salesforce-specific rules)
- HTML email formatting

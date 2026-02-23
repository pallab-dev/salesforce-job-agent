# AI Job Alert Agent (Groq + Gmail + GitHub Actions)

Automated job alert agent that:

- fetches remote jobs (currently `RemoteOK`)
- filters them with Groq (`llama-3.1-8b-instant`)
- emails results through Gmail SMTP
- runs on GitHub Actions every 8 hours

It can also run locally from the CLI for testing.

## What It Does

Current flow:

1. Fetch jobs from RemoteOK
2. Filter titles by keyword (default: `developer`)
3. Send a reduced job list to Groq for relevance filtering
4. Clean the LLM output to strict bullet format
5. Send email to the configured Gmail address

## Current Email Behavior (Important)

The agent now sends a snapshot of the current matching jobs (after AI filtering), not only newly discovered jobs.

Example:

- Run 1: `job1`, `job2` -> email contains `job1`, `job2`
- Run 2: `job3` appears -> email contains `job1`, `job2`, `job3`
- Run 3: `job3` disappears -> email contains `job1`, `job2`

The file `.job_agent/seen_jobs.json` stores the previous run snapshot so the agent can compare what was added/removed between runs.

## Project Structure

```text
config/
  profiles/
    default.yml            # profile defaults (config-driven behavior)
    pallab.yml             # example profile config
  sources/
    companies.yml          # placeholder for future ATS/company source lists

job_agent/
  main.py                  # CLI entrypoint
  config.py                # env/config loading
  profile_config.py        # YAML profile config loader
  agent.py                 # orchestration logic
  sources/remoteok.py      # job source integration
  sources/registry.py      # source selection/aggregation (config-driven)
  llm/groq.py              # Groq API call + prompt
  notify/emailer.py        # Gmail SMTP sender
  utils/cleaning.py        # LLM output cleanup
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
- `EMAIL_TO` is optional. If set, email is sent to `EMAIL_TO`; otherwise it sends to `EMAIL_USER`.

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

## Config-Driven Profiles (New)

You can now control profile behavior from YAML instead of hardcoding values in Python.

Default lookup:

- `--profile pallab` -> `config/profiles/pallab.yml`
- no `--profile` -> `config/profiles/default.yml` (if present)
- missing file -> built-in defaults are used safely

Example `config/profiles/pallab.yml`:

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
- Change LLM/email output limits per profile

Note:

- If you add an unimplemented source (for example `greenhouse` before its adapter exists) the agent will print a skip message and continue.
- This is the first step toward fully config-driven multi-source support.

## GitHub Actions Setup

The workflow is in `.github/workflows/agent.yml` and runs:

- on a schedule (`every 8 hours`)
- manually (`workflow_dispatch`)

### Add Repository Secrets

In GitHub:

`Repo -> Settings -> Secrets and variables -> Actions -> New repository secret`

Add:

- `GROQ_API_KEY`
- `EMAIL_USER`
- `EMAIL_PASS`

### Trigger a Manual Run

1. Open the repo in GitHub
2. Go to `Actions`
3. Open `AI Job Alert Agent`
4. Click `Run workflow`

## Multi-User Setup (GitHub Actions Environments)

This repo now supports multi-user scheduled runs using one GitHub Actions Environment per user profile.

How it works:

- The workflow runs a matrix of `profile` names (for example `pallab`, `alex`)
- Each matrix job uses a GitHub Environment with the same name
- That environment provides the secrets for that user
- The agent uses `--profile <name>` so each profile gets separate snapshot state (`seen_jobs.json`)

### Add a New User (Scheduled Emails)

For a new user (example: `alex`):

1. Create a GitHub Environment named `alex`
2. Add environment secrets:
   - `GROQ_API_KEY`
   - `EMAIL_USER`
   - `EMAIL_PASS`
   - `EMAIL_TO` (optional)
3. Edit `.github/workflows/agent.yml` and add `alex` to the matrix list:

```yaml
profile: [pallab, alex]
```

After that, scheduled runs will include `alex`, and emails will be sent using Alex's environment secrets.

Optional (config-driven profile settings):

- Add `config/profiles/alex.yml` to customize keyword/sources/limits for Alex without changing Python code.

### Manual Run for One Profile

The workflow has a `profile` input.

- Leave it empty: runs all profiles in the matrix
- Set it to `alex`: runs only the `alex` matrix job

Important:

- The input value must match a profile name in the matrix
- The profile name must also match the GitHub Environment name

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
- Gmail login fails:
  - Confirm you are using an App Password, not the account password
  - Re-copy the App Password (spaces are okay; code strips them)
- Groq errors:
  - Check model name (`llama-3.1-8b-instant`)
  - Confirm API key is valid and active
- No email sent:
  - Groq may return `NONE` (no relevant jobs found)

## Notes for Contributors

- Main entrypoint: `job_agent/main.py`
- Core workflow logic: `job_agent/agent.py`
- Keep the GitHub Actions workflow minimal; put logic in Python modules
- `.job_agent/` is ignored in git because it contains local snapshot state
- For multi-user scheduling, keep the workflow `matrix.profile` list in sync with GitHub Environment names

## Roadmap (Planned)

- GitHub Actions cache for snapshot persistence between runs
- Additional job sources (e.g. Remotive)
- Better ranking/filtering (salary, seniority, Salesforce-specific rules)
- HTML email formatting

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
job_agent/
  main.py                  # CLI entrypoint
  config.py                # env/config loading
  agent.py                 # orchestration logic
  sources/remoteok.py      # job source integration
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

- `EMAIL_USER` is both sender and recipient in the current implementation.
- `EMAIL_PASS` should be a Gmail App Password (16 characters). Spaces are stripped automatically in code.

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

Useful options:

- `--keyword` title keyword match (default `developer`)
- `--llm-input-limit` max jobs sent to Groq (default `15`)
- `--max-bullets` max bullet results in output/email (default `8`)
- `--dry-run` print instead of email
- `--disable-dedupe` disables previous/current snapshot comparison
- `--seen-file` custom snapshot file path (default `.job_agent/seen_jobs.json`)

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

## Gmail Setup (App Password)

If using Gmail SMTP:

1. Enable 2-Step Verification on the Google account
2. Create an App Password
3. Use that App Password as `EMAIL_PASS`

Do not use your normal Gmail password.

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

## Roadmap (Planned)

- GitHub Actions cache for snapshot persistence between runs
- Additional job sources (e.g. Remotive)
- Better ranking/filtering (salary, seniority, Salesforce-specific rules)
- HTML email formatting

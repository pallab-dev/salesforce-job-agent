# Salesforce Job Agent Monorepo

## Structure

- `frontend/` - Next.js UI (login, dashboard, preferences)
- `backend/` - Python job agent, DB CLI, sources, config, docs

## Current Product Flow (Prototype)

- Landing page is the primary entry point (`/`)
- Users access auth via the landing CTA (`/auth`)
- `Sign Up` -> onboarding flow -> dashboard
- `Sign In` -> dashboard (inactive users are reactivated on successful sign-in)
- Dashboard includes:
  - `Overview` tab
  - `Preferences` tab
  - user status toggle (`Active` / `Deactive`)
  - `Switch User` action
- Admin console (`/admin`) is allowlist-protected and includes audit logs for activate/deactivate actions

Note: route middleware requires a landing-page visit before direct access to `/auth`, `/dashboard`, `/onboarding`, or `/admin` in a fresh browser session.

## Quick Start

### Backend (DB schema init / agent CLI)

```bash
cd backend
export DATABASE_URL='postgresql://...'
python3 -m job_agent.db_main db init
```

Recommended scheduled run (auto-validates company sources, runs all users, prints source report):

```bash
cd backend
export DATABASE_URL='postgresql://...'
PYTHONPATH=. python3 -m job_agent.db_main run --all-users --source-validate-timeout-seconds 15
```

### Frontend (web UI)

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000/`.

For admin access, add one of these to `frontend/.env.local`:

- `ADMIN_EMAIL_ALLOWLIST=admin1@example.com,admin2@example.com`
- `ADMIN_USERNAME_ALLOWLIST=adminuser1,adminuser2`

Then open `http://localhost:3000/admin`.

## Frontend Behavior Notes

- `Switch User` clears the current session and redirects to `/auth`
- `Deactive` sets the current user to inactive, clears the session, and redirects to `/auth`
- Users can reactivate themselves by signing in again with the same `username + Gmail`
- Onboarding currently has 3 steps:
  - Account
  - Preferences
  - Finish
- Resume onboarding is supported and restores the user to the correct next step
- Dashboard overview includes market opportunity insights (recent source/country/remote mix and run funnel suggestions)

If you pull recent changes, rerun backend schema init to apply additive migrations (for example admin audit tables and new `sent_job_records` location columns used by dashboard market insights):

```bash
cd backend
export DATABASE_URL='postgresql://...'
python3 -m job_agent.db_main db init
```

## Deploy / Friend Testing (Recommended)

- Deploy `frontend/` to Vercel (Hobby plan is fine)
- Keep `backend/` scheduled runs on GitHub Actions
- Use the same Supabase `DATABASE_URL` for Vercel and GitHub Actions
- Keep admin allowlist restricted to your email/username during testing

For detailed frontend routes and env vars, see `frontend/README.md`.

## Docs

- Backend docs and usage: `backend/README.md`
- Backend changelog: `backend/CHANGELOG.md`
- Frontend routes/env/UX notes: `frontend/README.md`

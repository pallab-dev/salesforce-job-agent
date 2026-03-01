# Frontend (Next.js UI)

## Purpose

This app provides the user-facing UI for:

- landing page (`/`)
- sign in / sign up (`/auth`)
- onboarding (`/onboarding`)
- dashboard (`/dashboard`)
- admin console (`/admin`)

It stores user and preference data in PostgreSQL (Supabase) through server-side Next.js API routes.

Current preference controls exposed in the dashboard include:

- job title focus
- remote-only toggle
- senior-priority toggle
- guided picklists for `target_roles`, `tech_stack_tags`, and `negative_keywords`
- alert frequency + primary goal

## Routes

- `/`
  - landing page
  - sets a landing-visit cookie used by middleware
- `/auth`
  - dual auth: Gmail OTP (`username + Gmail`) and Google OAuth
  - `Sign Up` -> onboarding
  - `Sign In` -> dashboard
  - inactive users are automatically reactivated on successful sign-in
- `/onboarding`
  - guided setup (Profile -> Preferences -> Finish)
  - supports resume upload (`.pdf` / `.txt`) and smart profile recommendations
  - onboarding progress is persisted and resumable
- `/dashboard`
  - tabbed user workspace (`overview`, `preferences`)
  - user can toggle account status (`Active` / `Deactive`)
  - `Switch User` clears session and returns to `/auth`
  - overview includes `Market Opportunity` insights (recent sent-job volume, top countries/sources, remote mix, run funnel averages, and tuning suggestions)
- `/admin`
  - allowlist-protected operational view
  - user table + preferences + state + run logs + admin audit logs

## Middleware / Entry Flow

`frontend/middleware.ts` enforces landing-first navigation in a fresh browser session:

- direct access to `/auth`, `/dashboard`, `/onboarding`, `/admin` redirects to `/`
- visiting `/` sets the landing-entry cookie

This is a UX gate (not a security boundary).

## Environment Variables

Required:

- `DATABASE_URL`

Optional / recommended:

- `ADMIN_EMAIL_ALLOWLIST`
- `ADMIN_USERNAME_ALLOWLIST`
- `OTP_SECRET`
- `EMAIL_PROVIDER` (`resend` | `postmark` | `sendgrid` | `smtp`)
- `RESEND_API_KEY`
- `RESEND_FROM`
- `POSTMARK_SERVER_TOKEN`
- `POSTMARK_FROM`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Example:

```env
DATABASE_URL=postgresql://...@...:6543/postgres?sslmode=require
ADMIN_EMAIL_ALLOWLIST=you@example.com
ADMIN_USERNAME_ALLOWLIST=yourusername
```

## Local Run

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000/`.

## Deployment (Vercel)

- Set project root directory to `frontend`
- Add the same environment variables in Vercel project settings
- Redeploy after any env var change

## Prototype Auth Note

Current auth supports both Gmail OTP and Google OAuth.
For production, prefer API providers (`Resend` / `Postmark` / `SendGrid`) over personal Gmail SMTP.

## Preferences API Notes

`/api/preferences` stores advanced user profile signals in `user_preferences.profile_overrides_jsonb`.

Examples:

- `target_roles`
- `tech_stack_tags`
- `negative_keywords`
- onboarding/product preferences (`alert_frequency`, `primary_goal`, etc.)

## Dashboard Market Insights Notes

The dashboard overview now uses backend-derived analytics from PostgreSQL:

- recent `sent_job_records` (30-day source/country/remote mix)
- recent `run_logs` (success rate + keyword/emailed averages)

This depends on backend schema updates that add normalized location data columns to `sent_job_records`. Re-run backend schema init after pulling backend changes:

```bash
cd ../backend
python3 -m job_agent.db_main db init
```

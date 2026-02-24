# Salesforce Job Agent Monorepo

## Structure

- `frontend/` - Next.js UI (login, dashboard, preferences)
- `backend/` - Python job agent, DB CLI, sources, config, docs

## Quick Start

### Backend (DB schema init / agent CLI)

```bash
cd backend
export DATABASE_URL='postgresql://...'
python3 -m job_agent.db_main db init
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

If you pull recent changes, rerun backend schema init to create new tables (for example `admin_audit_logs`):

```bash
cd backend
export DATABASE_URL='postgresql://...'
python3 -m job_agent.db_main db init
```

## Docs

- Backend docs and usage: `backend/README.md`
- Backend changelog: `backend/CHANGELOG.md`

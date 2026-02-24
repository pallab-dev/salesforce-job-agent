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

## Docs

- Backend docs and usage: `backend/README.md`
- Backend changelog: `backend/CHANGELOG.md`

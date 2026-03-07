# SmartB Backend

FastAPI backend with:
- PostgreSQL connection
- Alembic migrations
- JWT authentication (`/auth/login`)
- RBAC with context hierarchy: `global -> company -> project -> task/schedule`

## Stack
- Python 3.11+
- FastAPI
- SQLAlchemy 2
- Alembic
- PostgreSQL 16

## Quick start

1. Create env file:
```bash
cp .env.example .env
```
If frontend runs on another host/port, adjust `CORS_ORIGINS` in `.env`.

2. Create virtual env and install:
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

3. Run migrations:
```bash
python -m alembic upgrade head
```

4. Start API:
```bash
python -m uvicorn app.main:app --reload
```

If your shell still resolves global binaries after activating `.venv`, run:
```bash
hash -r
```

Open docs: http://127.0.0.1:8000/docs

## RBAC model

### Roles
- `global_admin` - full access at all levels.
- `company_admin` - administration inside a company and its descendants.
- `project_manager` - management in a project and its descendants.
- `project_member` - regular project-level execution role.
- `viewer` - read-only role (reserved for read endpoints).

### Scopes
- `global` (no `scope_id`)
- `company` (`scope_id = company_id`)
- `project` (`scope_id = project_id`)
- `task` (`scope_id = task_id`)
- `schedule` (`scope_id = schedule_id`)

Permission checks traverse parent context automatically.

## Basic flow

1. `POST /api/v1/auth/register`
   - First registered user automatically receives `global_admin` on `global` scope.
2. `POST /api/v1/auth/login` -> JWT access token. Optional `company_id` can be passed to bind company context to the token.
3. Use Bearer token in Authorization header.
4. Create company/project/task/schedule and assign roles via `/api/v1/rbac/assign-role`.

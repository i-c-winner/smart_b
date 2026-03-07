#!/usr/bin/env bash
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set"
  exit 1
fi

# Railway exposes one public port
FRONTEND_PORT="${PORT:-3000}"
BACKEND_PORT="${BACKEND_PORT:-8000}"

# Ensure Next.js rewrites point to internal backend
export INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:${BACKEND_PORT}}"

# Run backend pipeline in background
(
  cd backend
  python3 -m alembic upgrade head
  uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT"
) &
BACK_PID=$!

cleanup() {
  kill "$BACK_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# Start frontend on Railway public port
cd frontend
exec npm run start -- -H 0.0.0.0 -p "$FRONTEND_PORT"

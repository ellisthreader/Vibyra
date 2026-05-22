#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${BACKEND_HOST:-0.0.0.0}"
PORT="${BACKEND_PORT:-8000}"
LOCAL_URL="http://127.0.0.1:${PORT}"

cd "$ROOT_DIR"

if curl -fsS "${LOCAL_URL}/health" >/dev/null 2>&1; then
  echo "Vibyra backend is already running at ${LOCAL_URL}."
  exit 0
fi

if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port ${PORT} is already in use, but ${LOCAL_URL}/health did not respond as Vibyra." >&2
  echo "Stop that process or run with BACKEND_PORT=<free-port> npm run backend." >&2
  exit 1
fi

cd backend
php artisan serve --host="${HOST}" --port="${PORT}"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="http://127.0.0.1:8000/api/skills"
RUNTIME_DIR="$HOME/.vibyra-desktop"
BACKEND_LOG="$RUNTIME_DIR/backend.log"
BACKEND_PID_FILE="$RUNTIME_DIR/backend.pid"
DESKTOP_LAUNCHER="$ROOT_DIR/scripts/install-desktop-launcher.sh"

cd "$ROOT_DIR"
mkdir -p "$RUNTIME_DIR"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command node
require_command npm
require_command php
require_command composer
require_command curl

echo "Installing desktop dependencies..."
npm install --no-audit --no-fund

echo "Preparing the Vibyra backend..."
composer install --working-dir=backend --no-interaction --prefer-dist

if [[ ! -f backend/.env ]]; then
  cp backend/.env.example backend/.env
fi

touch backend/database/database.sqlite

if ! grep -Eq '^APP_KEY=base64:.+' backend/.env; then
  (cd backend && php artisan key:generate --force)
fi

(cd backend && php artisan migrate --force)

if grep -Eq '^MAXMIND_ACCOUNT_ID=.+$' backend/.env && grep -Eq '^MAXMIND_LICENSE_KEY=.+$' backend/.env; then
  echo "Preparing city and country lookup..."
  (cd backend && php artisan maxmind:update) || echo "MaxMind setup failed; signed-in devices will show public IP addresses." >&2
else
  echo "MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY are required; signed-in devices will show public IP addresses instead of city and country."
fi

if ! curl -fsS "$BACKEND_URL" >/dev/null 2>&1; then
  (
    cd backend
    nohup php artisan serve --host=127.0.0.1 --port=8000 >>"$BACKEND_LOG" 2>&1 &
    echo $! >"$BACKEND_PID_FILE"
  )

  echo "Starting the backend..."
  for _ in {1..60}; do
    if curl -fsS "$BACKEND_URL" >/dev/null 2>&1; then
      break
    fi
    if [[ -f "$BACKEND_PID_FILE" ]] && ! kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
      echo "The Vibyra backend stopped during startup." >&2
      exit 1
    fi
    sleep 0.25
  done

  if ! curl -fsS "$BACKEND_URL" >/dev/null 2>&1; then
    echo "The Vibyra backend did not become ready." >&2
    exit 1
  fi
fi

if [[ -x "$DESKTOP_LAUNCHER" ]]; then
  "$DESKTOP_LAUNCHER"
fi

echo "Opening Vibyra..."
./Vibyra\ Desktop

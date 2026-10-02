#!/usr/bin/env bash
# Disposable PostgreSQL only. Never reads the owner's database or sends provider requests.
set -euo pipefail
ASSISTANT_PGBIN=${ASSISTANT_PGBIN:-/opt/homebrew/opt/postgresql@17/bin}
ASSISTANT_PG_PORT=${ASSISTANT_PG_PORT:-54394}
ASSISTANT_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
ASSISTANT_WORK=$(mktemp -d "${TMPDIR:-/tmp}/vibyra-assistant-pg.XXXXXX")
cleanup() {
  "$ASSISTANT_PGBIN/pg_ctl" -D "$ASSISTANT_WORK/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$ASSISTANT_WORK"
}
trap cleanup EXIT
if nc -z 127.0.0.1 "$ASSISTANT_PG_PORT" 2>/dev/null; then echo 'Choose an unused ASSISTANT_PG_PORT'; exit 2; fi
"$ASSISTANT_PGBIN/initdb" -D "$ASSISTANT_WORK/pg" -U postgres --auth=trust -E UTF8 >/dev/null
cat >> "$ASSISTANT_WORK/pg/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $ASSISTANT_PG_PORT
unix_socket_directories = ''
fsync = off
log_lock_waits = on
deadlock_timeout = 500ms
EOF
"$ASSISTANT_PGBIN/pg_ctl" -D "$ASSISTANT_WORK/pg" -l "$ASSISTANT_WORK/pg.log" -w start >/dev/null
"$ASSISTANT_PGBIN/createdb" -h 127.0.0.1 -p "$ASSISTANT_PG_PORT" -U postgres vibyra_assistant_qa
export APP_ENV=testing APP_DEBUG=false APP_KEY="base64:$(openssl rand -base64 32)"
export DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$ASSISTANT_PG_PORT" DB_DATABASE=vibyra_assistant_qa DB_USERNAME=postgres DB_PASSWORD= DB_URL=
export CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=array LOG_CHANNEL=stderr
export OPENAI_API_KEY=fixture-only OPENROUTER_API_KEY= STRIPE_SECRET_KEY= LEGAL_MARKET_ENFORCEMENT=false
cd "$ASSISTANT_ROOT"
php artisan migrate:fresh --force > "$ASSISTANT_WORK/migrate.log"
php tests/integration/assistant-concurrency/run.php
if rg -q 'deadlock detected' "$ASSISTANT_WORK/pg.log"; then echo 'FAIL: PostgreSQL deadlock'; exit 1; fi
echo 'PASS: no PostgreSQL deadlocks'

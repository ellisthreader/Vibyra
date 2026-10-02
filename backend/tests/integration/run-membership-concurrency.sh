#!/usr/bin/env bash
# Disposable PostgreSQL only. Never reads the owner's database or sends provider requests.
set -euo pipefail
MEMBERSHIP_PGBIN=${MEMBERSHIP_PGBIN:-/opt/homebrew/opt/postgresql@17/bin}
MEMBERSHIP_PG_PORT=${MEMBERSHIP_PG_PORT:-54395}
MEMBERSHIP_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
MEMBERSHIP_WORK=$(mktemp -d "${TMPDIR:-/tmp}/vibyra-membership-pg.XXXXXX")
cleanup() {
  "$MEMBERSHIP_PGBIN/pg_ctl" -D "$MEMBERSHIP_WORK/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$MEMBERSHIP_WORK"
}
trap cleanup EXIT
if nc -z 127.0.0.1 "$MEMBERSHIP_PG_PORT" 2>/dev/null; then echo 'Choose an unused MEMBERSHIP_PG_PORT'; exit 2; fi
"$MEMBERSHIP_PGBIN/initdb" -D "$MEMBERSHIP_WORK/pg" -U postgres --auth=trust -E UTF8 >/dev/null
cat >> "$MEMBERSHIP_WORK/pg/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $MEMBERSHIP_PG_PORT
unix_socket_directories = ''
fsync = off
log_lock_waits = on
deadlock_timeout = 500ms
EOF
"$MEMBERSHIP_PGBIN/pg_ctl" -D "$MEMBERSHIP_WORK/pg" -l "$MEMBERSHIP_WORK/pg.log" -w start >/dev/null
"$MEMBERSHIP_PGBIN/createdb" -h 127.0.0.1 -p "$MEMBERSHIP_PG_PORT" -U postgres vibyra_membership_qa
export APP_ENV=testing APP_DEBUG=false APP_KEY="base64:$(openssl rand -base64 32)"
export DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$MEMBERSHIP_PG_PORT" DB_DATABASE=vibyra_membership_qa DB_USERNAME=postgres DB_PASSWORD= DB_URL=
export CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=array LOG_CHANNEL=stderr
export OPENAI_API_KEY=fixture-only OPENROUTER_API_KEY= STRIPE_SECRET_KEY= LEGAL_MARKET_ENFORCEMENT=false
cd "$MEMBERSHIP_ROOT"
php artisan migrate:fresh --force > "$MEMBERSHIP_WORK/migrate.log"
php tests/integration/membership-concurrency.php
if rg -q 'deadlock detected' "$MEMBERSHIP_WORK/pg.log"; then echo 'FAIL: PostgreSQL deadlock'; exit 1; fi
echo 'PASS: no PostgreSQL deadlocks'

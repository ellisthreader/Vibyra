#!/usr/bin/env bash
# Disposable PostgreSQL only, using the established independent-process test harness.
set -euo pipefail
CLOUD_CONNECT_PGBIN=${CLOUD_CONNECT_PGBIN:-/opt/homebrew/opt/postgresql@17/bin}
CLOUD_CONNECT_PG_PORT=${CLOUD_CONNECT_PG_PORT:-54396}
CLOUD_CONNECT_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
CLOUD_CONNECT_WORK=$(mktemp -d "${TMPDIR:-/tmp}/vibyra-cloud-connect-pg.XXXXXX")
cleanup() {
  "$CLOUD_CONNECT_PGBIN/pg_ctl" -D "$CLOUD_CONNECT_WORK/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$CLOUD_CONNECT_WORK"
}
trap cleanup EXIT
if nc -z 127.0.0.1 "$CLOUD_CONNECT_PG_PORT" 2>/dev/null; then echo 'Choose an unused CLOUD_CONNECT_PG_PORT'; exit 2; fi
"$CLOUD_CONNECT_PGBIN/initdb" -D "$CLOUD_CONNECT_WORK/pg" -U postgres --auth=trust -E UTF8 >/dev/null
cat >> "$CLOUD_CONNECT_WORK/pg/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $CLOUD_CONNECT_PG_PORT
unix_socket_directories = ''
fsync = off
log_lock_waits = on
deadlock_timeout = 500ms
EOF
"$CLOUD_CONNECT_PGBIN/pg_ctl" -D "$CLOUD_CONNECT_WORK/pg" -l "$CLOUD_CONNECT_WORK/pg.log" -w start >/dev/null
"$CLOUD_CONNECT_PGBIN/createdb" -h 127.0.0.1 -p "$CLOUD_CONNECT_PG_PORT" -U postgres vibyra_cloud_connect_qa
export APP_ENV=testing APP_DEBUG=false APP_KEY="base64:$(openssl rand -base64 32)"
export DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$CLOUD_CONNECT_PG_PORT" DB_DATABASE=vibyra_cloud_connect_qa DB_USERNAME=postgres DB_PASSWORD= DB_URL=
export CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=array LOG_CHANNEL=stderr
export OPENAI_API_KEY=fixture-only OPENROUTER_API_KEY= STRIPE_SECRET_KEY= LEGAL_MARKET_ENFORCEMENT=false
export CLOUD_CONNECT_POSTGRES_CONCURRENCY=1
cd "$CLOUD_CONNECT_ROOT"
php -d memory_limit=1G vendor/bin/phpunit tests/integration/CloudConnectPostgresConcurrencyTest.php
if rg -q 'deadlock detected' "$CLOUD_CONNECT_WORK/pg.log"; then echo 'FAIL: PostgreSQL deadlock'; exit 1; fi
echo 'PASS: no PostgreSQL deadlocks'

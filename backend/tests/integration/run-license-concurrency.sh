#!/usr/bin/env bash
# Isolated local engine. Keep logs for review; never touch an existing database.
set -euo pipefail
LICENSE_PGBIN=${LICENSE_PGBIN:-/opt/homebrew/opt/postgresql@17/bin}
LICENSE_PG_PORT=${LICENSE_PG_PORT:-54396}
LICENSE_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
LICENSE_WORK=$(mktemp -d "${TMPDIR:-/tmp}/vibyra-license-pg.XXXXXX")
trap '"$LICENSE_PGBIN/pg_ctl" -D "$LICENSE_WORK/pg" -m immediate stop >/dev/null 2>&1 || true' EXIT
if nc -z 127.0.0.1 "$LICENSE_PG_PORT" 2>/dev/null; then echo 'Choose an unused LICENSE_PG_PORT'; exit 2; fi
"$LICENSE_PGBIN/initdb" -D "$LICENSE_WORK/pg" -U postgres --auth=trust -E UTF8 >/dev/null
cat >> "$LICENSE_WORK/pg/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $LICENSE_PG_PORT
unix_socket_directories = ''
fsync = off
log_lock_waits = on
deadlock_timeout = 500ms
EOF
"$LICENSE_PGBIN/pg_ctl" -D "$LICENSE_WORK/pg" -l "$LICENSE_WORK/pg.log" -w start >/dev/null
"$LICENSE_PGBIN/createdb" -h 127.0.0.1 -p "$LICENSE_PG_PORT" -U postgres vibyra_license_qa_disposable
export APP_ENV=testing APP_DEBUG=false APP_KEY="base64:$(openssl rand -base64 32)"
export DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$LICENSE_PG_PORT" DB_DATABASE=vibyra_license_qa_disposable DB_USERNAME=postgres DB_PASSWORD= DB_URL=
export LICENSE_POSTGRES_CONCURRENCY=1 CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=array
export OPENAI_API_KEY=fixture-only OPENROUTER_API_KEY= STRIPE_SECRET_KEY= LEGAL_MARKET_ENFORCEMENT=false
cd "$LICENSE_ROOT"
php -d memory_limit=1G vendor/bin/phpunit tests/integration/LicensePostgresConcurrencyTest.php
if rg -q 'deadlock detected' "$LICENSE_WORK/pg.log"; then echo 'FAIL: PostgreSQL deadlock'; exit 1; fi
echo "PASS: no PostgreSQL deadlocks; logs retained at $LICENSE_WORK"

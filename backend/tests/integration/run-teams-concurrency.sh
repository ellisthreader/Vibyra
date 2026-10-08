#!/usr/bin/env bash
# Disposable PostgreSQL only (roadmap Part 13: Teams). Never reads the owner's database, sends nothing, calls no third party.
# Pick a free port with TEAMS_PG_PORT (default 54397; membership uses 54395, license/assistant 54396/54394, cloud 54390).
set -euo pipefail
TEAMS_PGBIN=${TEAMS_PGBIN:-/opt/homebrew/opt/postgresql@17/bin}
TEAMS_PG_PORT=${TEAMS_PG_PORT:-54397}
TEAMS_ROOT=$(cd "$(dirname "$0")/../.." && pwd)
TEAMS_WORK=$(mktemp -d "${TMPDIR:-/tmp}/vibyra-teams-pg.XXXXXX")
cleanup() {
  "$TEAMS_PGBIN/pg_ctl" -D "$TEAMS_WORK/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TEAMS_WORK"
}
trap cleanup EXIT
if nc -z 127.0.0.1 "$TEAMS_PG_PORT" 2>/dev/null; then echo 'Choose an unused TEAMS_PG_PORT'; exit 2; fi
"$TEAMS_PGBIN/initdb" -D "$TEAMS_WORK/pg" -U postgres --auth=trust -E UTF8 >/dev/null
cat >> "$TEAMS_WORK/pg/postgresql.conf" <<CONF
listen_addresses = '127.0.0.1'
port = $TEAMS_PG_PORT
unix_socket_directories = ''
fsync = off
log_lock_waits = on
deadlock_timeout = 500ms
CONF
"$TEAMS_PGBIN/pg_ctl" -D "$TEAMS_WORK/pg" -l "$TEAMS_WORK/pg.log" -w start >/dev/null
"$TEAMS_PGBIN/createdb" -h 127.0.0.1 -p "$TEAMS_PG_PORT" -U postgres vibyra_teams_qa
export APP_ENV=testing APP_DEBUG=false APP_KEY="base64:$(openssl rand -base64 32)"
export DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$TEAMS_PG_PORT" DB_DATABASE=vibyra_teams_qa DB_USERNAME=postgres DB_PASSWORD= DB_URL=
export CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=array LOG_CHANNEL=stderr
export OPENAI_API_KEY=fixture-only OPENROUTER_API_KEY= STRIPE_SECRET_KEY= LEGAL_MARKET_ENFORCEMENT=false
export TEAMS_ENABLED=true PLATFORM_ACTIVITY_ENABLED=true
cd "$TEAMS_ROOT"
php artisan migrate:fresh --force > "$TEAMS_WORK/migrate.log"
php tests/integration/teams-concurrency.php
if grep -q 'deadlock detected' "$TEAMS_WORK/pg.log"; then echo 'FAIL: PostgreSQL deadlock'; exit 1; fi
echo 'PASS: no PostgreSQL deadlocks'

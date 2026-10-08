#!/usr/bin/env bash
# Agent V2 concurrency harness on a THROWAWAY PostgreSQL 17 cluster and a real database queue.
#
#   tests/integration/agent-v2-concurrency/run.sh [scenario ...]     default: every scenario except queue and wire
#   tests/integration/agent-v2-concurrency/run.sh all                everything, including queue (kill -9 tests, ~1 min) and wire
#   tests/integration/agent-v2-concurrency/run.sh upgrade            production-branch migrations, then ours on top, rollback, re-apply
#
# Scenarios: admission leases events approvals terminal connections credentials schedules triggers sweeper stranded inserts publish browser queue wire.
# It starts its own cluster (TCP on 127.0.0.1 only, trust auth, no unix socket), exports every setting as an
# environment variable (the owner's backend/.env is never edited, and its database is never used: boot.php
# refuses anything but a local vibyra_v2_conc* Postgres), runs, then stops and deletes the cluster.
# Outbound HTTP is faked inside each process (Fakes.php); a STRAY check proves nothing else was attempted.
set -euo pipefail

PGBIN=${PGBIN:-/opt/homebrew/opt/postgresql@17/bin}
PORT=${CONC_PG_PORT:-54390}
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
WORK=$(mktemp -d "${TMPDIR:-/tmp}/agent-v2-conc.XXXXXX")
PGDATA="$WORK/pg"
export CONC_PG_LOG="$WORK/pg.log"
export CONC_RESULTS=${CONC_RESULTS:-${TMPDIR:-/tmp}/agent-v2-concurrency-results.json}

if nc -z 127.0.0.1 "$PORT" 2>/dev/null; then echo "Port $PORT is in use; set CONC_PG_PORT." >&2; exit 2; fi
cleanup() {
  if [ "${CONC_USES_WIRE:-0}" = 1 ]; then pkill -9 -f "php -S 127.0.0.1:54391" 2>/dev/null || true; fi
  "$PGBIN/pg_ctl" -D "$PGDATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT
CONC_USES_WIRE=0
for scenario in "$@"; do case "$scenario" in all|wire) CONC_USES_WIRE=1;; esac; done

"$PGBIN/initdb" -D "$PGDATA" -U postgres --auth=trust -E UTF8 >/dev/null
cat >> "$PGDATA/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $PORT
unix_socket_directories = ''
max_connections = 200
fsync = off
synchronous_commit = off
log_min_messages = warning
log_lock_waits = on
deadlock_timeout = 500ms
EOF
"$PGBIN/pg_ctl" -D "$PGDATA" -l "$CONC_PG_LOG" -w start >/dev/null
"$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -qc "create database vibyra_v2_conc" -c "create database vibyra_v2_conc_upgrade"

export APP_ENV=local APP_DEBUG=false APP_KEY='base64:a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2V5a2U='
export DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$PORT" DB_DATABASE=vibyra_v2_conc DB_USERNAME=postgres DB_PASSWORD= DB_URL=
export QUEUE_CONNECTION=database VIBES_QUEUE_CONNECTION=database CACHE_STORE=database SESSION_DRIVER=array
export MAIL_MAILER=array LOG_CHANNEL=stderr LOG_LEVEL=warning FILESYSTEM_DISK=local BROADCAST_CONNECTION=null
export PULSE_ENABLED=false TELESCOPE_ENABLED=false NIGHTWATCH_ENABLED=false BCRYPT_ROUNDS=4
export OPENROUTER_API_KEY=fake-openrouter-key OPENROUTER_API_URL=http://127.0.0.1:54395/v1/chat/completions
export STRIPE_SECRET_KEY= OPENAI_API_KEY= AWS_ACCESS_KEY_ID= AWS_SECRET_ACCESS_KEY= REDIS_HOST=127.0.0.1
export AGENTS_V2_ENABLED=true AGENTS_V2_USER_IDS='*' AGENTS_V2_NOTIFICATIONS_ENABLED=true VIBES_ENABLED=true CHAT_CONNECTORS_ENABLED=true
export LEGAL_MARKET_ENFORCEMENT=false LEGAL_SIGNUP_ENFORCEMENT=false
export AGENTS_V2_BROWSER_ENABLED=true AGENTS_V2_MCP_ENABLED=true
export AGENTS_LOCAL_RUNNER_ENABLED=true AGENTS_VM_TESTS_ENABLED=true AGENTS_GIT_PUBLISH_ENABLED=true AGENTS_GITHUB_PR_ENABLED=true
export NOTIFICATIONS_INBOX_ENABLED=true NOTIFICATIONS_PUSH_ENABLED=true EXPO_PUSH_ACCESS_TOKEN=conc-fixture EXPO_PROJECT_ID=00000000-0000-4000-8000-000000000001 PUSH_ENVIRONMENT=development

cd "$ROOT"
if [ "${1:-}" = "upgrade" ]; then
  REF=${PROD_REF:-origin/railway-production}
  git rev-parse --verify -q "$REF" >/dev/null || { echo "No $REF to build the production schema from." >&2; exit 2; }
  mkdir -p "$WORK/prod" && git -C "$ROOT/.." archive "$REF" backend/database/migrations | tar -x -C "$WORK/prod"
  export DB_DATABASE=vibyra_v2_conc_upgrade
  echo "== migrate the production branch's $(ls "$WORK/prod/backend/database/migrations" | wc -l | tr -d ' ') migrations"
  php artisan migrate --force --path="$WORK/prod/backend/database/migrations" --realpath | grep -v -E "^\s*$|INFO" | grep -v DONE || true
  BEFORE=$("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres "$DB_DATABASE" -Atc "select count(*) from migrations")
  echo "== apply this checkout's migrations on top (production had $BEFORE)"
  php artisan migrate --force | grep -E "DONE|FAIL|rror" || true
  AFTER=$("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres "$DB_DATABASE" -Atc "select count(*) from migrations")
  NEW=$((AFTER - BEFORE))
  echo "== roll back the $NEW newest, then apply them again"
  php artisan migrate:rollback --step="$NEW" --force | grep -E "DONE|FAIL|rror" || true
  php artisan migrate --force | grep -E "DONE|FAIL|rror" || true
  "$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres "$DB_DATABASE" -Atc "select 'migrations recorded: '||count(*) from migrations"
  echo "== race the core scenarios on the upgraded production-shaped schema"
  php tests/integration/agent-v2-concurrency/run.php admission leases approvals terminal | grep -E "FAIL|checks"
  exit 0
fi

echo "== migrate from scratch on PostgreSQL $("$PGBIN/psql" -h 127.0.0.1 -p "$PORT" -U postgres -Atc 'show server_version')"
php artisan migrate:fresh --force | grep -E "FAIL|rror" || echo "all migrations applied"
ARGS=("$@")
[ "${1:-}" = "all" ] && ARGS=(admission leases events approvals terminal connections credentials schedules triggers sweeper stranded inserts publish browser queue wire)
set +e
php tests/integration/agent-v2-concurrency/run.php ${ARGS[@]+"${ARGS[@]}"}
STATUS=$?
set -e
echo
echo "== Postgres server log: errors by kind (unique violations are expected where a duplicate race is handled)"
{ grep -E "ERROR|FATAL" "$CONC_PG_LOG" | sed -E 's/^.*(ERROR|FATAL): *//' | cut -c1-130 | sort | uniq -c | sort -rn | head -8; } || true # a clean server log is success
echo "deadlocks: $(grep -c 'deadlock detected' "$CONC_PG_LOG" || true)   lock waits over 500 ms: $(grep -c 'still waiting' "$CONC_PG_LOG" || true)"
grep -A4 "still waiting" "$CONC_PG_LOG" | grep -E "still waiting|STATEMENT" | cut -c1-220 | head -8 || true
exit $STATUS

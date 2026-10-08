#!/usr/bin/env bash
# A new local cluster; no production credentials or provider calls.
set -euo pipefail
CATALOG_PGBIN=${CATALOG_PGBIN:-/opt/homebrew/opt/postgresql@17/bin}
CATALOG_PORT=${CATALOG_PORT:-54409}
CATALOG_ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
CATALOG_WORK=$(mktemp -d "${TMPDIR:-/tmp}/vibyra-catalog-pg.XXXXXX")
cleanup() {
  "$CATALOG_PGBIN/pg_ctl" -D "$CATALOG_WORK/pg" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$CATALOG_WORK"
}
trap cleanup EXIT
if nc -z 127.0.0.1 "$CATALOG_PORT" 2>/dev/null; then echo 'Choose an unused CATALOG_PORT'; exit 2; fi
"$CATALOG_PGBIN/initdb" -D "$CATALOG_WORK/pg" -U postgres --auth=trust -E UTF8 >/dev/null
cat >> "$CATALOG_WORK/pg/postgresql.conf" <<EOF
listen_addresses = '127.0.0.1'
port = $CATALOG_PORT
unix_socket_directories = ''
fsync = off
EOF
"$CATALOG_PGBIN/pg_ctl" -D "$CATALOG_WORK/pg" -l "$CATALOG_WORK/pg.log" -w start >/dev/null
"$CATALOG_PGBIN/createdb" -h 127.0.0.1 -p "$CATALOG_PORT" -U postgres vibyra_model_catalog_qa
export APP_ENV=testing APP_DEBUG=false APP_KEY="base64:$(openssl rand -base64 32)"
export DB_CONNECTION=pgsql DB_HOST=127.0.0.1 DB_PORT="$CATALOG_PORT" DB_DATABASE=vibyra_model_catalog_qa DB_USERNAME=postgres DB_PASSWORD= DB_URL=
export CACHE_STORE=array SESSION_DRIVER=array QUEUE_CONNECTION=sync MAIL_MAILER=array LOG_CHANNEL=stderr
export OPENROUTER_API_KEY= MODEL_CATALOG_PROBE_KEY= MODEL_CATALOG_IMAGE_KEY=
cd "$CATALOG_ROOT"
php tests/integration/model-catalog/run.php

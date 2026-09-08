#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

role="${VIBYRA_PROCESS_ROLE:-all}"
run_migrations="${VIBYRA_RUN_MIGRATIONS:-1}"
scheduler_pid=""
web_pid=""

case "$role" in
  all|web|worker|scheduler) ;;
  *)
    echo "Unsupported VIBYRA_PROCESS_ROLE: $role" >&2
    exit 64
    ;;
esac

mkdir -p \
  bootstrap/cache \
  storage/framework/cache/data \
  storage/framework/sessions \
  storage/framework/views \
  storage/logs

php artisan config:cache
php artisan route:cache
php artisan view:cache

if [[ "$run_migrations" == "1" && ( "$role" == "all" || "$role" == "web" ) ]]; then
  php artisan migrate --force
fi

cleanup() {
  trap - EXIT
  for pid in "$web_pid" "$scheduler_pid"; do
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "$web_pid" "$scheduler_pid"; do
    if [[ -n "$pid" ]]; then
      wait "$pid" 2>/dev/null || true
    fi
  done
}

case "$role" in
  web)
    exec bash scripts/start-production-web.sh
    ;;
  worker)
    exec php artisan queue:work \
      --queue="${VIBYRA_QUEUE_NAMES:-deployments,default}" \
      --sleep="${VIBYRA_QUEUE_SLEEP:-2}" \
      --tries="${VIBYRA_QUEUE_TRIES:-1}" \
      --timeout="${VIBYRA_QUEUE_TIMEOUT:-1200}" \
      --max-time="${VIBYRA_QUEUE_MAX_TIME:-3600}"
    ;;
  scheduler) exec php artisan schedule:work ;;
  all)
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    php artisan schedule:work &
    scheduler_pid="$!"
    bash scripts/start-production-web.sh &
    web_pid="$!"
    set +e
    wait -n "$web_pid" "$scheduler_pid"
    status="$?"
    set -e
    exit "$status"
    ;;
esac

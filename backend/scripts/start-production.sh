#!/usr/bin/env bash
set -euo pipefail

role="${VIBYRA_PROCESS_ROLE:-all}"
port="${PORT:-8000}"
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

start_web() {
  php -d upload_max_filesize=8M -d post_max_size=48M \
    artisan serve --host=0.0.0.0 --port="$port"
}

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
    exec php -d upload_max_filesize=8M -d post_max_size=48M \
      artisan serve --host=0.0.0.0 --port="$port"
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
    start_web &
    web_pid="$!"
    set +e
    wait -n "$web_pid" "$scheduler_pid"
    status="$?"
    set -e
    exit "$status"
    ;;
esac

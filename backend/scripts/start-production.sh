#!/usr/bin/env bash
set -euo pipefail

role="${VIBYRA_PROCESS_ROLE:-all}"
port="${PORT:-8000}"
run_migrations="${VIBYRA_RUN_MIGRATIONS:-1}"
# How many requests the web tier answers at once. Two is the least the built-in
# server accepts; anything lower turns forking off again.
export PHP_CLI_SERVER_WORKERS="${VIBYRA_WEB_WORKERS:-8}"
child_pids=()

case "$role" in
  all|web|worker|scheduler) ;;
  *)
    echo "Unsupported VIBYRA_PROCESS_ROLE: $role" >&2
    exit 64
    ;;
esac

if [[ "$role" == "all" || "$role" == "web" ]] && [[ ! -f public/index.php ]]; then
  echo "Missing Laravel public/index.php; refusing to start the web service." >&2
  exit 64
fi

mkdir -p \
  bootstrap/cache \
  storage/framework/cache/data \
  storage/framework/sessions \
  storage/framework/views \
  storage/logs

php artisan config:cache
php artisan route:cache
php artisan view:cache

# The GeoLite database that places a request in a launch market lives in
# container storage, which every deploy wipes; the weekly schedule alone left
# production without it, so every market-gated route answered 451. Fetch it at
# boot when MaxMind is configured. A failed download must not stop the app.
if [[ -n "${MAXMIND_LICENSE_KEY:-}" && ( "$role" == "all" || "$role" == "web" ) ]]; then
  php artisan maxmind:update || echo "MaxMind update failed; market checks will refuse until it succeeds." >&2
fi

if [[ "$run_migrations" == "1" && ( "$role" == "all" || "$role" == "web" ) ]]; then
  php artisan migrate --force
fi

# PHP's built-in server answers one request at a time unless it is told to fork,
# and `artisan serve` only forks with `--no-reload`. Without both, a single chat
# completion -- which streams from the provider inside its request -- holds the
# whole backend for as long as it runs, and everything queued behind it, a
# sign-up included, waits until Railway's proxy gives up with a 502.
start_web() {
  cd public
  exec php -d expose_php=0 -d upload_max_filesize=8M -d post_max_size=32M \
    -S "0.0.0.0:$port" \
    ../scripts/production-router.php
}

# Sponsored phone chat runs as a queued job (`RunVibesTurn` on the `vibes`
# queue), so a deployment without a worker accepts a turn, charges nothing and
# never answers. `vibes` leads the list because a person is watching that one.
all_queues="${VIBYRA_QUEUE_NAMES:-vibes,decisions,cloud-workspaces,notifications,deployments,default}"
# Agent turns (`RunVibesTurn`, `RunAgentTool`, `PublishAgentBranch`) and their
# decisions can run for minutes each. In the all-in-one role they get their own
# workers so two people's turns run side by side and a long turn never holds up
# notifications or deployments. 0 puts them back on the one general worker.
agent_queues="${VIBYRA_AGENT_QUEUE_NAMES:-vibes,decisions}"
agent_workers="${VIBYRA_AGENT_WORKERS:-2}"
if ! [[ "$agent_workers" =~ ^[0-9]+$ ]]; then
  echo "VIBYRA_AGENT_WORKERS must be a whole number, got: $agent_workers" >&2
  exit 64
fi

# The general worker's queues: every configured queue minus the agent ones,
# which then belong to the dedicated workers alone.
general_queues() {
  if [[ "$agent_workers" == "0" ]]; then
    echo "$all_queues"
    return
  fi
  local queue kept=""
  local IFS=','
  for queue in $all_queues; do
    case ",$agent_queues," in
      *",$queue,"*) ;;
      *) kept="${kept:+$kept,}$queue" ;;
    esac
  done
  echo "${kept:-default}"
}

run_worker() {
  php artisan queue:work \
    --queue="$1" \
    --sleep="${VIBYRA_QUEUE_SLEEP:-2}" \
    --tries="${VIBYRA_QUEUE_TRIES:-1}" \
    --timeout="${VIBYRA_QUEUE_TIMEOUT:-1200}" \
    --max-time="${VIBYRA_QUEUE_MAX_TIME:-0}"
}

cleanup() {
  trap - EXIT
  for pid in "${child_pids[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  for pid in "${child_pids[@]}"; do
    wait "$pid" 2>/dev/null || true
  done
}

case "$role" in
  web) start_web ;;
  # A standalone worker service keeps serving every queue, as before.
  worker) exec php artisan queue:work \
      --queue="$all_queues" \
      --sleep="${VIBYRA_QUEUE_SLEEP:-2}" \
      --tries="${VIBYRA_QUEUE_TRIES:-1}" \
      --timeout="${VIBYRA_QUEUE_TIMEOUT:-1200}" \
      --max-time="${VIBYRA_QUEUE_MAX_TIME:-0}"
    ;;
  scheduler) exec php artisan schedule:work ;;
  all)
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    php artisan schedule:work &
    child_pids=("$!")
    run_worker "$(general_queues)" &
    child_pids+=("$!")
    for ((index = 0; index < agent_workers; index++)); do
      run_worker "$agent_queues" &
      child_pids+=("$!")
    done
    start_web &
    child_pids+=("$!")
    set +e
    wait -n "${child_pids[@]}"
    status="$?"
    set -e
    # Any child stopping ends this service, even a clean queue recycle. Report
    # failure so Railway's ON_FAILURE policy restores every process together.
    if [[ "$status" == "0" ]]; then
      status=1
    fi
    exit "$status"
    ;;
esac

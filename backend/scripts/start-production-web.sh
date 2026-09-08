#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

# Explicit rollback for an already deployed image; local development continues
# to use its existing launcher. Production normally uses Nginx and PHP-FPM.
if [[ "${VIBYRA_WEB_SERVER:-fpm}" == "legacy" ]]; then
  exec php -d upload_max_filesize=8M -d post_max_size=48M \
    artisan serve --host=0.0.0.0 --port="${PORT:-8000}"
fi
[[ "${VIBYRA_WEB_SERVER:-fpm}" == "fpm" ]] || { echo 'Invalid VIBYRA_WEB_SERVER' >&2; exit 64; }
nginx_bin="${VIBYRA_NGINX_BIN:-nginx}"
fpm_bin="${VIBYRA_PHP_FPM_BIN:-php-fpm}"
command -v "$nginx_bin" >/dev/null
command -v "$fpm_bin" >/dev/null
export VIBYRA_RUNTIME_DIR
VIBYRA_RUNTIME_DIR="$(mktemp -d /tmp/vibyra-web.XXXXXXXX)"
export VIBYRA_FPM_USER="$(id -un)" VIBYRA_FPM_GROUP="$(id -gn)"
fpm_pid=""
nginx_pid=""
cleanup() {
  trap - EXIT
  for pid in "$nginx_pid" "$fpm_pid"; do
    [[ -z "$pid" ]] || kill -QUIT "$pid" 2>/dev/null || true
  done
  for pid in "$nginx_pid" "$fpm_pid"; do
    [[ -z "$pid" ]] || wait "$pid" 2>/dev/null || true
  done
  rm -rf -- "$VIBYRA_RUNTIME_DIR"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$VIBYRA_RUNTIME_DIR/body"
php scripts/production-config.php
fpm_flags=()
[[ "$(id -u)" != 0 ]] || fpm_flags+=(--allow-to-run-as-root)
"$fpm_bin" -d opcache.enable=1 "${fpm_flags[@]}" --test --fpm-config "$VIBYRA_RUNTIME_DIR/php-fpm.conf"
"$nginx_bin" -t -p "$VIBYRA_RUNTIME_DIR/" -c "$VIBYRA_RUNTIME_DIR/nginx.conf"
"$fpm_bin" -d opcache.enable=1 "${fpm_flags[@]}" --nodaemonize --fpm-config "$VIBYRA_RUNTIME_DIR/php-fpm.conf" &
fpm_pid="$!"
for ((attempt = 0; attempt < 100; attempt++)); do
  [[ ! -S "$VIBYRA_RUNTIME_DIR/php.sock" ]] || break
  kill -0 "$fpm_pid" 2>/dev/null || exit 1
  sleep 0.05
done
[[ -S "$VIBYRA_RUNTIME_DIR/php.sock" ]] || exit 1
"$nginx_bin" -p "$VIBYRA_RUNTIME_DIR/" -c "$VIBYRA_RUNTIME_DIR/nginx.conf" -g 'daemon off;' &
nginx_pid="$!"
set +e
wait -n "$nginx_pid" "$fpm_pid"
status="$?"
set -e
exit "$status"

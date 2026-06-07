#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_URL="http://127.0.0.1:8000/api/skills"
BACKEND_PID=""
PHONE_PREVIEW_WAITER_PID=""
EXPO_WEB_PORT="${EXPO_WEB_PORT:-8081}"
EXPO_WEB_URL="${EXPO_WEB_URL:-http://localhost:${EXPO_WEB_PORT}}"
PHONE_PREVIEW_SCRIPT="${PHONE_PREVIEW_SCRIPT:-/home/ellis/Desktop/PhonePreview/start-phone-preview.sh}"

cd "$ROOT_DIR"

detect_lan_ip() {
  local ip
  ip="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i == "src") { print $(i + 1); exit } }' || true)"
  case "$ip" in
    ""|127.*|169.254.*) ;;
    *) printf "%s\n" "$ip"; return 0 ;;
  esac

  for ip in $(hostname -I 2>/dev/null); do
    case "$ip" in
      127.*|169.254.*|*:*) continue ;;
      *) printf "%s\n" "$ip"; return 0 ;;
    esac
  done
  return 1
}

sync_api_env() {
  local env_file=".env"
  local lan_ip="${EXPO_PUBLIC_API_HOST:-}"

  if [[ "${EXPO_PUBLIC_API_MODE:-}" != "local" && -f "$env_file" ]]; then
    local configured
    configured="$(grep -m1 "^EXPO_PUBLIC_API_URL=" "$env_file" | cut -d= -f2- || true)"
    if [[ "$configured" == https://* ]]; then
      echo "Using EXPO_PUBLIC_API_URL=$configured"
      return 0
    fi
  fi

  if [[ -z "$lan_ip" ]]; then
    lan_ip="$(detect_lan_ip || true)"
  fi

  if [[ -z "$lan_ip" ]]; then
    echo "Could not detect a LAN IP for EXPO_PUBLIC_API_URL; leaving .env unchanged." >&2
    return 0
  fi

  local api_url="http://${lan_ip}:8000"
  if [[ ! -f "$env_file" ]]; then
    printf "EXPO_PUBLIC_API_URL=%s\n" "$api_url" > "$env_file"
    echo "Using EXPO_PUBLIC_API_URL=$api_url"
    return 0
  fi

  if grep -q "^EXPO_PUBLIC_API_URL=" "$env_file"; then
    local current
    current="$(grep -m1 "^EXPO_PUBLIC_API_URL=" "$env_file" | cut -d= -f2-)"
    if [[ "$current" == "$api_url" ]]; then
      echo "Using EXPO_PUBLIC_API_URL=$api_url"
      return 0
    fi

    local tmp_file
    tmp_file="$(mktemp)"
    awk -v api_url="$api_url" '
      BEGIN { replaced = 0 }
      /^EXPO_PUBLIC_API_URL=/ {
        if (!replaced) {
          print "EXPO_PUBLIC_API_URL=" api_url
          replaced = 1
        }
        next
      }
      { print }
      END {
        if (!replaced) print "EXPO_PUBLIC_API_URL=" api_url
      }
    ' "$env_file" > "$tmp_file"
    mv "$tmp_file" "$env_file"
  else
    printf "\nEXPO_PUBLIC_API_URL=%s\n" "$api_url" >> "$env_file"
  fi

  echo "Using EXPO_PUBLIC_API_URL=$api_url"
}

cleanup() {
  if [[ -n "$PHONE_PREVIEW_WAITER_PID" ]] && kill -0 "$PHONE_PREVIEW_WAITER_PID" 2>/dev/null; then
    kill "$PHONE_PREVIEW_WAITER_PID" 2>/dev/null || true
    wait "$PHONE_PREVIEW_WAITER_PID" 2>/dev/null || true
  fi

  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$BACKEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

open_phone_preview_when_ready() {
  if [[ ! -x "$PHONE_PREVIEW_SCRIPT" ]]; then
    echo "Phone Preview launcher not found at $PHONE_PREVIEW_SCRIPT; skipping external phone UI." >&2
    return 0
  fi

  for _ in {1..80}; do
    if curl -fsS "$EXPO_WEB_URL" >/dev/null 2>&1; then
      "$PHONE_PREVIEW_SCRIPT" "$EXPO_WEB_URL"
      return 0
    fi
    sleep 0.25
  done

  echo "Expo web did not become reachable at $EXPO_WEB_URL; opening Phone Preview anyway." >&2
  "$PHONE_PREVIEW_SCRIPT" "$EXPO_WEB_URL"
}

sync_api_env

(cd backend && php artisan serve --host=0.0.0.0 --port=8000) &
BACKEND_PID="$!"

echo "Waiting for Vibyra backend at $BACKEND_URL..."

backend_ready=0
for _ in {1..40}; do
  if curl -fsS "$BACKEND_URL" >/dev/null 2>&1; then
    backend_ready=1
    break
  fi

  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    wait "$BACKEND_PID" || true
    echo "Vibyra backend exited before it became reachable." >&2
    exit 1
  fi

  sleep 0.25
done

if [[ "$backend_ready" != "1" ]]; then
  echo "Vibyra backend did not become reachable at $BACKEND_URL." >&2
  exit 1
fi

echo "Vibyra backend is ready."
open_phone_preview_when_ready &
PHONE_PREVIEW_WAITER_PID="$!"

BROWSER=none expo start --web --host lan --port "$EXPO_WEB_PORT"

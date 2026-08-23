#!/usr/bin/env bash
set -euo pipefail

# Connects Vibyra's local model-alert Discord channel. User report delivery is
# owned by the backend, so desktop users never need the report webhook. The
# model-alert webhook is piped straight into the app on stdin and never becomes
# an argument, so it stays out of the
# process list, the shell history and this script's own logs.

appimage="${VIBYRA_APPIMAGE_PATH:-$HOME/Vibyra.AppImage}"
action="${1:-configure}"

if [[ ! -x "$appimage" ]]; then
  echo "Vibyra AppImage is not installed at $appimage" >&2
  exit 1
fi

case "$action" in
  configure)
    webhook=""
    read -r -s -p "Paste the Discord webhook URL for model alerts: " webhook
    printf '\n'
    if [[ -z "$webhook" ]]; then
      echo "No webhook was entered." >&2
      exit 1
    fi
    printf '%s' "$webhook" | "$appimage" "--configure-discord-webhook"
    unset webhook
    ;;
  test)
    "$appimage" "--test-discord-webhook"
    ;;
  clear)
    "$appimage" "--clear-discord-webhook"
    ;;
  *)
    echo "Usage: $0 [configure|test|clear]" >&2
    exit 1
    ;;
esac

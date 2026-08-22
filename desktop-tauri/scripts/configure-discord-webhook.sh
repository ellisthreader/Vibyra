#!/usr/bin/env bash
set -euo pipefail

# Connects one of Vibyra's two Discord channels. The webhook is piped straight
# into the app on stdin and never becomes an argument, so it stays out of the
# process list, the shell history and this script's own logs.

appimage="${VIBYRA_APPIMAGE_PATH:-$HOME/Vibyra.AppImage}"
action="${1:-configure}"
channel="${2:-models}"

case "$channel" in
  models) suffix="discord-webhook" ;;
  reports) suffix="report-webhook" ;;
  *)
    echo "Unknown channel '$channel' — use 'models' or 'reports'." >&2
    exit 1
    ;;
esac

if [[ ! -x "$appimage" ]]; then
  echo "Vibyra AppImage is not installed at $appimage" >&2
  exit 1
fi

case "$action" in
  configure)
    webhook=""
    read -r -s -p "Paste the Discord webhook URL for $channel: " webhook
    printf '\n'
    if [[ -z "$webhook" ]]; then
      echo "No webhook was entered." >&2
      exit 1
    fi
    printf '%s' "$webhook" | "$appimage" "--configure-$suffix"
    unset webhook
    ;;
  test)
    "$appimage" "--test-$suffix"
    ;;
  clear)
    "$appimage" "--clear-$suffix"
    ;;
  *)
    echo "Usage: $0 [configure|test|clear] [models|reports]" >&2
    exit 1
    ;;
esac

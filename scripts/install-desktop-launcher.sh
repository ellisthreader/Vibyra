#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APPLICATIONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
ICONS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor/512x512/apps"
DESKTOP_FILE="$APPLICATIONS_DIR/vibyra.desktop"
LEGACY_DESKTOP_FILE="$APPLICATIONS_DIR/vibyra-desktop.desktop"
LAUNCHER="$ROOT_DIR/Vibyra Desktop"
SOURCE_ICON="$ROOT_DIR/desktop/vibyra-login-logo.png"
ICON_NAME="vibyra-login-logo"
ICON="$ICONS_DIR/$ICON_NAME.png"

mkdir -p "$APPLICATIONS_DIR" "$ICONS_DIR"
rm -f "$LEGACY_DESKTOP_FILE"
install -m 0644 "$SOURCE_ICON" "$ICON"

{
  printf '%s\n' \
    "[Desktop Entry]" \
    "Type=Application" \
    "Version=1.0" \
    "Name=Vibyra" \
    "Comment=Vibyra AI desktop workspace" \
    "Exec=\"$LAUNCHER\"" \
    "Icon=$ICON_NAME" \
    "Terminal=false" \
    "Categories=Development;" \
    "StartupNotify=true" \
    "StartupWMClass=vibyra"
} > "$DESKTOP_FILE"

chmod 0644 "$DESKTOP_FILE"
update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
gtk-update-icon-cache -f "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true

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
DESKTOP_SHORTCUT_DIR="${XDG_DESKTOP_DIR:-$HOME/Desktop}"
DESKTOP_SHORTCUT="$DESKTOP_SHORTCUT_DIR/Vibyra.desktop"
LAUNCHER="$ROOT_DIR/Vibyra Desktop"
SOURCE_ICON="$ROOT_DIR/desktop/vibyra-login-logo.png"
ICON_NAME="vibyra-login-logo"
ICON="$ICONS_DIR/$ICON_NAME.png"

mkdir -p "$APPLICATIONS_DIR" "$ICONS_DIR"
rm -f "$LEGACY_DESKTOP_FILE"
chmod 0755 "$LAUNCHER"
install -m 0644 "$SOURCE_ICON" "$ICON"

write_desktop_entry() {
  local target="$1"
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
  } > "$target"
}

write_desktop_entry "$DESKTOP_FILE"
chmod 0644 "$DESKTOP_FILE"

if [[ -d "$DESKTOP_SHORTCUT_DIR" ]]; then
  write_desktop_entry "$DESKTOP_SHORTCUT"
  chmod 0755 "$DESKTOP_SHORTCUT"
  gio set "$DESKTOP_SHORTCUT" metadata::trusted true >/dev/null 2>&1 || true
fi

{
  printf '%s\n' \
    "Vibyra launcher installed:" \
    "  $DESKTOP_FILE"
  if [[ -d "$DESKTOP_SHORTCUT_DIR" ]]; then
    printf '  %s\n' "$DESKTOP_SHORTCUT"
  fi
} >&2

update-desktop-database "$APPLICATIONS_DIR" >/dev/null 2>&1 || true
gtk-update-icon-cache -f "${XDG_DATA_HOME:-$HOME/.local/share}/icons/hicolor" >/dev/null 2>&1 || true

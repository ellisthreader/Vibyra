#!/usr/bin/env bash
# System setup for building/running Vibyra Desktop on Ubuntu 22.04+/Debian 12+.
set -euo pipefail

if [[ "$(uname -s)" != Linux ]] || ! command -v apt-get >/dev/null; then
  echo "This setup script supports Ubuntu/Debian Linux. Run it on your Linux machine." >&2
  exit 1
fi

packages=(
  build-essential pkg-config curl file wget
  libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev
  librsvg2-dev libxdo-dev libssl-dev libdbus-1-dev
  gstreamer1.0-plugins-base gstreamer1.0-plugins-good
  alsa-utils pulseaudio-utils espeak-ng xdg-utils xdg-desktop-portal
)
case "${1:-}" in
  --ci) packages+=(xvfb xauth dbus-x11 webkit2gtk-driver) ;;
  "") ;;
  *) echo "Usage: $0 [--ci]" >&2; exit 1 ;;
esac

sudo apt-get update
sudo apt-get install -y --no-install-recommends "${packages[@]}"

echo
echo "System dependencies installed. Next:"
echo "  npm --prefix desktop-tauri ci"
echo "  npm --prefix desktop-tauri run app:dev    # develop"
echo "  npm --prefix desktop-tauri run app:build  # build/install AppImage and menu icon"

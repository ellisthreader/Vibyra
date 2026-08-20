#!/usr/bin/env bash
# One-time system setup for building Vibyra Desktop (Tauri 2) on Ubuntu/Debian.
set -euo pipefail

sudo apt-get update
sudo apt-get install -y \
  libwebkit2gtk-4.1-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev \
  libxdo-dev \
  libssl-dev \
  build-essential \
  pkg-config \
  curl \
  file

echo
echo "System dependencies installed. Next:"
echo "  cd $(dirname "$(dirname "$(readlink -f "$0")")")"
echo "  npm install"
echo "  npm run app:dev     # develop"
echo "  npm run app:build   # package .deb / .AppImage"

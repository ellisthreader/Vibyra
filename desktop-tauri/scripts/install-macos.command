#!/bin/zsh
# Finder entry point for a bundle already built and verified by the Mac workflow.
set -euo pipefail
cd -- "${0:A:h}/.."
node_bin="$(/bin/zsh -ilc 'command -v node' 2>/dev/null | tail -n 1)"
if [[ ! -x "$node_bin" ]]; then
  print 'Node.js is unavailable. Open Terminal and run npm run app:install:only from desktop-tauri.'
  read -k 1 '?Press any key to close.'
  exit 1
fi
if ! "$node_bin" scripts/install-macos.mjs --no-build; then
  print '\nInstallation stopped. Your running terminals have not been closed.'
  read -k 1 '?Press any key to close.'
  exit 1
fi
open "${VIBYRA_MAC_APP_PATH:-/Applications/Vibyra.app}"

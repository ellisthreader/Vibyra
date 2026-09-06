#!/usr/bin/env bash
set -euo pipefail
HOST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HOST_ROOT"
exec cargo +1.97.1 run --locked -p vibyra-host -- "$@"

#!/usr/bin/env bash
set -euo pipefail
HOST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$HOST_ROOT"
rustup +1.97.1 target add wasm32-unknown-unknown
if ! command -v wasm-bindgen >/dev/null || [[ "$(wasm-bindgen --version)" != "wasm-bindgen 0.2.127" ]]; then
  cargo +1.97.1 install wasm-bindgen-cli --version 0.2.127 --locked
fi
RUSTFLAGS='--cfg getrandom_backend="wasm_js"' cargo +1.97.1 build --locked -p vibyra-transport --release --target wasm32-unknown-unknown --target-dir target
mkdir -p generated/noise
wasm-bindgen target/wasm32-unknown-unknown/release/vibyra_transport.wasm --target web --out-dir generated/noise
printf 'Noise WASM generated at %s/generated/noise\n' "$HOST_ROOT"

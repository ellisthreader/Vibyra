# Fixed local Cloud E2E scripts (2026-10-16)

Drop-in replacements for the same-named files in the main checkout's `scripts/` (they locate the repo with `$(dirname "$0")/..`, so
copy them there; do not run them from this folder). Changes against the main-checkout originals:

- `e2e-cloud-sync.sh`: empty-array expansion that macOS bash 3.2 rejects under `set -u`.
- `e2e-cloud-computer-seed.php`: adds the phone's Connect agreement row (every Cloud route needs it since 2026-10-03).
- `e2e-cloud-computer-supervisor.mjs`: re-points the agent, browser and sync folders (`/data/...` in `PATHS`) into the scratch dir.
- `e2e-cloud-computer-boot.php`: fakes the two GitHub App endpoints the backend now calls to mint push tokens.
- `e2e-cloud-computer.sh`: throwaway GitHub App id/key and `CLOUD_GITHUB_APP_PUSH_ENABLED=true` for the throwaway backend (push is off
  by default), `exec` for the PHP/relay servers plus a port-specific reap so they no longer keep 8031/8789 after the script exits,
  and `api()` prints the response body on a 4xx/5xx instead of failing silently.

Not changed: login detection still plants credential files, but the Host now asks the CLIs, so that step proves nothing here.

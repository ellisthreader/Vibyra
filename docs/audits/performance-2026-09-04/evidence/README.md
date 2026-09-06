# Performance audit evidence

These are synthetic/local measurements and read-only public HTTP observations,
not a production load-test dataset. The parent [report](../report.md) interprets
their scope and limitations.

## Results

- `validation-summary.json`: exact commands, UTC start times, exit codes and
  log filenames for completed checks. Build time includes host contention.
- `asset-signatures.json`, `asset-decode.json`: 114 PNGs checked; 14 invalid.
  `asset-recovery-candidates.json` lists decodable candidates, not approved
  replacements.
- `mobile-bench.json`: actual app normalizer plus JSON serialization; five
  warmups and 20 samples of 1/10/40 threads with 80 messages each. Node is not
  Hermes; storage and UI work are excluded.
- `backend-bench.json`: real Laravel kernel and authentication with synthetic
  users, in-memory SQLite, array cache/session/mail and no real HTTP providers.
  Twelve measurements per case; nearest-rank p95 equals the maximum for this
  small sample count. Changed-save cases include a small changing title field
  beyond the recorded base payload size. Peak memory is for the entire harness.
- `watcher-bench.json`: actual Rust WorkspaceWatcher on scratch trees; Linux
  inotify counts and event checks, one start per directory count.
- `native-probe*.log/json`, `native-resources-summary.json`: seven real PTYs,
  six local TUI repaint loops, one focused echo pane; 40 markers per phase in
  both orders. Minified production JS, debug native binary, auto graphics,
  isolated XDG settings and unavailable real keyring. The `paint` key means
  next requestAnimationFrame callback, not physical screen presentation.
- `browser-bench.json`, `website-*.png`: original marketing snapshot, local
  Chromium with cache disabled. Desktop 1440×900, narrow 390×844, reduced motion.
  Transfer totals count completed responses; aborted media is not counted as
  another complete download. Long tasks occurred on a shared busy machine.
- `browser-current-bench.json`, `website-current-*.png`: later concurrent
  redesign snapshot using a separate bundle. The audit scaffold's manifest
  symlink was corrected and successful page mounting verified before retaining
  these results. No 500/empty-page measurements are used as a fast-page result.
- `*-bundle.json`: Vite plugin inventory before final emission. The inventory
  may include empty chunks discarded by Vite; actual build logs list emitted
  files. Raw/gzip sizes are not observed production transfer sizes.
- `http-concurrency.json`: audit-owned PHP built-in server; a synthetic handler
  sleeps two seconds while a second request waits. This is not an AI endpoint
  or an observation of production worker count.
- `public-http.json`: one GET each for `/up`, `/web-api/releases` and
  `/api/community/projects` on `https://vibyra-production.up.railway.app`.
  No authenticated data or throughput inference.
- `host-pressure.json`: point-in-time Linux PSI snapshot. It describes host
  contention and cannot identify a leaking app or historical process ownership.
- `preservation.json`, `cleanup.json`: scoped change comparison and owned
  diagnostic-process/default-build cleanup.

## Reproduction

`methods/` retains the PHP, Node and Rust fixture inputs and build drivers.
Their paths are the original machine/scratch paths; adapt both repo and output
paths to a new scratch directory before replaying. Dependencies are the
installed repository versions; no dependency upgrade was part of the audit.
Do not run these methods inside the evidence directory, because some write
results relative to their own file location.

For routine validation, use `npm run check:mobile` at the root and the desktop
`verify` components recorded in `validation-summary.json`. Build frontend
output in scratch. Run Laravel tests with explicit in-memory SQLite and array
cache/session/mail plus a non-existing `APP_CONFIG_CACHE`, as demonstrated by
the wrapper; do not migrate the developer or production database.

For the watcher fixture, use the nested desktop Rust toolchain and keep the
crate external to the application workspace. For native probes, build the
frontend with `VITE_LATENCY_PROBE=1`, use the existing `src/probe/` harness,
build the native custom-protocol executable with scratch frontend assets,
copy it to scratch, and restore the normal Cargo build output. The retained
native runner omits screenshot capture so it cannot capture unrelated windows;
its process sampling/phase logic matches the measurement run. It must retain
isolated XDG directories, unavailable real keyring and blocked provider fetches.

Run timing experiments sequentially on a quiet host. Repeat phase orders and
collect substantially more samples before setting production percentile SLOs.
Preserve raw results after implementation so the same fixtures can be compared.

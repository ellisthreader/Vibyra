# Windows Desktop Bug Sweep 2026-07-02

Date: 2026-07-02.
Scope: full Vibyra Windows desktop test suite triage (1024 tests, 61 failing at
start), terminals page live-bug review, and terminals frontend visual refresh.
Companion note: [[Windows Desktop Current Bug Report]] (the 2026-07-01 report;
its eight bugs were fixed earlier and remain covered).

## Summary

Starting state: `node --test desktop/assets/*.test.mjs desktop/lib/*.test.mjs
desktop/electron-main.test.mjs` reported 1024 tests, 960 pass, 61 fail,
3 skipped. Failures clustered into four areas, fixed in parallel:

1. Terminals frontend/renderer regressions (4 failures) — fixed.
2. Windows path / permission / executable-name issues in terminal libs
   (11 failures across 9 files) — fixed, including one real security-relevant
   product bug.
3. Preview-server startup cluster (~30 failures) — see fix record below.
4. Desktop chat routing cluster (16 + 2 socket failures) — see fix record below.

On top of the test failures, a live-code review of the terminals page found and
fixed a high-severity clipboard bug that tests previously encoded as correct
behavior.

## Live terminals-page bugs found by review (no failing test at start)

### Clipboard hijack from stale terminal selection — HIGH, fixed

- Location: `desktop/assets/app.terminals-pty-runtime.js`,
  `terminalXtermForCopyEvent`.
- Root cause: the capture-phase document `copy`/`keydown` handlers fell back to
  the active terminal's xterm whenever the event target and DOM selection were
  not inside any terminal. xterm keeps its selection indefinitely after blur,
  so copying anywhere else in the app (Settings, notices, context-menu copy)
  could overwrite the clipboard with an old terminal selection.
- Fix: added `terminalXtermOwnsCopyContext` — the active-terminal fallback now
  only fires when focus is genuinely inside that terminal's UI (xterm element
  or `[data-terminal-input]` wrapper) or the current DOM selection lives inside
  the xterm element.
- Guardrails: `desktop/assets/app.terminals-input.test.mjs` — the wrapper-focus
  copy test now actually models wrapper focus, and a new regression test proves
  a stale terminal selection with focus outside the terminal no longer captures
  the copy event. 21/21 pass.

### Model picker forced a live OpenRouter refresh on every boot — MEDIUM, fixed

- Location: `desktop/assets/app.terminals-models.js`,
  `loadTerminalOpenRouterModels`.
- Root cause: the bug-8 fix from 2026-07-01 made every window load call
  `/desktop/openrouter-models?refresh=1`, so a slow or rate-limited OpenRouter
  delayed the picker on every start (with a silent fallback to the static
  list).
- Fix: two-phase load — apply the cached catalog immediately, then run the
  forced refresh in the background and re-apply if it returns. 16/16 model
  tests pass.

### Reviewed and confirmed safe (no change)

- Wrapper-focus keydown fallback: single input owner holds; no double-send
  path (bugs 5/7 from the 2026-07-01 report stay fixed).
- F8 voice toggle: Electron `before-input-event` suppresses the DOM duplicate;
  120 ms debounce covers the rest; mic tracks released on cancel.
- Editor link provider ranges and OSC-8 handling are correct and idempotent.
- Cursor-visibility passthrough (`\x1b[?25h/l` no longer stripped) is
  intentional; xterm owns cursor state with `cursorBlink: false`.
- `reconcilePtyTerminalSessions` 15-second pending window is safe:
  `ptyStartQueued` stays set for the whole in-flight start request, so
  terminals cannot be reaped mid-start (a reviewer flagged this; traced and
  disproved).

### Known design risk (documented, not changed)

- `terminalOpenRouterModelAllowed` lets any provider-qualified slug
  (contains `/`) through the picker filter. Launch still fails closed at the
  backend if pricing/tool metadata is missing, so a newly listed model can be
  visible but refuse to launch. Intentional per bug 8; revisit if users hit
  launch-time rejections.

## Test-suite fixes

### Terminals frontend cluster (4 fixed)

1. `app.terminals-reconciliation.test.mjs` "xterm rendering avoids visible
   cursor blink and full replay" — stale test: asserted the old
   cursor-sequence strip that the 2026-07-01 fix intentionally removed.
   Assertion inverted to require the strip stays absent.
2. `app.terminals-chrome-polish.test.mjs` "clean selected accent" — CRLF
   checkout broke the test's literal `\n` selector matching; test now
   normalizes line endings.
3. `app.screenshot.test.mjs` "screenshot folder picker" — stale after commit
   e3c620f moved the settings panel call into `app.settings-sections.js`;
   test now reads that file.
4. `aiTerminalOpenRouterCli.test.mjs` "API-only intro" — PRODUCT bug:
   `displayDirectory` only shortened `$HOME/…` with forward slashes, so no
   Windows path ever displayed as `~/…`. Fixed in
   `desktop/lib/aiTerminalOpenRouterCli.mjs` (backslash home prefix +
   normalized display); test now uses `homedir()` instead of a hardcoded
   POSIX path.

### Windows path/permission cluster (9 files, 67/67 now pass)

- PRODUCT bug (security-relevant): `pathWithinRoot` in
  `desktop/lib/aiTerminalVibyraAgentWorkspace.mjs` used
  `startsWith(base + "/")`, which never matches on Windows — Standard-mode
  terminals rejected every legitimate workspace subpath. Replaced with a
  `path.relative`-based containment check; `~\` expansion also accepted now.
- Test-side fixes (product behavior was correct):
  - `terminalWorktrees.test.mjs`: POSIX `/` separator assertion → `path.sep`.
  - `terminalTeamProviderPlanner.test.mjs`: `/codex$/` →
    `/codex(\.exe|\.cmd)?$/i` (Windows resolves `codex.exe`).
  - `terminalEditor.test.mjs` and `aiTerminalVibyraAgentWorkspace.test.mjs`:
    file symlinks need elevation on Windows; tests now use junctions or
    tolerate EPERM while still asserting the escape contract with an
    absolute outside path. No security check weakened.
  - Mode-0600 assertions (`deviceCredentials`, `pairingAccount`,
    `terminalGatewayAuth`, `lanV2Protocol`): Windows cannot represent POSIX
    mode bits (stat reports 0o666). New shared helper
    `desktop/lib/secretFileTestHelpers.mjs` asserts literal 0600 on POSIX and
    on Windows runs `icacls /findsid` to prove no Everyone / BUILTIN\Users /
    Authenticated Users ACE exists — a real owner-only check, not a skip.

### Desktop-chat cluster (16 + 1 socket test, all pass)

- All test bugs; no product changes. `desktop/lib/desktopChat.test.mjs`
  hard-coded the original developer's Linux filesystem (`/tmp/saas`,
  `/home/ellis/Desktop/SaaS`, base64 project ids of those paths), so on
  Windows every fake project failed the real on-disk validation in
  `desktop/lib/projects.mjs` and fell into slow real project discovery.
  The tests now create real temp project dirs (`mkdtempSync`), isolate
  `VIBYRA_AGENT_HOME` before module import, and compute expected ids with the
  product's `projectIdFromPath`. Suite went from 12/28 in ~24s to 28/28 in
  ~4.5s.
- `ptyTerminalsSocket.test.mjs` "parallel launches cannot race past the cap":
  Windows-only cleanup race — `rmSync` ran while the detached worker was still
  releasing its session dir over the named pipe (~100-200 ms). Cleanup now
  retries. Product close path verified correct on Windows.

### Preview-server cluster (~30 tests, all pass) — the big one

Root cause chain, all Windows-specific:

1. PRODUCT/test bug (leak): preview tests cleaned up dev servers with
   `child.kill()`. On Windows the tracked child is a cmd.exe shell host
   (see `desktop/lib/commandSpawn.mjs`), so `.kill()` killed the shell and
   ORPHANED the actual fake dev-server node process. 18 orphaned fake servers
   had accumulated on this machine, squatting the default Vite ports
   5173-5175 and serving fake Vite HTML that passes product verification.
   Every later test run "verified" against those ghosts instead of its own
   server. Fixed: all preview test fragments now clean up through
   `killTrackedPreview` → `killCommandTree` (taskkill /T tree kill); leaked
   processes were hunted down and killed.
2. PRODUCT bug (`desktop/lib/previewPortAllocator.mjs`): a successful bind is
   not proof of a free port on Windows — SO_REUSEADDR lets the probe bind
   while another process is still listening, so the allocator could hand out
   an occupied port. `portLooksFree` now first attempts a real TCP connect to
   127.0.0.1:port; anything that accepts a connection owns the port.
3. PRODUCT bug (`desktop/lib/previewDevServer.mjs`): two preview targets of
   the same project can serve byte-identical roots (monorepo apps), and both
   the launch verification (`launchedDevServerUrl`) and the running-server
   fallback (`runningProjectDevServerUrl`) could adopt a port that ANOTHER
   tracked preview target already claimed — two targets ended up pinned to
   one server. Both paths now exclude ports claimed by other tracked preview
   services (`portsClaimedByOtherPreviews`; launch ports are recorded on the
   tracked service at spawn time).

### Terminal gateway registry (1 test, passes)

- PRODUCT bug (`desktop/lib/terminalGatewayAuth.mjs`): the atomic
  `renameSync(tmp, registry)` swap fails with EPERM on Windows whenever
  another process (detached terminal worker, AV scan) briefly holds the
  registry file open. Token issue/revoke operations could crash. The rename
  now retries briefly on EPERM/EACCES/EBUSY (Windows only) before failing.
- Also bumped a 5 s revocation wait to 15 s in
  `aiTerminalPersistentProcess.test.mjs` — the assertion is unchanged; the
  deadline was too tight under full-suite parallel load.

## Frontend visual refresh

- New paint-only layer `desktop/assets/app.terminals-visual-refresh.css`,
  loaded after `app.terminals-auto-polish.css` and before the theme-audit
  layers in `desktop/app.html`.
- Contents: unified radius scale (8 px controls / 10 px menus / 12 px panels),
  a consistent two-layer shadow stack for menus and setup panels, token-driven
  agent-option cards (replacing hardcoded rgba values), pill meta chips,
  refined tab/label typography, slim themed scrollbars for terminal chrome
  (menus, pickers, panels — never xterm viewports), calmer status-dot colors,
  and reduced-motion guards.
- Constraints respected: no gradients, no blur/backdrop-filter/text-shadow, no
  xterm-owned geometry, zero-gap grid tiles preserved. Theme-audit,
  chrome-polish, auto-polish, and page-regression suites pass (14/14).

## Final Verification

- Full run: `node --test desktop/assets/*.test.mjs desktop/lib/*.test.mjs
  desktop/electron-main.test.mjs`
- Start of sweep: 1024 tests, 960 pass, 61 fail, 3 skipped.
- End of sweep: **1025 tests, 1022 pass, 0 fail, 3 skipped (Linux-only)**.
- Interim checks along the way: terminals input 21/21 after the clipboard
  fix; models 16/16 after two-phase load; theme/chrome/polish/regression
  14/14 after the visual refresh; path/permission cluster 67/67;
  desktopChat 28/28; preview + publish 127/127.
- No orphaned `vibyra-fake-*` processes remain after a full run (previously
  18 were leaked and squatting the Vite default ports).

## Maintenance guidance

- Never clean up spawned preview/dev-server children with `child.kill()` in
  tests on Windows — always `killTrackedPreview`/`killCommandTree`, or the
  real server outlives the shell host and poisons later runs.
- Port-availability checks must connect-probe, not just bind-probe, on
  Windows.
- Secret-file privacy on Windows is asserted through
  `desktop/lib/secretFileTestHelpers.mjs` (icacls owner-only check), not
  POSIX mode bits.

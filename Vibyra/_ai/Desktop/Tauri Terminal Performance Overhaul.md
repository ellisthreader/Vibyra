---
title: Tauri Terminal Performance Overhaul
date: 2026-08-20
updated: 2026-08-24
status: released
tags:
  - vibyra/desktop
  - vibyra/tauri
  - performance
  - terminal
aliases:
  - Tauri Terminal Lag Fix
  - Blank Terminal Pane Fix
related:
  - "[[Rust Tauri Desktop]]"
  - "[[Vibyra Desktop Memory]]"
---

# Tauri Terminal Performance Overhaul

Scope: the Rust/Tauri app in `desktop-tauri/` only. The Electron app in
`desktop/` is a separate implementation and shares none of these fixes; its
performance record stays in this note.

> [!info] Public desktop release
> Vibyra Desktop 0.1.10 is live for Windows and Linux. The website downloads
> and signed Tauri updater feed serve the spacing, typing, and sustained-lag fix.

## Symptoms

Four terminals spawned at once all rendered black with a live cursor and a
full xterm buffer. Typing lagged behind keystrokes. Idle WebKit CPU sat around
46%. Plain `Terminal` and `Gemini` launches failed outright with a
settings-error toast.

## Root causes and fixes

### 1. WebGL that loads but never composites

Under WebKit's shared-memory compositing path (DMA-BUF renderer disabled),
WebGL canvases accept draws and never paint. `@xterm/addon-webgl` reported a
successful load and the pane stayed black. Renderer strings cannot detect this
— WebKitGTK's ANGLE reports bogus names like "Apple GPU" on Linux.

Fix: Rust owns the decision and the frontend asks for it.
`configure_webkit_renderer` (`src-tauri/src/lib.rs`) sets
`WEBKIT_DISABLE_DMABUF_RENDERER` only when the NVIDIA kernel module is present
(`/sys/module/nvidia`), overridable with `VIBYRA_WEBKIT_DMABUF=1|0`. The
`software_compositing` command (`src-tauri/src/commands/render.rs`) reports the
resulting mode; `src/lib/xtermRenderer.ts` resolves it once at startup via
`initRendererPolicy()` and attaches WebGL only on the accelerated path,
falling back to the always-correct DOM renderer otherwise.

Never probe GL context strings for this decision, and never create throwaway
WebGL contexts in a loop — leaked contexts crash the WebKit web process.

### 1b. The addon shipped to machines that can never use it

`@xterm/addon-webgl` was imported statically, so every shared-memory machine
parsed ~114 kB of addon it can never load. It is now imported dynamically inside
`initRendererPolicy`, only once the probe says the accelerated path won, and
awaited there rather than in `attachRenderer` so that stays synchronous — the
policy settles long before the first terminal mounts. `WebglAddon` being null
*is* the "use the DOM renderer" signal; do not reintroduce a separate
`webglTrusted` flag that can disagree with it.

### 2. Forced layout in the terminal write path

The bottom-anchor code called `getBoundingClientRect` and scanned rows on every
output batch and every scroll event — up to 125 forced layouts per second per
terminal.

Fix (`src/lib/terminalBottomAnchor.ts`): cell height is measured on fit/resize
and cached on `BottomAnchorState`; the row scan is bounded to rows *below* the
cursor; the transform is written only when the offset actually changes. The
write path now performs zero forced layouts.

### 3. A sleep before the first flush

The Rust flusher slept 8 ms *before* every flush, including the first one after
an idle wake — a fixed floor under keystroke echo latency.

Fix (`crates/vibyra-core/src/pty/flusher.rs`): flush immediately on wake, then
rest one `config.tick` (16 ms) only *after* a delivery, so sustained output
still coalesces. Do not reintroduce a pre-flush sleep.

`ChannelSink` (`src-tauri/src/sink.rs`) also moved from one map-wide mutex to
per-session locks, so a dozen busy panes no longer contend on a single lock
every tick.

### 4. Compositor never resting

The app software-composites on the NVIDIA path, and on top of that ran an 18px
`backdrop-filter` titlebar blur, `box-shadow`-animated status dots, and a
multi-MB decoded logo.

Fix: `src/styles/chrome.css` is deliberately unblurred (the bar is nearly
opaque anyway); `pulse-ring` in `src/styles/base-motion.css` animates opacity
only. Both carry comments explaining why — do not "restore the polish".

### 5. PTYs spawning at the wrong size

PTYs started at a hardcoded 100x30 and visibly re-wrapped once the grid
settled. `src/lib/spawnSize.ts` now estimates rows/cols from the stage
rectangle, the grid column count, and the measured cell size, so CLIs draw
their first frame at the right width. `mountTerminal` also fits *before*
attaching the event bus, so replayed output never wraps at a stale width.

### 6. Launch matrix mismatch

The rail sent its effort/Full-access defaults to agents that reject them, so
plain `Terminal` and `Gemini` launches errored. `src/lib/configuredLaunch.ts`
now mirrors the backend matrices: `EFFORT_AGENTS` = claude/codex only,
`FULL_ACCESS_AGENTS` = claude/codex/gemini, and `PLAIN_TERMINALS`
(shell/ssh) are exempt from the Full-access veto.

### 7. Startup and background churn

- `openRouterCatalog.ts` precompiles `BLOCKED_PATTERNS` once at module scope
  instead of building a RegExp per term per model (~13k compiles at startup).
- `crates/vibyra-core/src/fsx/watch.rs` ignores `node_modules`, `target`, and
  `.git`, killing the event storm that crossed IPC on every install/build.
- Memory-document parsing was moved off the startup path.

### 8. Input appearing one keystroke behind

The hazard is real: `#[tauri::command] async fn` is handed to `tokio::spawn`,
so two `write_terminal` invocations posted a millisecond apart can be polled in
either order. The native writer mutex stops the bytes interleaving but cannot
restore their order, so fast typing could echo reversed text.

**Do not fix this with a promise queue in the frontend.** A per-PTY serial
writer in JS (`terminalInputQueue.ts`, shipped in 0.1.9 and removed on
2026-08-24) makes keystroke N+1 wait for keystroke N's IPC *response*. That
response callback is scheduled on the WebKit renderer's JS thread — the same
thread that is busy painting keystroke N's echo — so input runs in lock-step
with paint and the pane permanently shows the key typed before last. It also
coalesces a burst into clumps, which reads as glitchy. The queue converts
renderer congestion directly into input latency, which is exactly the symptom
it was meant to cure, and it gets *worse* the busier the terminals are.

The ordering guarantee belongs where ordering already exists:

- WebKitGTK delivers `window.webkit.messageHandlers.ipc.postMessage` to Tauri
  in the order the page posted it, on the main thread.
- Only `async` commands are spawned. A **synchronous** `#[tauri::command]` runs
  inline in that ordered dispatch, so byte order is structural.
- A synchronous command must never block, or a child that stops reading its
  stdin would stall every other IPC message. `write_terminal` therefore only
  queues; `crates/vibyra-core/src/pty/writer.rs` owns a per-session writer
  thread that performs the blocking `write_all`.

`src/ipc/terminal.ts` posts each keystroke immediately and never awaits the
previous one. The invariant test "terminal input is posted immediately and
ordered natively" pins all three halves — no queue in the frontend, `pub fn`
(not `pub async fn`) in the command, and a queueing writer behind it. Rust
tests cover order across 200 separate writes and prove that queueing 1 MiB to a
child that never reads returns immediately.

## Measured result

Driven end-to-end on a 4-terminal grid: launch to visible prompt under 2s,
WebKit CPU 7–8% (was 46% while idle), 80+ chars/sec typing with zero dropped
input, every prompt visible immediately. Local gates green: `npm test` (52
passing), typecheck, `vite build`, `cargo fmt`, strict clippy, `cargo test`,
and the 200-line source gate.

## 2026-08-23 live recurrence: hidden panes overload the DOM renderer

On this NVIDIA-primary machine, `rendererMode: auto` correctly selects the
compatibility/DOM path. With seven Codex panes across two projects, WebKit held
101–103% CPU continuously while the native process used 8–9%; a clean 10-second
sample still had about 84% whole-machine CPU idle, healthy RAM/no swap, and an
almost-idle system disk. This is renderer-thread congestion, not host pressure.

The active Vibyra project had three panes and the hidden HKE project had four.
Four PTYs were emitting about 10 KiB/s total, and the two hidden HKE panes
contributed about 6 KiB/s. `projectStore.ts` marks other-project panes `hidden`
and Rust coalesces them to 250 ms, but `TerminalView` only removes the container
on unmount; the registry-owned xterm and its IPC handler remain attached, so
off-screen chunks still enter `term.write`. Future remediation should keep the
PTY/ring alive while pausing frontend xterm writes for hidden projects, then
resync on reveal. A roughly 2 MiB scrollback heartbeat every 120 seconds can
cause a brief HDD stall, but is not the continuous lag source.

### 2026-08-23 terminal lifecycle hardening

The hidden-pane recurrence is now fixed at the delivery boundary. Off-screen
panes remain logically `hidden`, while `terminalVisibility.ts` maps them to
native `hibernated`: Rust retains the PTY and ring buffer without sending IPC
output. `TerminalView` detaches the event handler but keeps the registry-owned
xterm, and reveal queues an authoritative resync that supersedes stale output
while preserving a final exit event.

Resume, restart, and account switching are single-flight per pane and launch a
replacement before tearing down the working PTY. Stable pane persistence IDs
let the native store carry old scrollback into a replacement; serialized saves
merge that replay base with the replacement ring so a later updater save cannot
lose pre-resume history. Metadata-only saves retain prior snapshots. Update
installation is disabled while running, does not start after a failed full save,
and leaves a failed restart retryable.

Native process ownership is also hardened: the PTY exit callback owns the
session directly, so very fast exits cannot beat manager registration; frontend
creation stops at the native 24-session limit; and the Tauri single-instance
plugin prevents two app processes from racing on the same `session.json`.

Validation passed with 258 frontend tests, typecheck, production build,
dead-code and 200-line gates, strict clippy and Rust formatting, 83 core tests,
158 native tests, and two updater-signing tests. A disposable native launch
confirmed that a second instance exits while the original remains the sole
owner. Its isolated account did not restore far enough to mount the signed-in
workspace, so the multi-terminal click-through was not claimed as live proof.
Use the terminal reliability checklist in `.agents/skills/VibyraOptimse/` for
future lifecycle or updater work.

The current source-worktree package check also produced an executable 0.1.8
AppImage (158,579,192 bytes, SHA-256 `d81decc5…`) in the machine's redirected
Cargo target. Rust checks may use the local `vibyra-devshim`, but do not pass
that synthetic `PKG_CONFIG_PATH` into `linuxdeploy`: its `gtk+-3.0.pc` omits
`exec_prefix`. Packaging with the real system GTK metadata completed. This was
verification only; the dirty-worktree artifact was not installed or published.

### 2026-08-23 Vibyra 0.1.8 public release

The reviewed candidate is commit `c07b7fa`, tagged `v0.1.8`, on
`release/0.1.8-terminal-reliability`. Review found and fixed carried-history
loss during provider-account switching, orphaned late PTY events after restart,
and Windows dead-code gating for Linux-only Codex rollout discovery. The final
local gate passed 260 frontend tests, production build, dead-code and 200-line
checks, strict clippy/formatting, 91 core tests, 158 desktop-native tests, and
two updater-signing tests.

GitHub Actions run `32663072277` then built, updater-signed, installed, and
launched all supported packages successfully. Production now serves Windows
NSIS (8,428,964 bytes, SHA-256 `9d2d24cb…`), Linux AppImage (98,904,568 bytes,
SHA-256 `1c9ad7cc…`), and Debian (10,870,178 bytes, SHA-256 `3b09c8dc…`). Each
file was streamed to a hidden `.uploading` path on the Railway release volume,
verified remotely by exact size and hash, and atomically renamed before the
metadata redeploy. `/web-api/releases`, all three direct-download headers, the
0.1.7-to-0.1.8 updater payloads/signatures, and the 0.1.8 no-update responses
were verified live. macOS remains unavailable because there is still no signed
and notarized macOS build path.

The production announcement dry run found seven eligible accounts, but
`mail.default` is `log` and no transactional-mail variables exist. The command's
safety guard therefore prevented delivery; do not record or claim an email send
until a real mail transport is configured and `vibyra:announce-release 0.1.8
--send` succeeds.

### 2026-08-23 Vibyra 0.1.9 public terminal-input hotfix

The isolated release candidate is commit `4a37c8b5`, tagged `v0.1.9`, on
`release/0.1.9-terminal-input`. It contains only the per-PTY input queue, its
IPC wiring/tests, and the 0.1.9 version metadata. The exact candidate passed
264 frontend tests, typecheck and production build, dead-code and 200-line
gates, strict clippy/formatting, 91 core tests, 158 desktop-native tests, and
two updater-signing tests.

GitHub Actions run `32667449785` updater-signed, installed, and launched all
three supported packages successfully. Production serves Windows NSIS
(8,432,398 bytes, SHA-256 `4e4a7942…`), Linux AppImage (98,904,568 bytes,
SHA-256 `9784280a…`), and Debian (10,870,138 bytes, SHA-256 `d6559907…`). Each
artifact was streamed to a hidden Railway path, verified remotely by exact
size/hash, and atomically renamed before deployment `a752fe24` switched the
metadata. Live checks confirmed `/web-api/releases`, exact direct-download
headers, signed 0.1.8-to-0.1.9 updater payloads, and 204 no-update responses for
0.1.9 across AppImage, Debian, and Windows NSIS.

For recurrence diagnosis, measure actual PTY ingress from the named
`vibyra-pty-*` threads under `/proc/<Vibyra PID>/task/*/io`; child-process
`wchar` includes files and network traffic and overstates terminal output.

### 2026-08-24 terminal spacing and sustained-lag regression

The installed public 0.1.9 AppImage (`9784280a…`) still contained two release
regressions. Commit `3c872fd` (0.1.7) changed the xterm WebGL addon to a dynamic
import, but startup only prewarmed that promise. A terminal that mounted first
called the synchronous attach function once, saw no constructor, and remained
on the DOM renderer permanently. Commit `88a5aa2` (0.1.8) then called the
bottom-anchor viewport scan from every `onData` key event. The 0.1.9 input
queue correctly repaired IPC byte ordering, but did not repair either hot path.

Font spacing had an independent startup race. Fontsource registers JetBrains
Mono with `font-display: swap`; an early `document.fonts.load()` can resolve
with an empty face list before WebKit has registered the stylesheet. Caching
that as ready lets xterm open and fit against fallback metrics, which xterm does
not automatically remeasure after the real font swaps in. The font gate now
awaits `FontFaceSet.ready`, requires non-empty regular and bold matches, and is
awaited by both live and suspended xterms before construction/open/fit.

Every xterm now awaits the cached renderer decision, attaches at most one WebGL
addon, rechecks liveness after the await, and records the observed backend on
its host. Typing no longer runs anchor scans and uses `scrollOnUserInput`.
OSC/DCS/CSI replies emitted by xterm are filtered before prompt/title tracking,
so colour queries cannot produce titles such as `]10;rgb:…`. Home, project,
and Preview visibility changes share one transition queue; Home hides native
terminal delivery, stops previews, unwatches the workspace, and clears the
project-owned workspace state.

Repeated AppImage relaunches had also accumulated 61 distinct mount paths in a
live terminal child environment, including 20 in `LD_LIBRARY_PATH`. PTY spawn
now removes AppImage-owned variables and every current/stale sibling
`/tmp/.mount_*` path component. A synthetic live launch carrying eight mount
paths produced a new shell with zero mount paths and only system library/data
paths. The recursive watcher still registered 12,122 directories in the live
workspace; added `vendor` and `.vibyra-agent` event filters reduce IPC churn but
do not prevent registration/debouncer work. That controller redesign is a
separate optimization, not the spacing or continuous renderer-CPU cause.

Live proof used an isolated signed-in native release window with a unique Tauri
identifier, leaving the user's sessions untouched. Before any manual font load,
both JetBrains weights reported ready; the restored live terminal reported
`webgl`, three canvases, and zero DOM rows. A 1 ms exact alphanumeric typing
burst arrived in order, `echo VIBYRA_DONE` executed correctly, and the pane
title stayed normal. The affected renderer held 103.3% CPU continuously; the
repaired renderer averaged 3.0% after the same terminal settled and returned to
that level after a controlled roughly 7 KiB/s stream. Automated gates passed
288 frontend tests, typecheck/build, dead-code and 200-line checks, strict Rust
format/clippy, 94 core tests, 158 desktop-native tests, and two signing tests.

The final clean-environment local 0.1.10 AppImage is installed at
`/home/ellis/Vibyra.AppImage`: 158,595,576 bytes with SHA-256
`a0da47f687c07289a2e4039f69d61fb4035cdbd101bdf0d2c2a70406ef3a0f65`.
It contains the separate WebGL chunk, bundled JetBrains Mono subsets, and the
WebKit/JavaScriptCore libraries. It has not been published. Existing Vibyra
windows were deliberately left running to preserve terminal sessions, so a
quit and reopen activates this build. AppImage builds must be exclusive because
Tauri packaging shares `cargo-target/release/bundle/appimage/Vibyra.AppDir`.

#### Four-pane residual repaint loop

A final four-pane native stress run found a separate WebKitGTK compositor
amplifier after the renderer, font, and input fixes. The tiny working/attention
indicators still used infinite `pulse-ring` opacity animations. With WebGL
terminal canvases visible, those animations kept WebKit repainting the whole
grid: the same settled project averaged 94.67% WebKit CPU, 10.67% native CPU,
and 31,247.5 WebKit minor faults/s. Disabling only the status pulses in the
inspector reduced those figures to 32.33%, 0.67%, and 336.33 faults/s;
re-enabling them restored the high load.

The four infinite declarations are now removed from the activity dots, project
strip badge, and Home attention marker, and the unused keyframes are gone.
Static colour/ring/badge styling remains. An invariant rejects future infinite
status animations because even an opacity-only dot can continuously composite
nearby WebGL canvases under WebKitGTK.

The exact optimized 0.1.10 source binary then restored four suspended panes
with both JetBrains weights ready before xterm open, attached WebGL to all four
with zero DOM rows, preserved a 662-byte 1 ms typing burst and a 4,498-byte
paste byte-for-byte, delivered all 10,000 sustained-output markers, and kept
WebGL after Home/project unmount-remount. During output it averaged 31.75%
WebKit and 5.50% native CPU; once settled it averaged 1.88% and 0.00%, with
1.62 and 3.12 minor faults/s. The local installed AppImage above predates this
last static-indicator source edit; packaging the current source reached the
optimized executable but `linuxdeploy` did not produce a replacement bundle.
Frontend tests (290), typecheck, production build, dead-code, line-limit, and
diff-whitespace gates pass. This validation preceded the signed CI packaging
and production publication recorded below.

#### Vibyra 0.1.10 public release

The isolated candidate is commit `57303da`, tagged `v0.1.10`, on
`release/0.1.10-terminal-performance`. GitHub Actions run `32677819901` passed
the complete release gate, updater-signed all three packages, and installed and
launched each package on its native runner. Independent local verification
matched every archived checksum and verified all three signatures against the
public key embedded in the candidate.

Production serves Windows NSIS (8,429,243 bytes, SHA-256 `4e088a69…`), Linux
AppImage (98,904,568 bytes, SHA-256 `cd6708b9…`), and Debian (10,870,488 bytes,
SHA-256 `4c46716d…`). Each artifact was streamed to a hidden Railway volume path,
verified remotely, and atomically promoted before deployment `7308b36e`
activated the metadata and website. Full public GET hashes, attachment headers,
the 0.1.9-to-0.1.10 updater payloads/signatures, and 0.1.10 no-update responses
were verified for all three bundle types. The rendered Downloads page includes
the apology and directs users to 0.1.10. macOS remains unavailable.

The production announcement dry run found two verified accounts. Delivery was
not sent: the command correctly refused `--send` because production still uses
the `log` mailer, and the connected Gmail identity is a personal account rather
than an authenticated Vibyra sender. Keep both recipients pending until a real
transactional provider and Vibyra From domain are configured; do not claim an
email delivery from this release.

### 2026-08-24 the input queue was the regression, and a video nobody could see

Measured on the live installed 0.1.10 AppImage while the user reported typing
one key behind, with seven PTYs open emitting only ~8 KB/s in total:

- `WebKitWebProcess` held 65–96% CPU. Per-thread sampling
  (`/proc/<webkit pid>/task/*/stat`) is what separates the causes; whole-process
  CPU does not.
- A **GStreamer H.264 pipeline ran continuously**: `av:h264:df0/df1`,
  `qtdemux0`, `multiqueue0`, `vqueue:src` — a steady ~35–40% of a core across
  repeated samples. It is `auth-space-loop.mp4` (1920x1080, 24 fps, 7 s loop,
  a `data:` URI so it needs no network). Signing in unmounts `AuthScreen`, but
  detaching a playing `<video>` does not tear down WebKit's decoder. The
  element is now paused, its `src` removed and `load()` called on unmount —
  and the element must be captured in the effect body, because React detaches
  refs before it flushes an unmounting tree's cleanups.
- The JSC `ollector Thread` (truncated "…Collector Thread") hit 91.5% in one
  sample and 0.3% in the next. That was a transient collection, **not** a
  steady GC storm — always take a second sample before blaming the collector.
- Terminal output reaches the page through `webview.eval` per batch: Tauri
  sends channel payloads under 8 KB by evaluating a fresh script
  (`tauri/src/ipc/channel.rs`, `MAX_JSON_DIRECT_EXECUTE_THRESHOLD`). One eval
  per session per 16 ms tick, so panes multiply main-thread parse/compile work
  even when the byte rate is trivial. Not changed; recorded because it is the
  floor under terminal rendering cost.

The reported symptom itself was the frontend input queue — see section 8, which
now records why that shape can never work and what replaced it.

### Auto now reacts to this failure mode

The earlier performance guard survived, but its native sampler only walked
WebKit children after whole-machine CPU reached 85% or Vibyra reached 70% of
all cores. A single `WebKitWebProcess` at 100% is only about 12.5% on an
eight-core machine, so this exact renderer bottleneck was invisible and the
Auto notification never fired.

`src-tauri/src/perf_renderer.rs` now cheaply identifies Vibyra's direct
`WebKitWebProcess` child through `/proc` and reports raw renderer CPU, where
100% means one saturated core. `perfPolicy.ts` treats 80% as degraded. After
the existing 30-second startup warmup and four bad 1 Hz verdicts, Auto on the
software-compositing path sends “Auto detected slow terminal rendering” with
a **Use GPU next launch** action. The action persists `rendererMode:
accelerated`; it never silently restarts Vibyra or interrupts live PTYs. An
explicit Compatibility choice, or an environment-forced renderer policy,
continues to open Graphics settings instead of being overwritten.

Validation: the 233 frontend tests, production web build, typecheck, 234 Rust
workspace tests, strict clippy, Rust formatting, and the 200-line desktop gate
all pass.

### GPU setting visibility and relaunch ownership

`SettingsGeneralPane.tsx` keeps **GPU usage** as the first General block; do not
bury it below terminal controls. The persisted choices remain Automatic,
Accelerated (`Allow GPU` in the UI), and Compatibility. Automatic starts with
the topology-safe path and, when CPU rendering stays slow, offers **Allow GPU
next launch** without interrupting live terminals. Unknown persisted values
normalize to Automatic in `settingsStore.ts` and again when Rust saves them.

`WEBKIT_DISABLE_DMABUF_RENDERER` is an output of Vibyra's startup policy, not a
supported input override. Relaunches and updater restarts inherit it, so
treating its presence as external pinned the previous CPU path, made Settings
show a false environment-override warning, and disabled Auto's GPU action.
`renderer_probe.rs` now clears it before recomputing the saved mode; only the
app-specific `VIBYRA_WEBKIT_DMABUF=1|0` can override Settings. Keep the
inherited-flag Rust regression test when changing startup or updater behavior.

## Making it work on other people's hardware

The original fix was correct but tuned to one machine's answer. Three changes
generalise it without altering the behaviour Ellis validated.

### Detection narrowed to sessions that actually render on NVIDIA

`/sys/module/nvidia` is present on hybrid-graphics laptops even when the
compositor runs on the Intel/AMD iGPU, so the old rule pushed those users onto
software compositing they did not need. `renderer_probe.rs` now reads the PCI
vendor of the `boot_vga` card — the GPU the display server brings the session
up on — and treats the session as NVIDIA only when that card is NVIDIA
(`0x10de`) or the session explicitly asks for PRIME offload
(`__NV_PRIME_RENDER_OFFLOAD`, `__GLX_VENDOR_LIBRARY_NAME=nvidia`).

An unreadable topology stays on the shared-memory path. The asymmetry is
deliberate: guessing wrong towards acceleration freezes windows, guessing wrong
the other way only costs CPU.

Verified against this machine's topology (single card, `boot_vga=1`,
`vendor=0x10de`): old rule and new rule both disable DMA-BUF, so the validated
behaviour is unchanged here while hybrid laptops now keep the fast path.

### A discoverable setting instead of an env var

`Settings → General → Graphics` offers Auto / Accelerated / Compatibility,
persisted as `rendererMode` in `settings.json` and read by `renderer.rs`
before the webview exists. The card names the path running right now and why,
says when a restart is needed, and says so honestly when
`WEBKIT_DISABLE_DMABUF_RENDERER`/`VIBYRA_WEBKIT_DMABUF` in the environment is
overriding the setting rather than promising a restart that will not help.

Precedence, highest first: the environment variable already set by the user,
`VIBYRA_WEBKIT_DMABUF=1|0`, the saved mode, then detection.

### Tests where there were none

The renderer policy previously had no test on either side. Rust now covers
mode parsing, every detection branch (no module, NVIDIA primary, hybrid iGPU,
PRIME offload, unreadable topology) and `boot_vga` scanning against a fixture
tree. `src/lib/rendererPolicy.ts` holds the frontend's half as pure functions
— WebGL trust, mode resolution, restart detection — mirroring the Rust policy,
with `tests/rendererPolicy.test.mjs` over it. A failed compositing probe
resolves to the DOM renderer, which is the always-correct answer.

### Cross-platform proof

The detection layer is `#[cfg(target_os = "linux")]`; left ungated it compiles
to dead code elsewhere, which `-D warnings` turns into a Windows/macOS build
failure. The module was clippy-checked under `-D warnings` against
`x86_64-pc-windows-msvc` and `aarch64-apple-darwin` as well as Linux. A full
Windows build cannot run on this host (`cc-rs` needs `lib.exe`), so
`desktop-tauri.yml` gained a `windows-latest` job running clippy and the Rust
tests — the Linux job cannot compile the `cfg(target_os = "windows")` branches
at all, so regressions there were previously invisible until a user hit one.

## Rollout readiness

Committed on branch `desktop-tauri-terminal-performance` (`c73f23a`): 419
files, the whole `desktop-tauri/` app plus `desktop-tauri.yml` and
`desktop-release.yml`, which had never been in version control. `release/`
artifacts and the toolchain tarball are gitignored, so the commit is ~5.5 MB
of source. No secrets, machine paths, or build output in the tree.

### Done

- The app, its CI, and its release workflow are in git, so every developer
  and every CI run gets these fixes. Both workflows previously would have
  checked out an empty directory.
- Version bumped to **0.1.3**. The staged `release/Vibyra_0.1.2_amd64.AppImage`
  is the *pre-fix* build (sha `f7bfe1f6…`); the fixed 0.1.2 bundle is the one
  at `~/Vibyra.AppImage` (sha `6cc8f9e0…`). Two different binaries shared
  `0.1.2`, which is what the bump ends. Delete or replace the stale staged
  artifact before any release.
- CI now verifies Windows as well as Linux.
- A 0.1.3 AppImage is staged at `desktop-tauri/release/` (sha
  `f8706b64…`, 157,153,784 bytes) with its checksum. Smoke-tested headless:
  it loads its bundled WebKit/GTK payload (431 MB AppDir) and fails at GTK
  backend init with no display, which is the correct failure — a bundling
  problem would fail earlier, at shared-library loading. It was built from
  working-tree state, not from `c73f23a`, because a parallel session was
  mid-refactor; rebuild from the commit before treating it as a release
  candidate.

### Deliberately not done

- **Nothing is served to users.** The website streams the Electron artifacts
  from the Laravel release disk (see [[Runbook]] and [[Backend/Website Accounts And Downloads]],
  [[Backend/Website Accounts And Downloads]]). The Tauri release workflow is
  `workflow_dispatch`-only and uploads CI evidence, not a public release.
  Publishing is a separate, deliberate decision.

### Remaining before a public rollout

- **macOS has no path at all.** The Tauri release matrix is Windows + Linux
  only, and no macOS runner has ever built this crate. The Electron app ships
  signed/notarized DMGs; the Tauri app would need the equivalent gate before
  Mac users could be moved over.
- **The first Windows CI run is unproven.** The new `windows-latest` job has
  never executed — the local cross-check covered `renderer.rs` only, because
  a full Windows build needs `lib.exe`, which this host does not have. Expect
  to fix whatever it surfaces on the first run.
- **The Windows and Linux installers are unsigned** for the Tauri app;
  `desktop-release.yml` does not require Authenticode the way the Electron
  release gate does.
- Decide whether the Tauri app replaces or ships alongside the Electron one,
  and wire whichever answer into the download surface.

## Environment notes

`~/.cargo/config.toml` on this machine redirects all cargo output to
`/mnt/nvme/home/ellis/Current-PC-Builds/cargo-target`, so
`desktop-tauri/src-tauri/target` is empty here and bundles land there instead.
That is a user-global setting, not repo config — CI and other developers use
the normal path, which `.gitignore` covers.

## 2026-08-24 — "typing one character behind", the fourth round

Three previous rounds (0.1.9, 0.1.10, 0.1.11) each shipped a plausible fix and
each left the symptom in place. This round measured first.

### What it actually is

The renderer cost is **per delivered IPC message**, not per byte and not the
transport: one `term.write()` parse plus a whole-viewport repaint, ~1.2 ms of
WebKit main thread each. `flusher.rs` delivered one message *per session* per
16 ms tick, so the cost scales with pane count, not with output volume.

Measured on this box with 7 live panes, all `Visibility::Visible`:

| | |
|---|---|
| delivery rate | 434 msg/s (measured in-crate) |
| WebKitWebProcess main thread | **54.4%** (measured per-thread via `/proc`) |

The main thread never has a free frame, so the focused pane's own echo queues
behind the other six panes' writes and repaints and paints a frame or more
late. The *next* keypress is what finally lets the earlier frame land, which is
exactly what "one character behind" looks like from the keyboard.

### Why the 0.1.11 fix had not landed

The `Visibility::Background` pacing work was written 13:01–13:11. The AppImage
being run was built at **12:39**. The running app never contained it. Check
`~/Vibyra.AppImage`'s mtime against the source mtimes before believing any
perf report — see [[desktop-build-install-gap]].

### Two further causes, both in `flusher.rs`, both independent of the above

1. **Cross-pane echo coupling.** The loop slept a full `tick` after *any*
   session delivered, and `Visible` had no per-session pacing of its own — it
   relied on that global sleep. So a background agent streaming tokens owned
   the single delivery slot and the focused pane's echo waited it out.
   Reproduced in `flusher_latency_tests.rs`: **114 ms** of echo latency caused
   purely by another pane streaming, against **2.2 ms** after the fix.
   Pacing is now per session, and the loop waits exactly until the soonest
   session comes due instead of sleeping a fixed tick.
2. **Delivery order was `HashMap` order.** When one scan finds several sessions
   due, the renderer works through them in the order they were sent. Sent last,
   the focused pane's echo is parsed too late to make the frame that burst ends
   in. Sessions are now sorted by `delivery_priority`, focused first.

Note that per-session pacing also makes sessions self-stagger, so several
coming due in the same scan is rarer than it was — which is why cause 2 has a
pure unit test on the rule rather than a timing test. A timing test there
measures drift, not order, and passes with the sort removed.

### Do not

- Do not serialise PTY input in the frontend. See the 0.1.9 note above.
- Do not raise the base `tick` to compensate. It paces sustained output only;
  raising it adds echo latency to the pane being typed into.
- Do not add `ipc: http://ipc.localhost` to `connect-src` in `tauri.conf.json`.
  Keystroke ordering currently holds because the CSP blocks Tauri's `fetch`-based
  IPC and the runtime falls back to ordered `postMessage`. Tauri documents that
  CSP entry as a *performance* tip; it would silently destroy the ordering.

### Also fixed: the WebAudio leak

Confirmed live by per-thread sampling of WebKitWebProcess: `webaudioSrc:src`
2.4% + `webaudioSrcTask` 1.0% = **3.4% of a core, permanently, for an app that
had made no sound in an hour**. A running `AudioContext` keeps a GStreamer
`webkitwebaudiosrc` pulling ~344 quanta/s whether or not anything is playing,
and `primeAudio()` built one on the first click and never suspended it.

`notificationSounds.ts` now suspends the context 3 s after the last cue and
resumes it on the next one. The risk is that WebKitGTK only honours `resume()`
inside a user gesture, which would leave the app mute — so the resume path is
self-healing: the first failed resume stops the idle-suspend for good and
re-arms the one-shot gesture listeners in `useNotificationRuntime`. Worst case
is one missed cue, never the feature.

### How to measure this again

- Per-thread CPU: sample `/proc/<WebKitWebProcess pid>/task/*/stat` fields 14/15
  twice and difference them. Take **two** samples — the JSC collector thread
  spikes and settles.
- Delivery rate: a `CountingSink` over `PtyManager` counts messages, which is
  the thing that matters. Counting bytes measures nothing.
- The curve on this box: 713 msg/s → 94%, 571 → 69%, 434 → 54%, 387 → 23%,
  145 → 10%, idle → 4%.

### Still open

- `terminalBus.ts:14–27` queues unboundedly for a session React has unmounted
  while Rust still considers it Visible/Background/Hidden. A pane left in
  preview mode accumulates ~4 events/s forever, and the replay on return is one
  large hitch. Not the keystroke bug; not fixed here.
- `session.json` is ~2.25 MB and rewritten whole every 120 s.
- `rendererMode` is `"accelerated"` in settings.json, overriding Auto, which on
  this NVIDIA/X11 box would pick shared memory. `nvidia-smi` now shows the
  webview holding a real GPU context (52 MiB), unlike the 2026-08-24 morning
  reading of 0%, so this may no longer be the liability it was. The proprietary
  driver reports `-` for per-process `sm%` on graphics contexts, so `pmon`
  cannot settle it; the only way to tell is to flip the setting and compare.

## 2026-08-24 later — measured end-to-end, in the renderer, old vs new

The crate-level numbers above were not the whole story. A latency probe now
lives in the app itself (`src/probe/`, compiled in only when
`VITE_LATENCY_PROBE=1` is set at build time): it boots instead of the App with
no auth, spawns 6 panes running a full-viewport-repaint TUI simulator plus one
quiet `cat` pane, types marker keys into it, and timestamps every stage —
keystroke → IPC → PTY echo → flusher delivery → xterm parse → **next painted
frame** — reporting percentiles through the env-gated `probe_report` command.
Run it headless: `Xephyr :99`, `dbus-run-session`, `XDG_CONFIG_HOME` pointed at
a scratch dir (isolates settings/session from the real ones; `dirs::config_dir`
honours it), `SHELL=/bin/sh`, binary run from `/`. Interleave A/B runs — the
user's live app shares the cores and adds minutes-scale noise.

Final flusher design, chosen by measurement (3 interleaved rounds each):

- **Visible pane paced only by its own last delivery** — echo to webview is a
  deterministic ~1 ms p50 every round; the old flusher's global sleep made it
  jitter 2–10 ms p50 round to round, which on a busy renderer is the
  character-behind feel.
- **Background/Hidden tiers aligned to shared epoch boundaries** (a flusher
  `origin: Instant`, `epoch()` in flusher.rs) — per-session pacing lets
  sessions drift until deliveries spread evenly and the renderer pays one
  composite per message: measured **+14 CPU points for identical bytes**
  versus aligned bursts.
- Focused pane still sorted first within a scan (`delivery_priority`).

Numbers (debug build, DOM renderer, 6 streaming + 1 typed, 60 keys/round):

| | old flusher | shipped |
|---|---|---|
| echo p50 (3 rounds) | 2 / 10 / 5 ms | **1 / 1 / 1 ms** |
| paint p95 | 19 / 29 / 31 ms | **23 / 19 / 19 ms** |
| renderer CPU (utime+stime delta) | 43 / 45 / 51 % | **43 / 43 / 42 %** |

The user's actual pre-fix configuration (all panes Visible) measured paint
p50 21 / p95 63 / max 64 ms — three to four frames behind.

Traps found on the way, do not re-hit:
- **`ps -o pcpu` is a process-lifetime average**, not a window. Every CPU
  number it produced mid-investigation was noise. Use `utime+stime` deltas
  from `/proc/<pid>/stat` across the window (`getconf CLK_TCK` to scale).
- **`toggleZoom` un-zoom set every pane Visible** and, because it does not
  change `focusedId`, `useFocusVisibility` never re-demoted them — a
  persistent all-visible grid, the exact saturating configuration. Fixed:
  `zoomVisibilityTarget` in `projectTransitions.ts` (tested in
  `terminalVisibility.test.mjs`) restores focus-paced targets on release.
- A python string-replace that silently no-ops (source had been re-formatted)
  left the tree different from the design in my head; **clippy dead-code
  caught it**. After any scripted edit, grep for the expected change.
- `pgrep -f <binary name>` from the harness matches the harness's own shell.
  Match `readlink /proc/<pid>/exe` against the binary instead.

Not yet verified: the symptom's disappearance under the user's own fingers on
their real session — needs their app restarted onto a build carrying this
flusher. `~/Vibyra.AppImage` (14:20) has an intermediate flusher (per-session
pacing + priority, no epoch alignment); the final one is in the tree, built
and gate-clean but deliberately not installed.

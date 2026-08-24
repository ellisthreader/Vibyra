---
title: Tauri Terminal Performance Overhaul
date: 2026-08-20
updated: 2026-08-24
status: rollout-ready
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

> [!info] Committed and rollout-ready; not published
> `desktop-tauri/` and its workflows are now in version control, so CI and
> every developer get these fixes. Nothing is served to end users yet — the
> website still offers the Electron app on purpose. See
> [[#Rollout readiness]] for what is done and what remains.

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

### 2026-08-24 spacing, typing, and sustained-lag fix

The public 0.1.9 input queue fixed IPC byte ordering but left three independent
regressions. The dynamic xterm WebGL import was only prewarmed, so a terminal
that mounted before it resolved attempted one synchronous attach and stayed on
the DOM renderer. JetBrains Mono uses `font-display: swap`; an early
`document.fonts.load()` could resolve before WebKit registered the face, so
xterm opened and fitted with fallback metrics and never remeasured after the
font swap. Typing also still performed a bottom-anchor DOM scan on every input
event.

Every live and suspended xterm now waits for non-empty regular and bold font
matches before construction, awaits the cached renderer decision, attaches at
most one live WebGL addon, and uses xterm's `scrollOnUserInput` instead of the
keypress scan. OSC/DCS/CSI terminal replies are excluded from prompt/title
tracking. Project, Home, and Preview transitions share one queue, and AppImage
PTY launch strips current and stale `/tmp/.mount_*` components from inherited
loader/data paths. The performance guard also clears hidden-window samples so a
refocus cannot emit a warning based on throttled background timers.

A final four-pane native stress run found the remaining sustained-load cause:
four infinite `pulse-ring` opacity animations on tiny status indicators kept
WebKitGTK repainting and compositing the adjacent WebGL terminal grid. Those
animations and their unused keyframes are removed while static rings, colours,
and badges remain. An invariant now rejects infinite status animations near
the terminal surface.

The exact optimized source restored four panes with both JetBrains weights
ready before xterm open, WebGL on all four, and zero DOM rows. It preserved a
662-byte 1 ms typing burst and 4,498-byte paste byte-for-byte, delivered all
10,000 sustained-output markers, and retained WebGL after a Home/project
unmount-remount. The animation-on control averaged 94.67% renderer CPU and
31,247.5 renderer minor faults/s; the fixed settled run averaged 1.88% and
1.62 faults/s. Frontend tests (290), typecheck, production build, dead-code,
line-limit, diff-whitespace, strict Rust format/clippy, 254 Rust tests, and the
focused backend release tests all pass. Publish only the signed Ubuntu 22.04 CI
artifacts; the local host build is verification evidence, not a release asset.

For recurrence diagnosis, measure actual PTY ingress from the named
`vibyra-pty-*` threads under `/proc/<Vibyra PID>/task/*/io`; child-process
`wchar` includes files and network traffic and overstates terminal output.

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

# Vibyra Desktop Memory

Scope: Vibyra Desktop, the Tauri 2 + Rust + React + xterm.js application in
`desktop-tauri/`. Use this as the desktop index only.

Development launch: `npm --prefix desktop-tauri run app:dev`. On Linux, install
the GTK/WebKit build dependencies with `desktop-tauri/scripts/setup-linux.sh`
first.

## Mental Model

The desktop app is a native window that runs AI CLI agents in PTY-backed
terminal panes, grouped by project. Rust owns the PTYs, output batching,
project/file watching, previews, screenshots, settings, and account auth; the
React renderer owns terminal presentation, panels, and stores. There is no
local HTTP bridge and no phone pairing.

See [[Product Surfaces]] for how the desktop app differs from the public
website, Expo browser client, and native phone app.

## Start Files

- `desktop-tauri/src/App.tsx`: auth gate then workspace mount.
- `desktop-tauri/src-tauri/src/lib.rs`: Tauri setup, webview configuration, commands.
- `desktop-tauri/src-tauri/crates/vibyra-core/`: PTY, batching, agent catalog, fs watch, settings.
- `desktop-tauri/src/lib/terminalRegistry.ts`: xterm instances held outside React.
- `desktop-tauri/src/stores/`: zustand stores for projects, panes, models, accounts.

## Focused Notes

- App launch, terminal rail, source ownership, and checks:
  `Desktop/Rust Tauri Desktop.md`
- One-time personalized post-auth welcome, account scoping, motion, source
  ownership, and checks: `Desktop/Rust Tauri First Welcome.md`
- Account auth, keyring session storage, OAuth polling, token rotation:
  `Desktop/Tauri Account Authentication.md`
- Terminal lag and blank-pane overhaul, WebKit compositing policy, measured
  results, and distribution status:
  `Desktop/Tauri Terminal Performance Overhaul.md`
- **⚠ Permanent incident record + never-again rules** (read before changing
  graphics modes, renderer policy, or any notification that changes a
  setting): `Desktop/Incident - GPU Mode One Character Behind.md`
- Terminal panes, provider routing, launch settings, effort tables, and
  provider-account boundaries: `Desktop/AI Terminals.md`
- Provider OSC behavior, prompt-derived chat names, title precedence, and
  persistence: `Desktop/Terminal Chat Titles.md`
- Reading an agent's approval prompt into a notification, the fingerprint
  guard before any keystroke reaches a PTY, keyboard focus after update or
  approval UI, and why Vibyra keeps no auto-approve list of its own:
  `Desktop/Agent Prompt Notifications.md`
- Titlebar rebuild, the stage split that replaced the Terminals/Preview mode,
  and why `terminalsVisible()` is the native flush budget:
  `Desktop/Project Stage And Titlebar.md`
- Current floating right dock, its three titlebar size controls, and the
  active-size close rule: `Desktop/Project Dock.md`
- Review of the parallel-worktree fleet: current-state audit of the Review
  dock tool and safe-mode worktrees, the collision radar, the landing lane,
  and the phased build: `Desktop/Parallel Review And Worktree Fleet Plan.md`
- Agent Mode as built — the SQLite store, the structured runtime beside the
  PTY one, the two adapters and what was verified against the real CLIs, the
  path and approval boundaries, and the rules behind memory, skills, routines
  and handoffs: `Desktop/Agent Mode As Built.md`
- Project-tile right-click actions, project configuration, Git-backed daily
  activity, and the two-confirmation close rule:
  `Desktop/Project Menu And Activity.md`
- Real microphone level for the F8 HUD, the dBFS mapping that makes it
  readable, and why the renderer never opens a microphone:
  `Desktop/Dictation Level Meter.md`
- Ctrl K scopes, fuzzy ranking, answering an agent's prompt from the
  palette, and the `!` send-to-agent mode: `Desktop/Command Palette.md`
- Auth gate surface and Settings > Integrations: `Desktop/Desktop Shell.md`
- In-app reports, authenticated backend delivery, permission disclosure, and
  server-owned webhook boundary: `Desktop/In-App Reporting.md`
- Workspace Preview: `Desktop/Projects And Preview.md`
- Startup gating, release polling, the status/checkState split, update
  surfaces, and post-update changelog: `Desktop/Desktop Updates.md`
- System-wide F9 screenshot capture and annotation editor:
  `Desktop/Screenshot Capture.md`

## Local Skills

- Use `.agents/skills/VibyraOptimse/SKILL.md` for desktop permission and
  optimization audits and `.agents/skills/VibyraRefactor/SKILL.md` for
  structural cleanup; both require the canonical
  `node scripts/check-desktop-lines.mjs` gate before completion.
- Use `.agents/skills/vibyra-preview-diagnostics/SKILL.md` for Preview project
  detection, runtime startup, target/capability routing, proxy transport, and
  shutdown failures.

## Runtime Branding

The visible app name is `Vibyra`; the bundle identifier is
`app.vibyra.desktop`; and the native icon is the transparent cobalt V exported
from `src/assets/vibyra-cobalt.png` into `desktop-tauri/src/assets/`.

## Organization Rule

Desktop source follows the hard 200-line first-party standard; verify it with
`node scripts/check-desktop-lines.mjs`. Keep native logic in the
`vibyra-core` crate, which must build without GTK so it stays testable on any
machine (`npm --prefix desktop-tauri run core:test`).

## Token Hint

For desktop tasks, read this index plus exactly one focused desktop note, then
inspect only the files named there.

## Terminal Performance

Terminal performance depends on which WebKit compositing path the webview gets.
`configure_webkit_renderer` in `src-tauri/src/lib.rs` disables the DMA-BUF
renderer only when the NVIDIA proprietary driver is present
(`/sys/module/nvidia`), overridable with `VIBYRA_WEBKIT_DMABUF=1/0`. Under that
shared-memory path WebGL canvases load but never composite — xterm panes stay
black with a full buffer — so the frontend asks Rust via the
`software_compositing` command and only attaches `@xterm/addon-webgl` on the
accelerated path (`src/lib/xtermRenderer.ts`). Renderer strings cannot detect
this: WebKitGTK's ANGLE reports "Apple GPU" on Linux. Never probe GL context
strings for this decision, and never create throwaway WebGL contexts in a loop —
leaked contexts crash the web process.

Renderer detection lives in `src-tauri/src/renderer.rs` and
`renderer_probe.rs`, gated to Linux — leave it ungated and `-D warnings`
fails the Windows/macOS build on dead code. `Auto` disables DMA-BUF only when
the `boot_vga` GPU is NVIDIA (`0x10de`) or the session asks for PRIME offload,
so hybrid laptops on their iGPU keep the accelerated path; an unreadable
topology stays conservative. Users override it in Settings > General >
Graphics (`rendererMode`), and `src/lib/rendererPolicy.ts` mirrors the same
policy for the UI and the xterm renderer choice. Do not reintroduce the old
"`/sys/module/nvidia` exists" rule.

The terminal write path must stay free of forced layout: cell height is cached
on the registry entry (`terminalBottomAnchor.ts` state), the bottom-anchor row
scan is bounded to rows below the cursor, and transforms are only written when
the offset changes. `mountTerminal` fits before attaching the event bus so
replayed output never wraps at a stale width, and spawn passes estimated
rows/cols (`src/lib/spawnSize.ts`) so PTYs do not start at the 100x30 default.
The Rust flusher (`pty/flusher.rs`) flushes immediately on wake and then rests
one 16 ms tick — do not reintroduce a sleep before the first flush; it puts a
fixed floor under keystroke echo latency. Since 2026-09-01 it also holds a
pane's next chunk until the frontend reports the last one painted
(`terminals_painted`, one call per frame, bounded by `FlushConfig::paint_timeout`), and background
panes pace at 250 ms on the shared-memory compositing path
(`pty/flush_pacing.rs`). The workspace watcher registers one non-recursive
inotify watch per non-ignored directory (`fsx/watch_tree.rs`), never a
recursive one on the root.

Off-screen panes must map logical `hidden` to native `hibernated`, detach their
frontend output handler without disposing the registry xterm, and resync from
the native ring when revealed. Relaunch operations are single-flight and
replacement-first; stable pane persistence IDs plus serialized, merge-aware
saves preserve scrollback through resume and updater restarts. Use the desktop
terminal reliability checklist in `.agents/skills/VibyraOptimse/SKILL.md` and
the focused performance note for the complete validation pattern.

## Launch Contract

Quick-chip launches route through `src/lib/configuredLaunch.ts`, which must
mirror the backend launch matrices: reasoning effort only for claude/codex
(EFFORT_AGENTS), Full access only for claude/codex/gemini, and shell/ssh are
exempt from the Full-access veto — otherwise plain Terminal launches fail with
a settings-error toast while the rail holds effort/full-access defaults.

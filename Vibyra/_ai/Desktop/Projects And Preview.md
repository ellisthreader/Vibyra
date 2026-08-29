# Desktop - Projects And Preview

Read this for Vibyra Desktop (`desktop-tauri/`) project workspaces and the
in-app Preview surface.

## Rust/Tauri Workspace Preview (2026-08-11)

The new Rust desktop lives in `desktop-tauri/`. An open project now has a
keyboard-accessible `Terminals` / `Preview` mode bar in `ProjectWorkspace.tsx`.
Preview uses the full workspace while the terminal stage stays mounted and its
native PTY visibility is throttled. The renderer keeps the chosen target per
project and a bounded 80-entry viewport store per project + target. Its device
catalog uses calibrated CSS viewports across phones, foldables, tablets,
laptops, desktop displays, TVs, signage, and custom dimensions; DPR is shown as
a reference because the iframe does not emulate physical device DPR.

`vibyra-core/src/preview/` owns read-only bounded target detection, exact launch
disclosure, localhost-only static/dev services, readiness/log state, streamed
static assets with byte ranges, and tracked process-group cleanup. Inspection
never starts a process. Only `preview_start` may execute after the visible Run
action, and it re-detects the target first. Start/stop transitions are
serialized so target or project switches cannot orphan a late child; Stop and
manager drop terminate only tracked groups. Tauri permits only localhost frames
through CSP. Validate with `npm --prefix desktop-tauri run build`,
`npm --prefix desktop-tauri run core:test`, and a full Tauri Cargo check using
the repo's Linux dev shim when system GTK pkg-config metadata is unavailable.

Rust Preview services are keyed by a normalized absolute lexical project root
plus target, so multiple targets can stay live and a deleted project directory
can still be stopped. The renderer keeps target-scoped status and request
generations, serializes status polls, and does not stop a running service merely
because another target is selected; failed or timed-out services must clear
their URL. Multi-process recipes reserve every port before spawning and hold
each listener until its corresponding child starts. Manifest reads are capped
at 1 MiB, child output is consumed in fixed chunks with bounded logical lines,
and package scripts must directly invoke the detected browser framework or pass
the bounded local-wrapper checks below rather than merely declaring a dependency;
shell backgrounding with `&` is rejected.

The localhost static service caps active connections, request headers, and
read/write time, while still accepting fragmented headers and serving byte
ranges. Tauri Preview commands run blocking filesystem, process, and readiness
work off the invoke thread. Common nested roots include `app`, `mobile`,
`apps/mobile`, `packages/app`, and `packages/mobile`. The renderer catalog has
47 calibrated presets, and live checks cover its laptop centering and the
960x600 workspace layout without approving a project command.

Browser-capable mobile targets are resolved in `package_command.rs`,
`package_script.rs`, and `package_runtime.rs`. Expo Go or development-build
scripts become an Expo web Preview by receiving `--web` and the reserved port;
Ionic, Capacitor-backed Vite, and React Native Web/webpack targets receive phone
viewport hints. A local Node wrapper is accepted only when it is bounded to 128
KiB, canonicalizes inside the selected project, forwards runtime arguments, and
contains a recognized child framework launch. Safe package aliases resolve to a
maximum depth of four. Native-only React Native remains unavailable because the
Tauri phone frame embeds a browser, not a native device runtime.
Wrapper validation must exercise `PreviewManager` through HTTP readiness and
Stop cleanup while preserving any separately running native Expo server; target
detection alone does not prove the launch path.

## Fidelity Boundary (2026-08-23)

The current device frame is a scaled desktop-WebKit iframe at a chosen CSS
width and height. `previewDevices.ts` stores DPR only as displayed reference
metadata; Preview does not override DPR, user agent, touch/pointer behavior,
mobile browser chrome, safe-area environment values, or the underlying runtime.
The decorative camera/island overlays the iframe without supplying native safe
area insets. Treat this surface as responsive layout Preview, including for
Expo web, and do not claim simulator or physical-device fidelity from it.

## Project Switching Cost (2026-08-29)

Switching projects on the left strip was taking tens of seconds on a freshly
launched app with *nothing running*. The cause was not the restore system, the
watcher, or the preview — it was the pane grid.

`TerminalStage` renders only panes whose `projectId` matches `activeId`, so a
switch unmounts one project's panes and mounts the other's. Live panes survive
that cheaply because `terminalRegistry` keeps the xterm outside React and
`unmountTerminal` only detaches the DOM node. **Suspended panes had no such
cache**: `SuspendedPaneView` built a fresh `Terminal`, wrote the entire saved
snapshot, and `dispose()`d it on unmount — every switch, both directions. Real
measurement on this machine: four restored panes across two projects carrying
243–259 KB each, so one full switch cycle re-parsed ~1.28 M characters of agent
output to display the last screenful.

The fix is the seam between **what is drawn** and **what is carried**.
`src/lib/suspendedPreview.ts` (`previewSlice`) bounds the *drawing* to a 64 KB
tail — measured 75% less parsed per switch cycle. `pane.snapshot` itself is
never trimmed: it is what `relaunchContinuity` hands `queueReplay` above a
resumed process and what `toPersistedPanes` writes back on quit, so trimming it
*there* would erode scrollback a little on every restart. Trim at the render
boundary only. `sessionRestore.ts`, `terminalReplay.ts`, `sessionPersistence.ts`
and `terminalStore.ts` were not touched, and must not be, to fix this class of
problem.

Two findings worth keeping:

- **Claude and Codex render inline, not full-screen.** Across five real saved
  panes: zero `ESC[2J`, zero `ESC[?1049h` alt-screen, but hundreds of `ESC[K`
  line clears and thousands of `ESC[H`. Keying a frame boundary on a screen
  clear is a branch that never runs on real output — snap to a row break
  (`\r\n`, `\n`, or a bare `\r`; the bare CR is what a status redraw leaves).
- **`activateNow` awaited an IPC round trip before flipping the view**, so the
  tile could not answer the click until Rust replied — on a webview main thread
  that idles at ~50% with panes open. The view flip now precedes every await;
  previews, visibility, watcher and persist are bookkeeping the user never
  waits on.

Still open, in impact order: suspended terminals are rebuilt on *first* visit
(cache them by `persistenceId`, never by `id` — suspended ids are negative and
positional, `placeholderId(index)`); `projectRuntimeTransitions` is strict FIFO
so a second click queues behind the first instead of superseding it;
`watch_workspace` is the one disk-touching command that skips
`run_blocking_core` and inotify-watches all 9.4 k dirs of this repo to then
discard events from ~7.8 k of them (`IGNORED_DIRS` filters events, not
registration — measured 323 ms Vibyra / 557 ms HKE, warm); and `terminalBus`
replays up to 2 M queued chars synchronously on attach.

## Memory Panel Retired, Vault Kept (2026-08-29)

The dock's Memory tool is gone. What it displayed lost to Obsidian itself,
sitting one window away and better at reading notes; what it was *for* — the
vault — survives as an app-level integration.

The evidence for retiring it: `memory-sources.json` held `{"vaults": {}}` (no
vault ever connected), neither `memory.md` nor `memory-<project>.md` existed on
disk, and its only consumer was the dock Chat panel at `chatCalls: 0`. Memory
never reached a launched agent at all — the whole terminal launch path had no
reference to it. Vibyra's one mention of `AGENTS.md`, the file its agents *do*
read, is `pty/chat_prompt.rs` filtering it *out* of chat-title detection.

What changed:

- **One vault for the whole app.** `store.rs` held `HashMap<project, PathBuf>`,
  so the same vault had to be reconnected per project. It is a single
  `Option<PathBuf>` now, connected from Settings → Integrations. The legacy
  `vaults` map is still deserialized (`skip_serializing`) and its first entry
  adopted, so an existing connection survives; `disconnect` writes a default
  store precisely so that legacy entry cannot resurrect the connection.
- **Deleted**: `MemoryPanel`, `MemoryNavigator`, `MemoryMarkdown`,
  `MemoryToolbar`, `MemorySourceBar`, `MemoryEmptyState`, `memoryDocument.ts`,
  `memoryTree.ts`, `memoryImport.ts`, `memoryStore.ts`, `memoryVaultStore.ts`,
  five `companion-memory*` sheets, `commands/ai_memory.rs` (the whole MEMORY.md
  concept), `commands/memory_browser.rs`, `memory/browser.rs`, and
  `read_imported_notes`. Net across the branch: **231 insertions, 2,327
  deletions**.
- **Kept and repointed**: `memory/search.rs` — the ranked, budgeted, local note
  retrieval — plus discovery and the connection store. `lib/vaultContext.ts`
  formats what it returns.

Two things worth not relearning:

- **Retiring a dock tool is free.** `restoreDockTool` already falls back to
  `chat` for any value not in `TOOLS`, so a dock left on `memory` just reopens
  on chat. No migration code; the test now pins that fallback.
- **Match the settings sheet's own tokens.** The card was first written against
  `--surface-2`, `--text-1`, `--r-md`, `--fs-caption` — none of which exist.
  `settings-integrations.css` uses `--line-soft`, `--muted`, `--dim`, `--text`,
  `--hover`, `--r-control`, `--fs-hint`, `--fw-bold`. Read the neighbour sheet
  before writing a new one.

Still the open thread, and the reason the engine was kept: retrieval reaches
only the Chat panel. The valuable version points it at the terminal agents — a
"Brief the agent" action that seeds a pane's first prompt with the matched
notes, so the pane can say *"3 notes from your vault"* rather than the user
going to read them. Setup in Settings, evidence in the workspace.

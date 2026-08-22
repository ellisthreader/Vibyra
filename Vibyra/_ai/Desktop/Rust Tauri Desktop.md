# Desktop - Rust Tauri Desktop

Read this for the new native desktop application in `desktop-tauri/`. The
repo-root `Vibyra Desktop` launcher still opens the legacy Electron app.

## Launch And Validation

- Development: `npm --prefix desktop-tauri run app:dev`
- TypeScript: `npm --prefix desktop-tauri run typecheck`
- Production frontend: `npm --prefix desktop-tauri run build`
- Rust core: `npm --prefix desktop-tauri run core:test`
- Complete local gate: `npm --prefix desktop-tauri run verify`
- Rust dependency scan: `npm --prefix desktop-tauri run rust:audit`
- Both desktop generations' 200-line gate: `npm run desktop:lines`

## Empty Terminal Launcher

The active project's empty left rail omits the `Terminals` heading and empty
copy. Its flat visible path is `New terminal`, model selector, compact exact
`1–12` terminal count, the selected model's verified effort slider, Advanced
options, then one launch action. Advanced stays flat on the rail with hairline
row separators and no enclosing card/background: Safe mode first, Access with
a short selected-consequence line, then token source with a quiet selected
check. Do not split these into separate cards or surface internal CLI flags.
The footer shows Settings only; do not restore the Idle/project status card.
Once a session exists, the launcher is replaced by the Terminals list and its
quiet `+` model-picker action.

Effort is persisted per project in `launchSettingsStore.ts`. The control is
shown only when the catalog reports reasoning support and the selected runner
has a verified mapping. `configuredLaunch.ts` passes it to Codex as
`model_reasoning_effort` and Claude as `--effort`; unsupported runners omit the
control and receive no fabricated launch flag. `openRouterCatalog.ts` owns the
capability field, while ranking stays in `openRouterCatalogRanking.ts` so both
files remain within the source-line limit.

Presentation changes must preserve terminal spawning, provider routing,
permission enforcement, token selection, persisted per-project settings, and
the Git preflight/checkpoint approval path. Safe mode remains opt-in because
non-Git projects must still be able to launch.

Start in:

- `desktop-tauri/src/components/layout/Rail.tsx`
- `desktop-tauri/src/components/rail/LaunchSettings.tsx`
- `desktop-tauri/src/components/rail/LaunchModelPicker.tsx`
- `desktop-tauri/src/components/rail/LaunchAdvancedOptions.tsx`
- `desktop-tauri/src/state/launchSettingsStore.ts`
- `desktop-tauri/src/lib/configuredLaunch.ts`
- `desktop-tauri/src/lib/openRouterCatalog.ts`
- `desktop-tauri/src/lib/openRouterCatalogRanking.ts`
- `desktop-tauri/src/styles/launch-settings.css`
- `desktop-tauri/src/styles/launch-model-picker.css`

All touched first-party source stays at or below 200 lines. Keep approval-modal
styles separately owned by `launch-approval.css`.

## Project Companion

The native right workspace is a connected `Chat / Memory / Files` companion,
not three dashboard cards. Its selected tool and `300–520px` width persist
locally, with `360px` as the missing-preference default. The accessible left
separator supports pointer drag, arrow keys, Home/End, and double-click reset;
below `1100px` the surface overlays from the right to preserve terminal space.

`components/companion/` owns the shell, Chat, Memory, and resize behavior.
`components/rail/FileTree*.tsx` plus `lib/fileTreePolicy.ts` own the Files tool;
generated folders stay hidden by default and can be revealed from its options.
`lib/companionPreferences.ts` and `workspaceStore.ts` own persistence. Focused
late-loaded `styles/companion-*.css` files own the visual overrides, and
`tests/companionUi.test.mjs` covers preference and file-policy behavior.

Project Memory supports one read-only Obsidian vault connection per project and
explicit `.md`, `.markdown`, or `.txt` imports into editable `MEMORY.md`.
`src-tauri/src/commands/memory.rs` owns native dialogs/source state, while
`memory_browser.rs` owns the bounded path index and on-demand read-only note IPC;
`vibyra-core/src/memory/` owns discovery, bounded reading/search, and the
native-only `memory-sources.json` path store. The renderer receives sanitized
vault summaries and normalized relative-path snippets only—never arbitrary
absolute source paths. Discovery checks Obsidian's registry first, then a
shallow bounded fallback. Chat retrieves at most four locally ranked snippets;
imports copy bounded text, disconnect only forgets metadata, and no operation
writes into the connected vault. Renderer ownership is `ipc/memory.ts`,
`memoryStore.ts`, `memoryVaultStore.ts`, `memoryImport.ts`, and the focused
Memory companion files. The populated UI is a compact navigator plus safe
rendered Markdown: local `MEMORY.md` has explicit Read/Edit modes, vault folders
stay collapsed until opened, client search is deferred and capped, note bodies
load only on selection, and `[[wiki links]]` resolve through the cached path
index without rescanning the vault.

## System-Wide Speech And Screenshot Tools

The Rust/Tauri app persists `voiceShortcut` and `screenshotShortcut` in native
`Settings`, defaulting to F8 and F9. `src/lib/useGlobalShortcuts.ts` owns Tauri
global-shortcut registration and live rebinding; its document listener is only
a focused fallback when native registration fails. Registration must first
unregister every configured value, not only module-local remembered values, so
F8/F9 are reclaimed after a renderer reload instead of remaining stale in the
native plugin. A native-plugin setup change still needs a full `app:dev`
relaunch.

F8 toggles `voiceStore` and captures the selected terminal at record start so
the Whisper transcript returns to the intended PTY. F9 makes the Tauri X11
window transparent long enough to capture the monitor under the pointer, then
restores opacity and temporarily presents an always-on-top full-screen editor.
Do not return to native hide/show or focus-only capture: that produced shell
flashes, changed geometry, notification noise, and editors hidden behind other
full-screen apps. `finish_screenshot_edit` must release forced full-screen and
always-on-top state on Close, Escape, Save, cancellation, errors, stale capture,
and editor cleanup.

The renderer shows a real preparing surface, then Crop / Rectangle / Draw with
1/2/3 shortcuts. A crop selection remains visible, movable, and corner-resizable
across tool changes and Undo/Redo. Copy/Save export the current selection without
mutating the document; `Crop to selection` is the explicit destructive crop.
There is no generic Apply action. Rectangle/Draw/Crop use bounded operation
history rather than full-resolution PNG snapshots, while Reset always returns
to the original capture. Copy/Save enter a single-flight busy state before
encoding and report feedback beside the actions.

Capture never writes a file. Explicit Save writes beneath the configured
screenshot directory and adds a current-session tray item. Copy uses a retained
native `arboard::Clipboard` owner on Linux; dropping a temporary handle reports
success but leaves no pasteable `image/png` target.

Start in `src/lib/useGlobalShortcuts.ts`, `src/state/voiceStore.ts`,
`src/state/screenshotStore.ts`, `src/components/settings/SettingsShortcutsPane.tsx`,
`src/components/layout/ScreenshotEditor.tsx`, `ScreenshotCanvas.tsx`,
`useScreenshotPointer.ts`, `src/lib/screenshotOperations.ts`, and
`src-tauri/src/commands/screenshot.rs` / `screenshot_capture.rs`. Validate the
default and one changed binding from another application, renderer-reload
recovery, move/resize, annotations, Undo/Redo, explicit Crop, Copy and Save
selection dimensions, `image/png` clipboard exposure, repeated F9 suppression,
and exact window restoration. Return persisted defaults to F8/F9 before handoff.

## 2026-08-14 Audit Implementation

The whole-desktop audit is implemented across the Rust/Tauri app and the legacy
Electron bridge. `npm run desktop:lines` now scans `desktop/` and
`desktop-tauri/`, includes Rust, and prunes generated dependency/build trees.
Only exact generated provider-logo data and the vendored xterm stylesheet are
excluded. `desktop-tauri/scripts/split-css.mjs` is the deterministic stylesheet
sharder; preserve `main.tsx` import order. `.github/workflows/desktop-tauri.yml`
runs the line gate, Knip, frontend tests/build, rustfmt, Clippy with warnings
denied, all Rust tests, and RustSec on the pinned Node/Rust toolchains.

Native settings never return the OpenAI secret to the renderer. `secret_store.rs`
owns platform credential storage, `AppState` owns the native-only cached value,
and `SettingsView` exposes only configured/available booleans. Legacy plaintext
is read only for migration, settings JSON is owner-only and atomically replaced,
and the UI uses the explicit `save_openai_api_key` command rather than saving on
each keypress. Keep future secrets out of renderer state and general settings.

Terminal creation accepts structured model, permission, effort, dimensions,
and workspace fields only. `commands/terminal_launch.rs` builds known native
flags and validates models, full-access support, SSH target, dimensions, and a
canonical directory; never restore renderer-provided argv or SSH options.
Adversarial native tests lock this boundary.

PTY flushing is output-driven through a bounded wake channel; hidden replay
scans use a long timeout instead of an 8 ms global tick. Preview detection and
process launch run outside the global service mutex, per-target locks serialize
duplicate operations, and project generations prevent stopped in-flight starts
from resurrecting. Terminal/chat components use focused Zustand selectors.
Secondary overlays and Home/Settings are lazy chunks; the measured main bundle
fell from about 982 kB to 933 kB (270 kB to 257 kB gzip), though xterm and the
primary workspace keep it above Vite's 500 kB warning.

Screenshot capture uses binary native IPC. Renderer/native validation rejects
captures over 50 million pixels; imported PNGs are pre-bounded to 32 MiB base64
payloads, 16,384 per dimension, 50 million pixels, and 256 MiB decoder
allocation before clipboard or disk work. Keep `toBlob` asynchronous and retain
these limits when adding formats.

Linux Tauri 2.11 still brings GTK3/glib 0.18.5. `.cargo/audit.toml` temporarily
accepts `RUSTSEC-2024-0429` because Vibyra does not call the affected
`VariantStrIter` API; remove the exception when Tauri supports glib >=0.20 and
review it by 2026-11-14. Other GTK3/unic findings are informational unmaintained
warnings. Do not turn the exception into a blanket audit bypass.

Legacy desktop route ownership now places workspace/project endpoints in
`desktopRoutesWorkspace.mjs`; terminal runtime compatibility lives in
`aiTerminalPersistentCompatibility.mjs`. `aiTerminalSourceContracts.mjs` must
read the latter directly so staged bridge mismatches remain detectable. The
large legacy AI test run is capped at eight test files concurrently to avoid
detached-process cleanup races on high-core hosts.

## 2026-08-20 Native Concurrency Pass

Tauri command threading is a correctness rule, not a preference. A command
declared `fn` runs inline on the IPC dispatch thread — the UI thread on every
platform — so any blocking body freezes the window; `async fn` runs on the
runtime, where a blocking body instead starves a runtime worker. Both cases go
through the shared helpers in `commands/mod.rs`: `run_blocking` for
`Result<T, String>` commands and `run_blocking_core` for `CoreResult<T>`.
Do not add a command that touches disk, spawns a process, or waits on one
without routing it through those. `CoreError::Task` reports a failed join.

The `provider_accounts` commands were the worst case: five `fn` commands whose
bodies wait on provider CLIs with a 5 s per-probe timeout, so opening the AI
accounts pane froze the window for the slowest probe and disconnecting froze it
for a logout plus a re-probe. `AppState.provider_auth` is now
`Arc<ProviderAuthManager>` so it can cross into a blocking closure.
`create_terminal` moves its whole preparation — PATH scan, canonicalize,
safe-mode `git` chain, PTY spawn — into `commands/terminal_prepare.rs` and runs
it off-runtime; `sink.attach` stays on the async side because `Route::Buffered`
already covers the flusher-wins-the-race case.

`vibyra_core::parallel::map_parallel` is the sanctioned fan-out primitive:
scoped threads, order-preserving, capped at 8, inline when there is nothing to
gain. It is deliberately not rayon — the parallel work is a few user-initiated
I/O fan-outs where a work-stealing pool earns nothing, and the crate's
`cargo audit` surface stays unchanged. Two determinism constraints depend on
that ordering and must survive future edits: `workspace_preflight::fingerprint`
combines per-file digests in `git ls-files` order, so a working tree always
produces the same fingerprint, and `memory::search` spends its 8 MiB byte
budget in a sequential `within_budget` pass before fanning out, so which notes
a search covers cannot vary with thread scheduling. Safe-mode fingerprints are
transient — re-fetched before every launch, never persisted — so the digest
scheme can change freely.

Terminal output hot path: `ChannelSink` holds one lock per session rather than
one map-wide lock, and the outer lock is never held across a channel send.
`ByteRing::to_utf8` decodes scrollback in a single allocation; the old
`from_utf8_lossy(&contents()).into_owned()` copied a 4 MiB ring twice while the
session lock was held, stalling that session's PTY reader. Keep heavy decoding
out from under the session mutex.

Writes deliberately stay on the runtime thread. `write_terminal` must not be
moved to bare `spawn_blocking`: tasks have no ordering guarantee between them,
so two keystrokes can reach `write_input` out of order and produce exactly the
dropped/reordered input reported on Windows. Moving writes off-thread requires
per-session serialization (a writer thread fed by a channel), which also turns
`write_input`'s synchronous `SessionExited` into a fire-and-forget send. Not
currently justified; the only real motivation is a large paste blocking on a
full PTY buffer, which is unmeasured.

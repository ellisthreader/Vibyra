# Mac Experience And Sessions

The Mac 0.1.8 frontend uses `origin/release/0.6.3` (`216150c`) as a visual
reference: central command bar, graphite/cobalt surfaces and floating tool
panel. This is an adaptation of the current Mac codebase, not a port of 0.6.3's
Agent Mode, Review or other newer features. `main` alone is not the newest
Linux desktop; check remote release branches before comparing versions.

## Interface ownership

`TitleBar`, `CommandBar`, `ProjectStrip` and `HomeView` own the single named
sidebar, recent saved chats and compact project rows. `ProjectWorkspace`
contains the companion; `DockSizeControl` offers compact/wide/full, with the
active button closing it. Selecting a terminal leaves the full panel and
focuses its live view or recovery button. Panel visibility/size are preferences.
The floating panel resizes without changing terminal reserve until release.
`gridLayout.ts` keeps columns at least 360 CSS pixels where possible; both
`TerminalStage` and spawn-size prediction use this rule. Pane header/grid
metrics are checked against CSS in `desktopInvariants.test.mjs`.

`tokens.css` remains the only theme palette. `interface-layout.css` and
`project-tools.css` supply shared finishing styles. Auth uses static, themed
CSS decoration instead of decoding a background video. Saved terminal output
is selectable and follows font/theme changes, including Auto system changes.
`terminalFont.ts` respects custom fonts and maps the default to the bundled
JetBrains Mono family. `platform.ts` owns Command labels and paste routing;
plain Control shortcuts remain available to terminal programs.

## Mac lifecycle and recovery

`tauri.macos.conf.json` enables native overlay traffic lights at the standard
top-left position; Mac `WindowControls`/`ResizeHandles` return null so custom
top-right controls do not duplicate them. The title bar reserves their space.
Red close hides
the window and retains processes; Dock reopen reveals that same webview.
Quit is guarded by `close_guard.rs`: acknowledge before asking, save before
confirming, show a recoverable save error, and only discard saving when the
user explicitly chooses Quit without saving. The existing watchdog handles
an unresponsive renderer. Native PTYs shut down on app Exit.

Claude fresh chats get their own UUID. Codex IDs on Mac come from the
manager-owned process's open rollout file, using bounded `ps`/`lsof` discovery
in `session_identity.rs` and `session_process_files.rs`. Account roots and paths
are canonicalized. Same-depth ambiguity yields no ID; subagent files must not
replace the main chat. No prompt text or credentials are read for discovery.

`terminalRelaunch.ts` is replacement-first and single-flight. An exact chat
cannot open in two panes, including pending launches. Missing provider history,
removed accounts, absent CLIs, unavailable worktrees and failed spawns leave
the saved pane/output intact with an actionable error. New chat deliberately
gets a new UUID. Resume carries account, source folder and actual worktree
(`resumeCwd`); safe-worktree resume validates the existing directory instead
of cloning again. Shell/SSH reopen processes, not shell execution state.

Exact resume arguments: Claude/Gemini `--resume UUID`, Codex `resume UUID`.
Legacy Claude/Codex panes use the provider picker, never latest/continue flags.
Gemini panes without a captured ID open Gemini and explain `/resume`; automatic
Gemini ID capture is not implemented. Session saves are serialized, identity
is refreshed before saving, output checkpoints run every 30 seconds and on
blur, and persistence starts only after restore. Exit events update pane state
even while the renderer is paused or not yet mounted.

## Native tools and validation

Mac capture now routes to `screenshot_capture_macos.rs`: CoreGraphics consent
is checked only on the screenshot action, and `/usr/sbin/screencapture` captures
the main display into a private temporary folder, with timeout/cleanup. The
optional hide setting restores Vibyra on failure and opens the editor after
success. Real Screen Recording permission/capture still requires installed-app
verification; compile success is not permission or runtime evidence.
Apple's permission reference: https://support.apple.com/guide/mac-help/mchld6aa7d23/mac

Mac F8 dictation uses `voice_capture_macos.rs` (CPAL/CoreAudio), not `arecord`.
Capture starts only on the dictation action, after key/budget checks. A worker
owns the stream, stops on discard/drop or the 120-second native deadline, and
mixes device channels into bounded mono PCM using the actual device sample
rate. Tests cover sample formats, stereo mixing, capacity and worker cleanup;
they do not open a microphone or call the transcription service. `Info.plist`
declares why audio is recorded and sent to OpenAI; `Entitlements.plist` grants
audio input for hardened builds. The local installer retains this entitlement
when signing. Microphone consent and real transcription still need an
installed-app check. Linux retains the existing ALSA recorder.

Regression tests cover real two-process Mac rollout discovery, exact/legacy CLI
arguments, safe-worktree reuse and escape rejection, failed/double resumes,
account continuity, keyboard routing, adaptive geometry and detached exits.
Use the full desktop verify gate and native Mac bundle signing check. Browser
visual review uses the real components with mock IPC; it proves layout and
interactions, not live provider authentication or OS window lifecycle.

The Finder installer is `desktop-tauri/scripts/install-macos.command`. It
installs the already-built bundle and opens the installed app, refusing to
replace any running Vibyra. If this agent is inside a Vibyra PTY, installation
and installed-app launch checks must wait until the user quits. Keep the old
bundle backup. See [[Mac Setup]] and the local `plan` skill.

## Validation checkpoint — September 9, 2026

The full `npm --prefix desktop-tauri run verify` completed with exit 0:
238 frontend tests, 246 native tests (80 core, 164 desktop, 2 signature),
TypeScript/build, dead-code, Rust formatting and strict all-target Clippy.
The canonical first-party 200-line gate is clean; the generated provider-logo
asset remains the existing exclusion. Dark/light and narrower layouts were
reviewed in Safari with real components and representative mock IPC data,
including sign-in, Home, terminal recovery errors, model picker, tool sizes,
Chat/Memory/Files, Preview empty state, and Settings. The temporary harness
was removed. Native window lifecycle, provider login, microphone dictation and
Mac screen capture still need checks in the newly installed app after this
hosted session exits.

The final Apple Silicon 0.1.8 `.app` bundled successfully and passed
`codesign --verify --deep --strict` after local ad-hoc signing. Its packaged
microphone purpose string and audio-input entitlement were checked. The
installer's running-app refusal was exercised successfully; `/Applications`
still contains the running 0.1.7, so installation remains pending. Local
ad-hoc validation is not Developer ID notarization evidence.

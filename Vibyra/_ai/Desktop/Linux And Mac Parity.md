# Linux and Mac desktop parity

The installed macOS Vibyra 0.7.8 build 8 is the visual reference for the shared Tauri frontend. Its executable SHA-256 is `711e17a5612987fdac9dc3ec1fc8d0ab523e404094731246452346dbb0a90f9d`. The same-version `release/macos-0.7.8` branch does not contain the same frontend. Compare a release by binary hash and its embedded asset manifest, not by version or the current checkout.

The Mac and Linux release workflows consume one frontend asset archive, produced by `.github/workflows/desktop-frontend.yml` and verified by `desktop-tauri/scripts/frontend-artifact.mjs`. Platform-specific code belongs in `src/lib/platform.ts`, `src/components/layout/WindowControls.tsx`, native `src-tauri/` modules, and packaging. Keep shared product components and CSS identical where possible. The installed Mac comparison can be mounted by `desktop-tauri/scripts/serve-desktop-parity.mjs` using `VIBYRA_MAC_REFERENCE_DIST`; its IPC data is disposable. Use `docs/desktop-linux-parity.md` for the evidence and acceptance checks.

The recovered installed Mac stylesheet has 3,151 rules; all are preserved in the Linux candidate. The original 0.8 comparison had 13 Linux-only Mac-style window-control rules, removed by the native-title-bar fix below. Preserve the Mac system-font override and its original conversation text fallback when adding Linux fonts. Sign-in, Agents, and four-pane workspace layouts can be compared side by side through the parity review server.

Linux window controls belong to the GTK/window manager. `src-tauri/tauri.linux.conf.json` overrides the whole `app.windows` array to enable native decorations while preserving every base window field; Tauri replaces arrays rather than merging entries. `WindowChrome.tsx` renders webview controls and resize handles only on Windows, while macOS retains its overlay traffic lights. Do not recreate the old Linux red/yellow/green webview controls or reserve Mac control padding on Linux. The AppImage smoke test checks the running window's `is_decorated` IPC state and that no synthetic controls remain in the webview.

Linux's `/proc` rollout identity, ALSA capture, `espeak-ng` speech, Wayland screenshot portal, AppImage environment cleanup, and desktop entry are native accommodations. On Wayland the focused window handles F8/F9/F10 if X11 global registration cannot operate; truly compositor-global keys require the portal. Validate the actual Linux AppImage through the Ubuntu WebKitWebDriver smoke job before calling runtime parity complete.

Linux 0.8.0 shipped from tag `v0.8.0` at `ee9a178a94fc8fc51ae62237d20df80dc658ff20`. `.github/workflows/desktop-release.yml` builds signed x86_64 AppImage and Debian packages from the same frontend archive, then smoke-tests the AppImage. Verify each package's `.sig` against `tauri.conf.json` with `scripts/minisign-verify.mjs`, compare SHA-256 and size locally and on the Railway release volume, and only then set the Linux and Linux Debian `VIBYRA_*_RELEASE_*` variables with `--skip-deploys` and redeploy the existing Railway image. Probe both updater routes from the previous version and `204` at the new version, then publish the GitHub release. The in-app release artwork is `public/releases/0.8.0.png`; the public announcement image is attached to the GitHub release.

For the Linux 0.8.1 report fix, production Railway already has authenticated `GET /api/reports/ready` and multipart `POST /api/reports`, with a configured Discord webhook. The live source matches the dirty main backend `DesktopReportEndpoint` and `DiscordReportDelivery`; the 0.8.1 release branch backend lacks unrelated bootstrap files, so ship only the desktop client changes. `POST` requires a `report` JSON part with `includeDiagnostics`, accepts optional `screenshot`, `images[]`, and `terminalTail`, and returns HTTP 200 `{ok:true,id}`. The desktop should redact personal diagnostics before either remote or local transport, attach terminal output only with opt-in, and test the contract against a local fake server without posting into the production Discord channel. Linux WebKitGTK can call Shift+Tab `ISO_Left_Tab` or `BackTab`; send `ESC[Z` into the terminal to switch CLI modes, including Plan.

Linux 0.8.1 terminal input must follow the original 0.1.11 latency fix: post every key without waiting for an IPC reply, run `write_terminal` synchronously in ordered Tauri dispatch, and pass bytes to a per-session nonblocking queue whose worker writes to the PTY. Do not restore a frontend promise chain; it was the known cause of text appearing one character behind. The native Linux smoke now tests each echoed character, burst commands, Backspace, and Shift+Tab through WebKitGTK and a real shell PTY.

Linux 0.8.1 shipped from tag `v0.8.1` at `9ba406dfa2f7a2e189658a047e25de0ae2787188` in signed workflow `35876934551` (Linux job green). The signed AppImage passed 24 individual character echoes, 12 exact rapid commands, Backspace, Shift+Tab `ESC[Z`, native Linux decorations with no synthetic Mac controls, and the Report Bug UI/readiness fixture. The 0.8.0 comparison failed its second burst with a stray character at the next shell prompt. AppImage and Deb SHA-256 values, shared frontend hash, Railway deployment, and live updater checks are recorded in `docs/desktop-linux-parity.md`. The published release is https://github.com/ellisthreader/Vibyra/releases/tag/v0.8.1.

The 0.8.2 Linux candidate fixes two failures observed in 0.8.1: `commands/report.rs` must send an authenticated report directly through `report_relay::deliver` and never gate the POST on a second readiness GET; a temporary readiness error is unknown, not a disabled channel. `account_oauth.rs` retries transient 429/5xx poll responses and retains a one-shot completion token while `/api/session` recovers, checking cancellation before adopting it. Project right-click actions live in `WorkspaceTree.tsx` and `ProjectContextMenu.tsx`; closing an active project resets the watched root. `smoke-linux-terminal.mjs` uses a local account/report server with a deliberately failing readiness GET and successful authenticated POST, then tests WebKitGTK right-click, close confirmation and rename. These are candidate checks until a signed AppImage has passed CI and been installed.
The OAuth start retry is in `account_oauth_start.rs` to keep each native source file under 200 lines.
The shared frontend artifact in the release workflows is named by `github.run_id` and uploaded with overwrite enabled. A Linux packaging job rerun must download the same frontend built on attempt 1; including `run_attempt` in the artifact name made job-only reruns fail before packaging.

Linux 0.8.5's typing incident was a focus handoff regression, separate from
the older ordered-PTY write bug: `terminalSpawnActions.placePane` inserted a
visible running pane but never called `requestTerminalFocus`, while the native
smoke manually focused xterm before typing and therefore missed the UI path.
The 0.8.6 correction requests focus at insertion. Native smoke must assert
`document.activeElement` is the new pane's xterm textarea without calling
`.focus()`. The major-model notice is now shared between Mac and Linux; Windows
remains excluded. The signed Linux smoke checks the actual notice.

Linux 0.8.6 shipped from tag `v0.8.6` at
`11490e34e90228c1e6310d54ccad0078fe555c3a` in workflow `35988720626` (Linux,
Mac x64 and Mac arm64 jobs passed). AppImage SHA-256
`8092afe7af028fe3d31bdee8e187949f088a0a7452eeed2929739e9d8447bc3e`,
109,369,848 bytes; Debian SHA-256
`66d9095017b4b8589b1cb2e63b5f79e68e2d7e4049cb52dbb02e496e8d4a89cb`,
21,093,408 bytes. Both embed frontend SHA-256
`0922fa5e03045f7c74d49dbfa3e664c182f39a81b5ebdcfef679512eb75fc0b6` and
passed Tauri signature, sidecar, remote-volume and live-feed checks. Linux
WebKitGTK smoke confirmed the launch notice, natural xterm focus, 24 character
echoes, 12 burst commands, Backspace and Shift+Tab. Production feeds offer
0.8.6 from Linux 0.8.5 and 0.8.2 clients; 0.8.6 returns `204`. Windows CI
failed only its separate cross-platform Rust tests (Unix paths, `/bin/sh`, and
newline assumptions); no Windows package was published. Full publication
details are in `docs/desktop-linux-0.8.6-terminal-incident.md`.

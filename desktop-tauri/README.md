# Vibyra Desktop (Tauri 2)

AI terminal workspace: run Claude Code, Codex, Gemini and any other AI CLI
side by side in a native terminal grid, with a file browser, SSH sessions and
per-terminal lifecycle control.

**Stack:** Tauri 2 · Rust · React 19 · TypeScript · xterm.js

## Architecture

```
desktop-tauri/
├── src/                          React + TypeScript UI
│   ├── ipc/                      Typed wrappers over Tauri invoke/Channels
│   ├── state/                    zustand stores (terminals, workspace, settings)
│   ├── lib/terminalRegistry.ts   xterm instances owned OUTSIDE React (remount-safe)
│   ├── lib/terminalBus.ts        per-session event routing with replay queues
│   └── components/               terminal grid, file tree, agent panel, settings
└── src-tauri/
    ├── src/                      Thin Tauri shell: commands, channels, state
    └── crates/vibyra-core/       All native logic — no webkit/GTK dependency:
        ├── pty/                  portable-pty sessions, reader threads,
        │                         batching flusher, visibility throttling
        ├── agents/               declarative agent catalog + PATH detection
        ├── fsx/                  dir listing, file preview, debounced watcher
        └── settings.rs           JSON settings persistence
```

### Performance model (8+ terminals without UI lag)

- **One reader thread per PTY** pushes raw bytes into a shared buffer; a
  **single global flusher thread** delivers batched output for *all* sessions
  over per-session Tauri Channels.
- The flusher delivers **immediately on wake**, then rests one 16 ms tick
  after a delivery, so an isolated keystroke echoes with no added latency
  while sustained output still coalesces into one IPC message. Do not
  reintroduce a sleep *before* the first flush — it puts a fixed floor under
  keystroke echo latency. **Hidden** terminals flush every 250 ms;
  **hibernated** terminals send nothing — output lands in a bounded
  scrollback ring (4 MB) in Rust and is replayed as one snapshot on wake.
- Flush boundaries are **UTF-8-safe** (split multi-byte chars are carried to
  the next batch), so TUI box-drawing and emoji never get mangled.
- Memory is bounded per session (1 MB pending + 4 MB scrollback ring); a
  hibernated terminal that overflows is resynced from the ring instead of
  replaying an unbounded stream.
- Frontend: xterm instances live in a registry outside the React tree, so
  zoom/layout changes never rebuild a terminal. The write path does **no**
  forced layout: cell height is cached on fit/resize and the bottom-anchor
  transform is only written when the offset changes.
- **Renderer choice is not free.** Under WebKit's shared-memory compositing
  path a WebGL canvas loads and never paints — the terminal stays black with a
  full buffer. Renderer strings cannot detect this (WebKitGTK's ANGLE reports
  "Apple GPU" on Linux), so `src-tauri/src/renderer.rs` decides before the
  webview exists and `src/lib/xtermRenderer.ts` attaches WebGL only on the
  accelerated path. Never probe GL context strings for this, and never create
  throwaway WebGL contexts in a loop — leaked contexts crash the web process.

### Graphics mode

Auto-detection disables WebKit's DMA-BUF renderer only for sessions that
actually render through NVIDIA — the `boot_vga` GPU is NVIDIA, or the session
asks for PRIME offload — so hybrid laptops on their iGPU keep the fast path.
Users can override it in **Settings → General → Graphics**. A pre-set
`WEBKIT_DISABLE_DMABUF_RENDERER`, then `VIBYRA_WEBKIT_DMABUF=1|0`, take
priority over both.

### Process environment

Two things are true of a **desktop** launch that are not true when you start
Vibyra from a terminal, and both used to break it. Both are handled in
`vibyra-core/src/launch_env/`.

- **PATH.** A launcher hands the app the session manager's PATH, built from
  `~/.profile` at login. Node tooling installs into `~/.npm-global/bin` (or a
  Volta/Bun/Yarn equivalent) and is added by `~/.bashrc`/`~/.zshrc`, which only
  *interactive* shells read. `claude`, `codex` and `gemini` were therefore on
  PATH in a terminal and missing from the dock — and every AI account reported
  "not installed", offering a download instead of a sign-in. At startup the app
  now asks the user's login shell what PATH it builds (`$SHELL -l -i -c`, 5 s
  cap, silent on failure) and merges it in, so nvm/asdf/mise/pyenv work too.
  A static list of well-known bin directories backs it up.
- **AppImage capture.** The AppImage runtime points `LD_LIBRARY_PATH`,
  `PYTHONHOME`, `PERLLIB`, `GTK_PATH`, `GST_*`, `XDG_DATA_DIRS` and `PATH`
  itself inside its own mount so the bundled GTK/WebKit stack wins. Inherited
  by a terminal, that is enough to break `python3` outright ("No module named
  'encodings'"). Every child — PTY sessions, provider CLIs, `arecord` — is
  spawned with mount-owned path entries stripped and the rest kept, so
  `XDG_DATA_DIRS` keeps its system entries while `PYTHONHOME` disappears.

### Discord model-release alerts

Vibyra checks OpenRouter's tool-capable model catalog every five minutes. New
base models refresh the picker, create an in-app notification, and can post to
Discord. The webhook is stored in the operating-system credential store, never
in `settings.json`, source, shell history, or the desktop launcher.

After building and installing the current AppImage, connect the webhook once:

```bash
npm run discord:configure  # hidden prompt, then sends a test message
npm run discord:test       # re-test the stored webhook
npm run discord:clear      # disconnect it
```

`VIBYRA_DISCORD_WEBHOOK_URL` remains a runtime-only override for development or
managed deployments. Failed or rejected Discord messages stay queued in
`model-watch.json` and retry on later watcher ticks; the webhook value is never
written there.

### In-app reporting

Anyone using Vibyra can send a report from the title bar (the lifebuoy), the
command palette, or wherever they are — the dialog fills in *where* they were
before they type a word: version, platform, renderer, project, agent, model and
the pane in front of them. They can attach a screenshot, annotated through the
same editor F9 uses, up to four images picked from disk or pasted with Ctrl+V,
and the last 120 lines of the focused pane's output with the escape codes
stripped. Attached files are vetted by their magic number rather than their
extension, so a report cannot upload something that merely claims to be a PNG.

Reports arrive in Discord as an embed built for triage — who reported it on the
author line, kind and severity in the title, colour by severity, "where" before
"what" — with the unabridged
report, the environment and the terminal tail attached as `context.txt`. Each
one carries a short reference (`VR-8F3K2Q`) the reporter is shown, so a
follow-up can be tied back to the message.

The signed-in app uploads reports to the authenticated Vibyra API. Laravel
owns the Discord delivery secret through `VIBYRA_REPORT_WEBHOOK_URL`, so every
installation works without a command, setting, or local keyring entry. The
report channel remains separate from the machine-local model-alert webhook.
Nothing about a report is collected quietly: every attached value, including
the project folder, is listed in the dialog before it is sent, and terminal
output has its own switch.

### Closing the window

`CloseRequested` is vetoed **only while the workspace has armed the guard**
(`close_guard.rs`). The listener that answers the veto lives in the workspace,
which mounts after sign-in, so an unconditional veto made the app unclosable on
the sign-in screen. A watchdog closes anyway if the UI does not acknowledge
within 4 s — that bounds a crashed or still-loading webview, not the user, who
is only asked after the acknowledgement has already gone back.

### Suspending and resuming

Closing the window flushes the layout and each pane's on-screen output to
`session.json` (`persist_terminal_scrollback`, on by default). Reopening
restores the panes **suspended** — the output is shown, but no process is
launched, so reopening Vibyra never spends money or takes an action on its own.

**Resume** then puts the pane back to work, and carries two things across:

- **The output.** The saved scrollback is written into the new terminal before
  the event bus attaches, so the new process's output lands underneath it
  rather than above. The queue lives in `lib/terminalReplay.ts` and is consumed
  exactly once — a remount or a hibernation wake creates a terminal for the
  same id and must not replay it again.
- **The conversation.** The agent is asked to continue rather than start empty:
  `claude --resume <id>`, `codex resume --last`, `gemini --resume latest`.

Which conversation "continue" means is the subtle part. Claude Code panes are
launched with `--session-id <uuid>`, so each pane owns one and names exactly it
on resume — several Claude panes in one folder never collide. Codex accepts no
id at launch and Gemini cannot resume by one, so those can only ask for *the
most recent conversation here* — and `relaunchContinuity` withholds that
whenever a sibling pane of the same agent shares the folder, because both would
resolve to the same conversation and two live processes would then be writing
to it. Those relaunch clean, which loses the thread but never corrupts it.

**Restart** is the opposite intent and deliberately starts fresh: no replay, no
continue. That is the whole reason to press it.

Note the process itself does not survive the app closing — the PTY is a child
of Vibyra. Resume continues the *conversation*, not an in-flight task.

### Adding a new AI CLI agent

Either add one line to `builtin_agents()` in
`src-tauri/crates/vibyra-core/src/agents/catalog.rs`, or add it at runtime in
**Settings → Custom agents** (id + program + args). Agents are pure data —
no other wiring.

## Development

```bash
# Linux only: one-time system deps (Ubuntu/Debian)
./scripts/setup-linux.sh

npm install
npm run app:dev      # Tauri window + Vite HMR (all platforms)
```

Windows needs the MSVC build tools and WebView2 runtime; macOS needs Xcode
command line tools. `npm run app:dev` works on all three — it adds the Linux
pkg-config shim from `scripts/make-devshim.sh` **only when the system cannot
resolve `gtk+-3.0`/`webkit2gtk-4.1` itself** (`scripts/linux-env.mjs`). The
shim's stub `.pc` files carry only what cargo needs to link; once the real
`-dev` packages are installed they shadow the complete files and the AppImage
bundle fails at the very end with *"there is no 'exec_prefix' variable for
'gtk+-3.0'"*, long after cargo has succeeded.

**Building is not installing.** `npm run app:build` ends by copying the bundle
over the AppImage the desktop launcher runs (`~/Vibyra.AppImage`, override with
`VIBYRA_APPIMAGE_PATH`). Skipping that step is invisible — the app still
starts, still looks right, still writes its own settings file — it simply has
the feature set of whenever it was last copied, so an afternoon of work can
pass every gate and be entirely absent from the app on the dock.

Note: this folder has its own `rust-toolchain.toml` (stable, ≥1.88 needed by
Tauri's dependency tree), overriding the repo-root 1.85 pin.

## Verification

```bash
npm run verify       # every gate CI runs: line limits, dead code, frontend
                     # tests, build, rustfmt, strict clippy, Rust tests
npm run core:test    # Rust core only: PTY spawn/IO, batching, hibernation
                     # replay, UTF-8 boundaries, watcher, settings
npm run typecheck    # strict TypeScript
npm run build        # production frontend bundle
npm run app:build          # package the Linux AppImage AND install it (below)
npm run app:install        # same; explicitly
npm run app:install:only   # install the last build without rebuilding
npm run app:build:windows  # package the Windows NSIS installer on Windows
npm run app:build:windows:cross # package NSIS from Linux with nsis, LLVM, and cargo-xwin
```

## SSH

SSH sessions launch your system `ssh` inside a native PTY, so keys, agent
forwarding, `~/.ssh/config` and ProxyJump all behave exactly like your
terminal. Connect from the Agents panel (`user@host`).

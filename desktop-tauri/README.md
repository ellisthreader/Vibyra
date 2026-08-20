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
pkg-config shim only when it finds one.

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
npm run app:build          # package the Linux AppImage (needs system deps above)
npm run app:build:windows  # package the Windows NSIS installer on Windows
npm run app:build:windows:cross # package NSIS from Linux with nsis, LLVM, and cargo-xwin
```

## SSH

SSH sessions launch your system `ssh` inside a native PTY, so keys, agent
forwarding, `~/.ssh/config` and ProxyJump all behave exactly like your
terminal. Connect from the Agents panel (`user@host`).

# Desktop - AI Terminals

Read this for desktop terminal tabs, PTY-backed AI sessions, provider model
routing, terminal slash commands, and terminal companion panels. Treat
`Desktop/AI Terminal Provider CLI Research.txt` as the deep provider-style
reference.

## Main Files

- `desktop/assets/app.terminals-state.js`
- `desktop/assets/app.terminals-models.js`
- `desktop/assets/app.terminals-controls.js`
- `desktop/assets/app.terminals-pty.js`
- `desktop/assets/app.terminals-pty-runtime.js`
- `desktop/assets/app.terminals-companion.js`
- `desktop/assets/app.desktop-actions.js`
- `desktop/lib/ptyTerminals.mjs`
- `desktop/lib/aiTerminalPersistentProcess.mjs`
- `desktop/lib/aiTerminalWorker.mjs`
- `desktop/lib/aiTerminalProcess.mjs`
- `desktop/lib/desktopActions.mjs`
- `desktop/lib/aiTerminalOpenRouterCli.mjs`
- `desktop/lib/aiTerminalVibyraShell.mjs`

## Contracts

Terminal composers intentionally have no send button. Enter submits and
Shift+Enter inserts a newline.

Known terminal slash commands must either perform a local UI action, show real
local status/configuration, execute through the restricted `/commands/run`
route for allowed `!` shell commands, or transform into a provider-scoped
desktop chat prompt. Do not render known commands as unsupported placeholders.

Official CLI provider families are OpenAI/Codex, Anthropic/Claude, and
Google/Gemini. Other OpenRouter slugs use the Vibyra API wrapper unless an
official local CLI is intentionally added later.

PTY-backed terminals must preserve mounted xterm DOM nodes across
`/desktop/state` refreshes. Patch status, helper text, active/hidden classes,
settings menus, terminal add/remove/reorder, and companion panels in place
instead of forcing a full content `innerHTML` render that disconnects xterm.
When replaying a persisted transcript into xterm, suppress `onData` forwarding
until the replay write completes. Terminal control sequences can otherwise
generate device-response bytes that are mistaken for keyboard input, flood the
bridge with `/input` requests, and stall Electron startup.
The raw PTY WebSocket handler must also contain `409 Terminal is not running`
errors. A newly mounted xterm can emit protocol responses before a recovered
worker socket is writable; letting that exception escape the socket `data`
listener terminates the entire desktop bridge.

PTY task lifetime is owned by a detached local worker, not the Electron
renderer, browser WebSocket, or bridge process. Worker config, state,
transcript, and diagnostics live under
`~/.vibyra-agent/terminal-sessions/`; `ptyTerminals.mjs` recovers them when the
bridge restarts, and the browser reconnects/replays the persisted transcript
after refresh or window reopen. Only explicit terminal close may stop and
remove a worker. If a saved worker cannot be found, never auto-replay its
prompt because that can duplicate code changes or commands.
Treat the backend session collection as authoritative. On initial load and
after PTY WebSocket open/close recovery, reconcile local terminal records to
`GET /desktop/pty-terminals`: import backend-owned sessions, discard stale
browser-only snapshots, preserve only very recent pending creates, and dispose
removed sockets/xterms. Debounce collection sync so several reconnecting
terminals do not repeatedly remount the page.

Persistent close must remain deliverable while the worker control socket is
still connecting. Queue the close and keep connection retry active until the
worker receives it; cancelling retry first leaves detached workers and session
directories that consume terminal capacity.

Detached bridge and terminal-worker launches on Linux must close inherited file
descriptors above `2` before `exec`. Electron/Chromium sockets can otherwise
leak through the bridge into every terminal descendant and keep diagnostic or
application listeners alive after their owner exits.

Electron must reveal the desktop window only after the real configured
`/desktop` URL finishes loading. Chromium's `chrome-error://chromewebdata/`
also emits `did-finish-load`; treating it as success cancels retries and shows
a blank/error flash. Keep a lightweight `/health` monitor in the Electron main
process so a bridge crash after page load is restarted without user action.

Start `/desktop/state` polling from `app.boot.js`, after the terminal renderer
stack has loaded, and skip `render()` when the serialized desktop state is
unchanged. Starting polling inside `app.shell.js` can briefly expose the legacy
chat-style terminal renderer; rendering unchanged state every second causes
visible topbar flashing and broad shell DOM churn.

`desktop/lib/aiTerminalProcess.mjs` launches PTY sessions through
`/usr/bin/script`; keep row/column sizing synchronized before process start.
Codex should launch with `--no-alt-screen` in the embedded terminal surface.

The `/phone` command opens the terminal companion panel in memory only. Do not
forward it to `/desktop/chat`, persist it in localStorage, or remount xterm when
the panel opens.

For `/voice`, `/memory`, microphone transcription, or project-memory behavior,
read `Desktop/Voice And Project Memory.md`. These commands are intercepted
before PTY input reaches provider CLIs.

Theme switching: terminal UI owns its coverage through `desktop/assets/app.theme-terminals.css`, `desktop/assets/app.theme-terminals-states.css`, and `desktop/assets/app.theme-terminals-controls.css`, loaded after the split terminal CSS. Keep setup/model picker/settings/token-source/PTY fallback/companion panel colors tokenized there or in `app.terminals*.css`; avoid hardcoded dark inputs or modal/menu surfaces. Existing xterm instances keep an internal theme, so `desktop/assets/app.terminals-pty-runtime.js` observes `body[data-desktop-theme]` and reapplies `terminalXtermTheme()` without remounting PTY DOM nodes.

Terminal tabs and surfaces share semantic `idle`, `running`, `success`,
`error`, `stopped`, and `unavailable` status-dot classes. Keep those tokens
theme-aware, and define separate light/dark xterm ANSI palettes; changing only
background and foreground leaves light-mode command output with weak contrast.

Multi-terminal layout uses focus mode for one full-size active terminal and a
scrollable grid overview. At `1000px` and below, grid mode uses two columns
with a `230px` minimum tile height instead of squeezing 10-12 terminals into
short rows; below `560px`, use one column. Keep the active tab scrolled into
view and viewport-position settings menus so lower-row controls are not clipped.
The layout helpers live in `app.terminals-layout.js` and
`app.terminals-responsive.css`.

When terminal theme regressions appear, inspect `app.theme-terminals.css`, `app.theme-terminals-states.css`, `app.theme-terminals-controls.css`, `app.terminals.model.2.css`, and `app.terminals-pty-runtime.js` first. Validate both normal CSS surfaces and xterm internal theme repaint after changing `body[data-desktop-theme]`.

Desktop chat/terminal tool exposure is desktop-specific. Keep mobile-style
`/preview`, `/test`, `/build`, `/publish`, image generation, Deep Research, web
search, and analyze-file tools out of the desktop chat composer and terminal
paperclip menu unless a real desktop contract is added.

## Desktop AI Actions

`desktop/lib/desktopActions.mjs` recognizes local desktop-control intent before
cloud chat. It returns structured `actions`; `app.desktop-actions.js` validates
and executes them through the existing terminal and companion functions. Keep
ordinary chat on `/api/chat` and never treat unstructured assistant text as an
executable desktop command.

Terminal launch actions carry `count`, `model`, `effort`, `permissionMode`, and
`projectId`. `permissionMode` defaults to `standard`; only explicit full-access
phrases may set `full`. The browser persists and displays that mode, the PTY
route forwards it, and Codex alone receives
`--dangerously-bypass-approvals-and-sandbox`. Strip an `openai/` OpenRouter
prefix before passing the selected model to Codex CLI.

Focused validation:

```bash
node --test desktop/lib/desktopActions.test.mjs desktop/lib/desktopChat.test.mjs desktop/lib/aiTerminalProcess.test.mjs
node --test desktop/lib/aiTerminalPersistentProcess.test.mjs desktop/lib/ptyTerminalsSocket.test.mjs
```

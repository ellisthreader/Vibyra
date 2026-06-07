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
Model selection and token source do not implicitly select a local CLI.
Advanced/model-picked terminals use the Vibyra wrapper, including OpenAI
models paid with Vibyra tokens or a connected API key. Only an explicit
agent-first Codex, Claude, or Gemini choice launches that local CLI. Treat the
legacy `official` agent value as `vibyra`; otherwise unsupported ChatGPT-account
models can be sent to Codex instead of OpenRouter.

PTY-backed terminals must preserve mounted xterm DOM nodes across
`/desktop/state` refreshes. Patch status, helper text, active/hidden classes,
settings menus, terminal add/remove/reorder, and companion panels in place
instead of forcing a full content `innerHTML` render that disconnects xterm.
When replaying a persisted transcript into xterm, suppress `onData` forwarding
until the replay write completes. Terminal control sequences can otherwise
generate device-response bytes that are mistaken for keyboard input, flood the
bridge with `/input` requests, and stall Electron startup.
When xterm is available, it exclusively owns keyboard and paste input through
`onData`; bind wrapper `keydown`/`paste` handlers only for the no-xterm
fallback. Binding both paths sends every physical key twice.
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
Treat a control socket as writable only after its `connect` event. Node sockets
accept writes while still connecting, but those bytes are lost when the first
Unix-socket attempt races worker startup. Queue input, resize, and close until
connected; coalesce queued resizes and keep worker input buffered until child
stdin is ready.

Persistent process handles must not interpret `kill("SIGWINCH")` as terminal
close. Resize uses the dedicated control message. For `/usr/bin/script` PTYs on
Linux, update the descendant `/dev/pts/*` size with `stty -F`, wait until shell
startup output has settled, and only then release queued input; the inner shell
startup `stty` can otherwise overwrite an early resize and produce glitchy
dimensions.

Embedded terminals are interactive color surfaces even when the parent desktop
process inherited `NO_COLOR`. Terminal launch env removes `NO_COLOR`, restores
`TERM=xterm-256color`/`COLORTERM=truecolor` when needed, and sets
`FORCE_COLOR=1`; the Vibyra OpenRouter CLI gives explicit `FORCE_COLOR`
precedence.

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
Fit each mounted xterm from its actual container with a `ResizeObserver`, and
derive the resulting cell geometry from the rendered `.xterm-screen`. Do not
force `.xterm-screen` or `.xterm-viewport` to `height: 100%`; xterm must own
those dimensions so the terminal uses complete rows and columns without
clipping. Keep normal terminal text at a native 14px size and let unreadable
grid layouts scroll instead of shrinking the font aggressively.

Persistent PTY resize is ordered before input. The `/usr/bin/script` resize
adapter acknowledges only after `stty` has reached the descendant PTY and the
terminal has produced its first output, because shell startup can otherwise
reapply the launch dimensions after an early resize. The worker queues input
while that resize acknowledgement is pending, then sends `SIGWINCH` and flushes
the queued input.

The terminal topbar uses three independent tracks: New on the left, centered
scrollable agent-labeled tabs, and Sidebar/focus-grid/overflow on the right.
The single Vibyra AI launcher opens the right companion panel; AI Voice stays
above project Memory in one stacked sidebar rather than using separate navbar
actions or tool tabs. Overflow owns rare global actions such as Close all.
Terminal headers show only status,
identity, and settings; do not restore per-terminal minimize/maximize controls.
New is agent-first with project/model selection under Advanced setup.
Running-session model, project, reasoning, and permission values are
informational because PTYs cannot switch those launch settings safely after
start.

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

Explicit subagent, multi-agent, or plan/review/implement delivery requests
route through `desktop/lib/desktopAgenticTraining.mjs` to
`run_agentic_terminal_job`. The browser opens an explicit coding CLI team with
one planner, bounded workers, and one reviewer. Their role prompts coordinate
through `.vibyra-agent/jobs/<job-id>/`, require disjoint worker ownership, and
use actual local Vibyra skill names. `ptyTerminals.mjs` persists bounded job
metadata and the private initial assignment; `aiTerminalWorker.mjs` injects
that assignment once after CLI startup so renderer refresh/recovery cannot
duplicate work. Do not expose the full initial assignment in public PTY
session state.

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

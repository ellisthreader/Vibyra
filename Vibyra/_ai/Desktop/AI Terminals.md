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
- `desktop/assets/app.terminals-workspace.js`
- `desktop/assets/app.terminals-workspace.css`
- `desktop/assets/app.terminals-checkpoint.js`
- `desktop/assets/app.terminals-checkpoint.css`
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

The empty terminal setup persists its reasoning default in
`localStorage["vibyra.desktop.terminalSetupEffort"]`. The OpenRouter catalog
normalizer copies each model's `supported_parameters` into
`supportsReasoning`. Reasoning-capable models show Low/Medium/High/Extra high
and pass low/medium/high/xhigh through `createTerminals(..., { effort })`.
Models without `reasoning` omit the control and use the internal `default`
value, which causes the backend to omit OpenRouter's `reasoning` object.
OpenRouter performs nearest-level mapping when the provider supports fewer
levels than its normalized interface.

Known terminal slash commands must either perform a local UI action, show real
local status/configuration, execute through the restricted `/commands/run`
route for allowed `!` shell commands, or transform into a provider-scoped
desktop chat prompt. Do not render known commands as unsupported placeholders.

Official CLI provider families are OpenAI/Codex, Anthropic/Claude, and
Google/Gemini. Other OpenRouter slugs use the Vibyra API wrapper unless an
official local CLI is intentionally added later.
Built-in unqualified official models must map to concrete terminal agent keys:
OpenAI to `codex`, Anthropic to `claude`, and Google to `gemini`. Never use a
synthetic `official` key because terminal-agent normalization falls back to the
Vibyra wrapper. During backend session reconciliation, preserve a valid
backend-reported agent key before inferring from the model; this keeps legacy
wrapper sessions identified correctly so wrapper-specific input safeguards
still apply.
Provider-qualified catalog IDs always remain on that wrapper, including
`openai/*`, `anthropic/*`, and `google/*`. Only Vibyra's built-in unqualified
model keys may route to official CLIs. This prevents OpenRouter-only variants
such as `openai/gpt-5.5-pro` from being passed to a ChatGPT-authenticated Codex
CLI that supports the official `gpt-5.5` ID instead.

The terminal project picker includes a synthetic `full-pc` scope labeled
`Full PC`. `desktop/lib/projects.mjs` resolves that fixed ID to the current
user's home directory, so the browser never sends an arbitrary filesystem
path. This changes the terminal working directory only; permission mode remains
independent and defaults to standard.

PTY-backed terminals must preserve mounted xterm DOM nodes across
`/desktop/state` refreshes. Patch status, helper text, active/hidden classes,
settings menus, terminal add/remove/reorder, and companion panels in place
instead of forcing a full content `innerHTML` render that disconnects xterm.
Keyboard and paste input must have exactly one browser event owner.
`app.terminals-pty.js` delegates terminal input binding to `bindPtyInput()` in
`app.terminals-pty-runtime.js`; when xterm is available, only `xterm.onData`
forwards typed bytes. Attaching a bubbling `keydown` listener to the outer
`[data-terminal-input]` host as well causes every physical keypress to be sent
twice. The outer keydown/paste fallback is only for environments without
xterm and must become inert if xterm later becomes available. Keep xterm
`screenReaderMode` disabled in Electron, and ignore `onData` from detached or
replaced xterm instances. Keep `desktop/assets/app.terminals-input.test.mjs`
passing whenever terminal input binding changes.
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
a blank/error flash. Keep a lightweight `/desktop/runtime` monitor in the
Electron main process so a bridge crash after page load is restarted without
user action.
Terminal action executor assets and the bridge share
`TERMINAL_ACTION_PROTOCOL_VERSION`. The renderer must verify it through
`/desktop/runtime` before allowing structured terminal actions. A mismatch
stays blocked, reports one coalesced reload request to the bridge, and Electron
consumes that request once with `reloadIgnoringCache()`; a compatible renderer
clears the request to prevent reload loops after bridge health restarts.

Start `/desktop/state` polling from `app.boot.js`, after the terminal renderer
stack has loaded, and skip `render()` when the serialized desktop state is
unchanged. Starting polling inside `app.shell.js` can briefly expose the legacy
chat-style terminal renderer; rendering unchanged state every second causes
visible topbar flashing and broad shell DOM churn.

`desktop/lib/aiTerminalProcess.mjs` launches PTY sessions through
`/usr/bin/script`; keep row/column sizing synchronized before process start.
Codex should launch with `--no-alt-screen` in the embedded terminal surface.

Project-backed AI terminals use the canonical imported Vibyra Memory vault.
`desktopTerminalMemory.mjs` builds a bounded snapshot with a file index and
selected note excerpts. Vibyra/OpenRouter terminals receive current vault
context through `desktopChat.mjs` on every request. Official CLI sessions
receive a private launch snapshot without modifying project files: Codex uses
its isolated `CODEX_HOME/AGENTS.md`, Claude uses `--append-system-prompt`, and
Gemini uses a session-private included `GEMINI.md` directory configured through
`GEMINI_CLI_SYSTEM_SETTINGS_PATH`. Persist the bounded snapshot only inside the
mode-0600 detached terminal session config so recovery keeps the same context;
never expose the raw snapshot in public PTY session responses. Shell and
`Full PC` terminals do not receive project Memory.

The `/phone` command opens the terminal companion panel in memory only. Do not
forward it to `/desktop/chat`, persist it in localStorage, or remount xterm when
the panel opens.

The terminal page has one persistent icon-only Vibyra AI launcher in the
top-right shell actions, including setup when no terminals exist. Use the real
Vibyra logo with an accessible label and tooltip instead of a labeled pill. Do
not render Voice or Memory launchers beside terminal tabs, and do not add
Chat/Voice/Memory navigation tabs inside the companion. It opens Chat; Voice is
reached from the chat composer or `Alt+V`, with a small return-to-chat action
in Voice. Memory stays visible in the lower half. Patch the panel beside
`.terminal-stage` rather than remounting xterm. Chat threads are in-memory and
scoped per terminal id so switching terminal/project context does not mix
conversation history.
The no-terminal setup is intentionally compact: count and custom count share
one row, Project and Model share a responsive grid, and there is no decorative
layout preview. Reasoning and token source live under a native Advanced
settings disclosure whose open state survives setup rerenders. Workspace
safety remains visible for multiple project terminals. Preserve the terminal
surface and tabs during visual cleanup; the three-dot options menu owns the
labeled Project, Workspace, Access, advanced path/token details, and separated
Close terminal action.
Topbar terminal tabs show the normalized agent label plus visible tab position,
for example `Codex 1`, `Claude 2`, or `Vibyra 3`. Keep each tab's close button
and drag behavior. Tabs should remain wide enough for those labels, with the
group centered and the strip scrolling horizontally when terminal count exceeds
the available space. The topbar three-dot menu owns Focus/Grid switching and a
confirmed close-all action through `POST /desktop/pty-terminals/close-all`.
When a requested separate workspace falls back because the project is dirty,
the terminal notice ends with `Save local checkpoint`. That action must use the
existing checkpoint preflight and approval dialog, create only a local Git
checkpoint, and then tell the user to reopen the terminals with Separate
branches. Keep the action available after incremental PTY notice updates.
The Chat companion visual shell is split across
`app.terminals-companion-shell.css` and `app.terminals-companion-chat.css`.
Keep its title and sibling mode tabs visible at the `860px` Electron minimum,
keep at most two starter prompts compact, omit redundant terminal-context copy
inside Chat, and do not show an `Enter to send` hint beside the familiar
composer actions. Preserve per-terminal composer drafts whenever the panel
rerenders.
The companion frontend presents Vibyra AI as the assistant for the whole
desktop app. Never label it as limited to the active terminal or display
`Using context from...`; terminal and project identifiers may still be passed
quietly for routing and relevant answers.
Keep the companion Chat CSS/JS versioned in `app.html` so a
running Electron renderer cannot retain the pre-polish assets after a reload.
Do not show persistent local-model installation or availability copy in the
composer; keep the panel neutral and report an actionable runtime error only
after the user sends a request.
The terminal companion body is a vertical 50/50 stack: Chat or Voice stays in
the upper half and project Memory stays visible below it. The stacked Memory
workspace uses the normal backend-owned vault state but a compact toolbar and
explorer; both halves own their scrolling, and Memory must not trigger the
legacy wide full-height companion layout. Keep the companion outer grid at
`auto minmax(0, 1fr)` and the inner stack at two `minmax(0, 1fr)` rows; the
later-loaded Memory stylesheet must not restore an extra `auto` row or let
graph minimum heights expand the Memory half.
Any open companion temporarily owns the shell rail: collapse it to the
icon-only state, block expansion while the panel is open, and restore the
user's previous rail state on close without changing
`vibyra.desktop.railCollapsed`. Keep the shell grid and companion entrance
animated, honor reduced motion, and let the xterm `ResizeObserver` refit the PTY
through the width transition. The regression is
`desktop/assets/app.terminals-companion-rail.test.mjs`.

For `/voice`, `/memory`, microphone transcription, or project-memory behavior,
read `Desktop/Voice And Project Memory.md`. These commands are intercepted
before PTY input reaches provider CLIs.

Theme switching: terminal UI owns its coverage through `desktop/assets/app.theme-terminals.css`, `desktop/assets/app.theme-terminals-states.css`, and `desktop/assets/app.theme-terminals-controls.css`, loaded after the split terminal CSS. Keep setup/model picker/settings/token-source/PTY fallback/companion panel colors tokenized there or in `app.terminals*.css`; avoid hardcoded dark inputs or modal/menu surfaces. Existing xterm instances keep an internal theme, so `desktop/assets/app.terminals-pty-runtime.js` observes `body[data-desktop-theme]` and reapplies `terminalXtermTheme()` without remounting PTY DOM nodes.

Terminal tabs and surfaces share semantic `idle`, `running`, `success`,
`error`, `stopped`, and `unavailable` status-dot classes. Keep those tokens
theme-aware, and define separate light/dark xterm ANSI palettes; changing only
background and foreground leaves light-mode command output with weak contrast.
Terminal chrome uses Vibyra purple, including running status and dropdown/menu
selection. Provider accents must not recolor terminal controls; reserve ANSI
green for actual terminal output and green status for proven success.
The terminal options menu includes a rename form backed by
`PATCH /desktop/pty-terminals/:id`; the bridge updates both its live session
and detached-session config so the name survives reconciliation and restart.
New terminals append to display order. Grid tiles show their position, and the
wide eight-terminal layout is four columns by two rows, placing `1` top-left
and `8` bottom-right.
Tasks assigned by Vibyra AI to already-open terminals remain visually silent.
`app.terminals-activity.js` now only preserves assignment-ID compatibility and
cleans stale visual state. The prompt and provider output inside xterm are the
only success presentation; delivery errors remain visible.
Serialize `GET /desktop/pty-terminals` refreshes so an older response cannot
reconcile after newer state. Reconciliation preserves visible delivery errors
while applying authoritative `providerState`.
Main and terminal-companion chats carry a separate structured
`desktopActionContext.recentTerminalBatch` instead of reconstructing terminal
identity from prose. The browser context is scoped per chat, stores at most 12
terminal IDs plus batch/project/model/execution metadata, expires after 30
minutes, and is sent by main chat, companion chat, and companion Voice. Action
executors receive the scope as their optional second argument and record
results through `window.vibyraDesktopActionContext`; companion context follows
the conversation when an action changes the active terminal.
Natural-language subset assignment must recognize recent-terminal phrasing
such as `terminals you have just opened` and `N out of the open terminals`.
Speech-like variants such as `use N of them terminals you have just launched`
must normalize to existing-terminal assignment. Normalize the observed
`front-end order` / `front a front-end` transcription to `front-end audit`
before extracting the shared objective.
Read-only constraints including `without changing code`, `diagnosis only`, and
`only report findings` must select read-only prompt roles and must not suppress
an unrelated negation such as `do not assign`. Unrecognized assignment wording
must never fall through to `open_terminals`.
Audit, diagnosis, review, and inspection assignments default to strictly
read-only roles unless the same request explicitly asks to fix, edit, implement,
or otherwise mutate the project.
If unfamiliar terminal-action wording falls through the deterministic parser,
model replies from local Ollama, connected providers, and cloud chat pass
through `correctDesktopCapabilityDenial()` before display. Never let a model
claim Vibyra cannot control terminals or is not a terminal emulator; replace
that false denial with the truthful statement that the wording was not safely
recognized and no action ran. Keep `localAi.test.mjs` in
`npm run test:desktop-ai` so both the local system prompt and response guard
remain covered.
Existing-terminal delivery excludes shell, fallback-shell, starting, and other
not-ready sessions plus terminals that do not match explicit model or
full-access requirements. Keep successful semantic acknowledgement internal;
surface only delivery failures.
Legacy `/desktop/terminals` AI sessions are bridge-memory-only and disappear on
a bridge restart; do not treat them as the persistent PTY sessions used by the
terminal page.

Multi-terminal layout uses focus mode for one full-size active terminal and a
scrollable grid overview. At `1000px` and below, grid mode uses two columns
with a `230px` minimum tile height instead of squeezing 10-12 terminals into
short rows; below `560px`, use one column. Keep the active tab scrolled into
view and viewport-position settings menus so lower-row controls are not clipped.
Do not auto-switch to grid at a terminal-count threshold; grid is an explicit
user choice so bulk creation does not remount every xterm.
The layout helpers live in `app.terminals-layout.js` and
`app.terminals-responsive.css`.
The new-terminal model picker is a fixed popover anchored to
`#open-terminal-new` by `positionTerminalNewMenu()`. Clamp it to viewport edges
and place it below the `+` button when space allows; do not use window-centered
coordinates. Keep the popover hidden until positioning adds
`terminal-model-picker--positioned`, preventing a flash at fallback
coordinates. Electron's `.desktop-chrome-page` is transformed, so fixed menu
coordinates must subtract the actual transformed containing block rectangle;
raw viewport coordinates place the picker far to the right. Base terminal
controls mark click ownership with
`data-terminal-click-bound`; PTY incremental binding must skip those nodes or
the `+` and three-dot menus toggle open and closed from one click. Keep
`desktop/assets/app.terminals-new-menu.test.mjs` passing.

Runtime terminal resize must keep three dimensions synchronized: the visible
xterm host, the xterm rows/columns, and the underlying pseudo-TTY. On Linux the
`/usr/bin/script` adapter resolves its `/dev/pts/*` device, applies `stty -F`,
then signals the child session process group with `SIGWINCH`. The persistent
process handle's `kill()` method is reserved for explicit close and must never
be used as resize signaling. Observe mounted xterm hosts with `ResizeObserver`
so grid, sidebar, companion, and window geometry changes reach the PTY.

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

Both the main desktop Chat page and the terminal Vibyra AI companion must pass
returned `actions` through `runDesktopActions()`. Never display optimistic
action copy as success without executing the structured action. Companion
actions that create or close the active terminal must move the user/result
messages to the newly active terminal or setup thread so the confirmation
remains visible.

Terminal launch actions carry `count`, `model`, `effort`, `permissionMode`, and
`projectId`. `permissionMode` defaults to `standard`; only explicit full-access
phrases may set `full`. The browser persists and displays that mode, the PTY
route forwards it, and Codex alone receives
`--dangerously-bypass-approvals-and-sandbox`. Strip an `openai/` OpenRouter
prefix before passing the selected model to Codex CLI.
Explicit follow-ups such as `give all terminals full permissions` resolve to
`set_terminal_permissions`. Permission mode cannot change inside a running CLI
process, so the renderer must confirm the destructive boundary, close the
selected Codex terminal sessions, and relaunch them while preserving model,
reasoning effort, project scope, token source, and the previously active tab.
Provider-qualified OpenRouter models are not Codex CLI sessions. An explicit
full-access relaunch may convert one only when a compatible built-in Codex
model exists; for example, `openai/gpt-5.5-pro` converts to built-in
`gpt-5.5` after the confirmation explains the model switch. Preserve effort,
project, token source, count, and active-terminal identity. Never pass a
provider-qualified slug to Codex or claim full access for non-OpenAI wrappers.

Model intent distinguishes built-in official models from provider-qualified
catalog models. Plain `GPT-5.5`, `gpt5.5`, and `open ai 5.5` resolve to the
unqualified `gpt-5.5` Codex route; explicit `GPT-5.5 Pro` resolves to
`openai/gpt-5.5-pro` and stays on the Vibyra/OpenRouter wrapper. Dynamic
OpenRouter groups extend built-in model groups instead of replacing them, so
action matching cannot lose official model keys after catalog load.

Named-project launch intent resolves unique exact, case-insensitive, and quoted
project names against discovered projects. Explicit prompt scope overrides the
currently selected project; nonexistent, ambiguous, and stale project
references must fail instead of falling back to `process.cwd()`. Natural
language such as `Full PC`, `whole computer`, or `home directory` maps to the
terminal-only `full-pc` scope. Keep the end-to-end matrix covering exact,
lowercase, quoted, missing, ambiguous, current-project, and Full PC cases.

Terminal project identity is backend-authoritative. Companion chat must
preserve an intentional empty project on an existing terminal, startup chat may
use `terminalProjectForSetup()` before the first terminal exists; that setup
state is initialized from persisted `selectedProjectId` while projects load.
Desktop actions with
missing project metadata inherit that setup scope, while an explicit empty
`projectId` remains an intentional `No project` selection. PTY
reconciliation must copy both `projectId` and `cwd` from the server. Reusing a
running terminal ID with a different project returns a conflict. Provider
wrapper banners and status copy must render the real process cwd, not a
synthetic `~/workspace` or encoded project ID.

Persistent PTY recovery must discover projects before restoring sessions,
re-resolve each saved `projectId`, and require the saved cwd to equal the
server-resolved project path. Terminate unknown or mismatched legacy workers
instead of trusting their stored cwd. The setup screen must not launch a
persisted project selection until it appears in the loaded project registry.
Closing a stale terminal ID reports that it was already closed rather than
showing false success.

Project IDs accepted by normal desktop routes must come from cached,
discovered, browsed, or explicitly analyzed projects. Do not reconstruct an
arbitrary filesystem path from a manufactured base64 project ID.
`terminalProjectById()` is the only resolver allowed to recognize `full-pc`;
keep that broad home-directory scope confined to PTY terminal launch.

Terminal close intent uses `close_terminals` with `scope: "active" | "all"`.
Close-all must call `POST /desktop/pty-terminals/close-all`, which delegates
every session to the existing close lifecycle so running, exited, unavailable,
and still-connecting workers are removed consistently. Parser guards must keep
model versions such as `GPT-5.5` from becoming terminal counts and must reject
negated or explanatory requests such as `don't open terminals` or
`explain how to open terminals`. Close parsing must require a direct close
command and reject conversational or deferred phrases such as `stop talking
about terminals` and `close terminals after tests finish`. Full-access parsing
must reject `no`, `except`, revoke, or disable wording. Before a permission
relaunch closes anything, verify every original model is still available and
unlocked so the session cannot be replaced by a fallback model.

## Action Evaluation Dataset

Treat `desktop/evals/action-parsing/cases.jsonl` as the supervised action
dataset and release gate. It is deterministically generated by
`desktop/evals/action-parsing/generate.mjs` and covers more than 15,000
count/model/effort/permission/project combinations, common typos,
close/companion actions, and no-action safety examples. Add a reported prompt
and its expected structured action before fixing a new routing regression.

Regenerate and run the gate with:

```bash
npm run desktop:ai:dataset
npm run test:desktop-ai
```

Keep generated IDs and normalized prompts unique. False-positive execution
cases are release failures, especially explanatory, quoted-example, negated,
full-access, and close-all prompts.

Per-terminal delegation uses the `run_terminal_tasks` desktop action. Common
model, effort, permission, and authoritative project scope live on the action;
`tasks` contains one `{ task }` item per terminal. Broad audit requests
decompose into complementary investigation, focused-test, and code-path review
tasks, while numbered or bulleted task lists are preserved. Treat `subagent`
or `subagents` beside an explicit terminal count as delegation intent even when
the prompt omits the word `task`; generate exactly the requested number of
complementary assignments. Phrases such as `all 5 terminals`, `each terminal`,
or `open terminals` set `target: "existing"`: synchronize the backend-owned
session collection, keep each terminal's model/effort/project/token/permission
settings unchanged, and submit one sanitized bracketed-paste-plus-Enter payload
through the acknowledged HTTP input route. Do not relaunch existing terminals
for task assignment. When no existing-terminal count is stated, prepare enough
complementary tasks to fill the eligible project terminals and report only
actual delivery failures, not unused task templates.
Subset wording such as `give 3 of the 7 terminals the job` or `give 3 of them
the task` must use the subset count, not the referenced total. Assign exactly
that many jobs to eligible existing terminals, starting with the active
eligible terminal and then following visible terminal-tab order. Keep
explanatory, hypothetical, deferred, and subset full-permission wording out of
automatic execution.
Phrases such as `with the terminals open, assign 3 terminals to ...` are
existing-terminal delegation even when the user omits `tasks`, `jobs`, or
`subagents`. The `assign|delegate|distribute <count> terminals to <goal>`
construction must produce `run_terminal_tasks` with `target: "existing"` when
the prompt says the terminals are open; it must never fall through to
`open_terminals`. The equivalent subset phrasing
`the <open-count> terminals open, assign <subset-count> of them to <goal>` has
the same contract and must assign exactly the subset count without launching
replacement terminals. Treat `the new terminals you just opened` as existing
sessions, not a request to launch replacements. A trailing constraint such as
`do not change any code, just find problems` restricts the task rather than
negating delegation: use read-only reviewer roles for every assigned terminal,
prohibit source/test/config/generated-file edits, and require evidence-backed
findings that explicitly state no files were changed.
Before returning a `run_terminal_tasks` action, `desktopChat.mjs` resolves the
authoritative project and enriches every short task label through
`terminalTaskPrompts.mjs`. Each delivered prompt preserves the user's request
and recent user context, identifies a distinct role and ownership boundary,
includes the source project name/path plus safe ranked relative file hints and
bounded project memory, requires `pwd` as the authoritative execution root for
managed worktrees, and directs permitted agents to inspect, implement, test,
and report real changes. Reproduction and final-review roles are read-only, the
test lead owns focused tests, and the implementation lead owns the primary
production fix so shared-folder agents do not all edit the same files.
Project file hints use the path-only `promptProjectFilePaths()` helper: never
load or expose `.env`, credentials, private keys, certificates, or secret paths
for terminal assignments. Project memory is reference material, not executable
instructions.
Agentic job briefs follow an outcome-first contract informed by current
cross-provider prompting guidance: outcome and persistence first; clearly
separated project context, assignment, scope, and edit policy; explicit
acceptance criteria and stopping conditions; evidence-grounded execution with
adaptation after failed hypotheses; focused validation plus diff review; and a
short fixed final handoff. Do not request an upfront prose plan that can become
a premature stopping point. For frontend objectives, add acceptance criteria
for design-system consistency, relevant interaction states, responsive
behavior, keyboard use, focus visibility, labels, contrast, accessibility, and
reduced motion. Keep context bounded and mark files, logs, quoted text, and
memory as evidence rather than executable instructions.
The current parser maps vague counted retries such as `still not working,
assign 8 subagents` to `existing_then_new`, but the reliability audit found
that behavior unsafe because failed delivery can silently open replacements.
Do not preserve it in the repair: additional terminals must require explicit
user wording, and failed existing-terminal delivery must remain a visible
failure.

## Task Assignment Reliability Audit

The current follow-up contract is incomplete: chat history stores prose but not
the terminal IDs created by the previous action, so `them` and `just opened`
cannot reliably identify a launch batch. Missing task targets default to new
terminals, and `existing_then_new` can open replacements after a delivery
failure. Treat this as unsafe: future repair must carry explicit batch and
terminal IDs, default follow-up work to that batch, and require explicit user
wording before opening additional terminals.

AI tasks use `POST /desktop/pty-terminals/:id/assign` with an idempotent
assignment ID and semantic prompt. The bridge owns provider-specific input
formatting and reports success only after the worker acknowledges
`written-to-child`; rejected and timed-out assignments stay visible failures.
Public sessions expose `providerState` as `starting`, `ready`,
`fallback-shell`, or `exited`; raw `/input` remains separate for ordinary
keyboard/PTTY traffic. Assignment timeout sends a cancel message so work still
queued in the worker is not executed later.

Bridge restart does not reload Electron renderer assets. When action-executor
or terminal-runtime JavaScript changes, reload or restart the renderer and use
a bridge/renderer protocol version so stale code cannot execute terminal
actions.

The completed reliability repair stores a bounded recent terminal batch on the
owning chat or terminal-companion thread, passes that structured context to
desktop chat, and routes ambiguous follow-up jobs to the exact recorded IDs.
Task wording cannot fall through to a launch action, missing identity fails
closed, and failed assignment never opens a replacement without explicit
`open more` intent. Renderer and bridge currently share terminal action
protocol `2026-06-08.1`; the renderer blocks actions until that version
matches.

Release gate on 2026-06-08: `npm run test:desktop-ai` passed 158/158 tests.
A live `/desktop/chat` check routed the reported three-terminal read-only
frontend diagnosis to the exact three supplied recent-batch IDs. A disposable
ready Vibyra/OpenRouter terminal then acknowledged a unique semantic assignment
as `written-to-child`, emitted the exact verification marker in its transcript,
and was closed; the four pre-existing terminal IDs and ready states were
unchanged.

Successful assignment acknowledgement is intentionally not shown as frontend
status. Do not render `Task accepted`, task-summary strips, or animated terminal
tab states; the prompt and model response in the terminal are the confirmation.
Keep semantic acknowledgement internally and continue showing delivery errors.

Combined launch wording such as `open six terminals ... give them full
permission` is one `open_terminals` action with `permissionMode: full`; it is
not an existing-terminal permission relaunch. Preserve standalone follow-ups
such as `give all open terminals full permissions` as
`set_terminal_permissions`.

New-terminal task batches still open one terminal per task and pass a transient
`initialPrompt`; `startPtyTerminal` submits it through the awaited semantic
`/assign` endpoint only after the authoritative PTY create request succeeds,
then clears the prompt after that one attempt so reconciliation cannot replay
uncertain work. A narrow
`still not working` or `try again` subagent follow-up may reuse the last
specific user task goal from normalized chat history, but history never grants
permissions or changes project scope.
The Vibyra/OpenRouter terminal wrapper is line-oriented and does not interpret
bracketed multiline paste like an interactive provider CLI. Before sending an
initial or existing-terminal task to `agent: "vibyra"`, flatten non-empty prompt
lines into one ` | `-separated logical line. Otherwise every line in an
agentic brief becomes a separate model request and floods the transcript with
repeated `is thinking` status messages. Keep multiline bracketed paste for the
real Codex, Claude, and Gemini CLIs.
Preserve active creates and recently starting sessions during collection
reconciliation. Never persist or replay `initialPrompt`, because recovery must
not rerun agent work.
`aiTerminalOpenRouterCli.mjs` must send `disableDesktopActions: true` for
terminal-internal prompts so assigned work cannot recursively launch terminals.
Detached Vibyra/OpenRouter wrappers must receive a bridge-origin
`VIBYRA_DESKTOP_URL` with no `/desktop` page suffix. The wrapper also strips
that suffix defensively before appending `/desktop/chat`; otherwise Electron's
page URL becomes `/desktop/desktop/chat` and falls through to the phone token
guard with a misleading `Missing or invalid desktop token` error.
Start with `desktop/lib/desktopActions.mjs`,
`desktop/assets/app.desktop-actions.js`, and
`desktop/assets/app.terminals-pty-runtime.js`.

Parallel terminal editing supports a local-only `workspaceMode` of `shared` or
`worktree`; GitHub integration is not required. For users without a saved
preference, worktree mode is the default. For two or more new terminals, setup
labels it `Safe mode`, marks it Recommended, and explains that separate files
prevent overlap; `Shared folder` remains an advanced choice. Structured desktop
batches ask once whether to isolate when no mode was supplied. Worktree mode is backend-authoritative:
`desktop/lib/terminalWorktrees.mjs` resolves the selected project, requires a
clean Git repository, serializes `git worktree add`, creates one
`vibyra/<project>-<hash>` branch under
`~/.vibyra-agent/terminal-worktrees`, and never copies ignored files,
dependencies, `.env` files, credentials, or user data. Persist and revalidate
the repository root, managed worktree path, branch, and nested project cwd
before restoring a worker; reject dirty, non-Git, Full PC, missing, or tampered
workspaces. A browser launch that explicitly allows safe fallback opens the
terminal in the original shared project folder when isolation is unavailable
and persists the reason separately as `workspaceNotice`; do not leave the
terminal stuck in `starting`, and do not stash or copy the dirty source state.
Project terminal headers show the effective state as `Separate branch`,
`Shared folder`, or amber `Shared for now`. Dirty-project guidance says that
changes need a local checkpoint, confirms files were not deleted, and states
that GitHub is not required. Clicking that compact indicator reuses the notice
surface for explanation, while incremental refresh patches the indicator
without remounting xterm. Setup preflights `Separate branches` through
`POST /desktop/pty-terminals/workspace/preflight`; a dirty project shows one
explicit `Save checkpoint and continue` approval with the changed-file count.
Approval calls `POST /desktop/pty-terminals/workspace/checkpoint`, creates a
local-only Git commit using the Vibyra local identity, then launches with shared
fallback disabled. Cancellation changes nothing and opens no terminals. Closing a
terminal stops and removes its worker context but
deliberately preserves its local branch and worktree. Do not add automatic
merge, discard, branch deletion, or secret copying without a separate explicit
approval and conflict-handling workflow. Permission relaunch is blocked for an
isolated terminal until it can retain the same authoritative workspace.

Focused validation:

```bash
node --test desktop/assets/app.terminals-input.test.mjs desktop/assets/app.terminals-companion-rail.test.mjs desktop/assets/app.terminals-new-menu.test.mjs
node --test desktop/lib/localAi.test.mjs desktop/lib/desktopActions.test.mjs desktop/lib/desktopChat.test.mjs desktop/lib/aiTerminalProcess.test.mjs
node --test desktop/lib/aiTerminalPersistentProcess.test.mjs desktop/lib/ptyTerminalsSocket.test.mjs desktop/lib/terminalWorktrees.test.mjs
```

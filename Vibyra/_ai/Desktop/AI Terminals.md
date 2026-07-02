# Desktop - AI Terminals

Read this for desktop terminal tabs, PTY-backed AI sessions, provider model
routing, terminal slash commands, and terminal companion panels. Treat
`Desktop/AI Terminal Provider CLI Research.txt` as the deep provider-style
reference.

Current Windows bug report: `Desktop/Windows Desktop Current Bug Report.md`
tracks user-reported unresolved issues from 2026-07-01: GPT/Codex Full access
still asking for approvals, every terminal repeating update prompts, terminal
copy failure, terminal links not opening, and keyboard input spamming/glitching
while typing, including intermittent missing spaces. It also tracks the related
desktop Talk bug where F8 starts voice capture but does not stop it on the
second press, plus stale OpenRouter catalog/model-picker behavior where newly
available models such as reported Anthropic entries are missing.

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
- `desktop/lib/aiTerminalRuntimeCatalog.mjs`
- `desktop/lib/aiTerminalRuntimes.mjs`
- `desktop/lib/aiTerminalRuntimeRoutes.mjs`
- `desktop/lib/aiTerminalCommandProfiles.mjs`
- `desktop/lib/aiTerminalVibyraShell.mjs`

## Contracts

Terminal composers intentionally have no send button. Enter submits and
Shift+Enter inserts a newline.

The first terminal setup picker keeps the internal `solo` / `team` modes but
labels them by outcome for first-time clarity: `Independent agents` opens
separate terminals for separate tasks, while `Coordinated team` takes one
shared goal and has Vibyra assign and coordinate roles. Keep the existing
minimal two-choice layout and use grid/connected-agent icon semantics rather than a
generic terminal/person pair. The renderer lives in
`desktop/assets/app.terminals-pty.js` with presentation in
`app.terminals-setup-flow.css`.

The terminal project picker is deliberately simple: `desktop/assets/app.terminals-project-picker.js`
and `app.terminals-project-discovery.js` render one search input and the
known project rows only. Do not restore `No project`, `Browse full PC`, native
folder/file browse actions, or async whole-PC search inside this dropdown.

The empty terminal setup persists its reasoning default in
`localStorage["vibyra.desktop.terminalSetupEffort"]`. The OpenRouter catalog
normalizer copies each model's `supported_parameters` into
`supportsReasoning`. Reasoning-capable models show Low/Medium/High/Extra high
and pass low/medium/high/xhigh through `createTerminals(..., { effort })`.
Models without `reasoning` omit the control and use the internal `default`
value, which causes the backend to omit OpenRouter's `reasoning` object.
OpenRouter performs nearest-level mapping when the provider supports fewer
levels than its normalized interface.

Vibyra-token terminals use a hybrid execution contract. Registered official
providers keep their genuine foreground CLI: Codex for OpenAI, Claude Code for
Anthropic, Gemini CLI for Google, Qwen Code for Qwen, Kimi Code for Moonshot,
Mistral Vibe where its gateway contract is supported, and Grok Build for
`x-ai/grok-*`. A provider-qualified,
tool-capable catalog model without a registered official CLI uses the bundled
foreground `Vibyra Agent` runtime. Vibyra Agent has one honest shared command
set and never claims to be that provider's native CLI. Its provider registry
now gives every known API-only company an original dimensional terminal theme
with distinct logo geometry, palette, prompt token, activity language, and
status copy; unknown qualified providers receive a deterministic fallback.
The shared structured command catalog separates real local actions from agent
workflows. Local `/pwd`, `/files`, `/git`, `/history`, `/unstage`, and
`/identity` commands use bounded helpers, `/stop` can cancel active work
immediately, and Standard-mode path commands/file mentions cannot leave the
terminal's launch workspace. Start with
`aiTerminalVibyraAgentBranding.mjs`,
`aiTerminalVibyraAgentPresentation.mjs`,
`aiTerminalCommandProfiles.mjs`, and
`aiTerminalVibyraAgentWorkspace.mjs` for this surface. Launch contract version
`25` invalidates stale workers. Runtime selection is model-family-aware rather
than company-wide: `google/gemini-*` remains native Gemini CLI, while
`google/gemma-*` and equivalent API-only families from native-CLI companies use
Vibyra Agent with the exact selected model.

`GET /desktop/runtime` exposes `aiTerminalLaunchContractVersion`. The
`Vibyra Desktop` launcher compares it with the on-disk provider registry,
gracefully stops a mismatched bridge, terminates any lingering stale bridge
process, and starts current source before opening the window. This prevents new
model-picker assets from talking to an old in-memory provider registry.

The shared `/desktop/v1/responses` route authorizes custom terminals with the
registry-derived runtime and provider identity in addition to exact model,
adapter, protocol, and native-model constraints. Passing only the model and
protocol causes a false `terminal_capability_mismatch` even when the displayed
expected and requested model names are identical.

After local gateway authorization, Laravel resolves dynamic terminal models
through `CreditCalculator` and `OpenRouterPricingCatalog`. The calculator's
catalog dependency is required, not optional: nullable dependency injection
makes every provider-qualified dynamic model return `422 Unknown Vibyra
terminal model`. Catalog lookup self-heals by performing one synchronized
on-demand refresh when the cache is empty, stale, or missing the selected slug;
unknown slugs receive a short negative cache. This keeps the live desktop
picker aligned with backend billing for newly listed tool-capable models such
as DeepSeek and Grok without hard-coded model entries.

The current native managed-credit implementation is enabled for OpenAI,
Anthropic, Google, Qwen, Moonshot/Kimi, Mistral, and xAI Grok models. Codex uses
`model_provider="vibyra"` with the authenticated local Responses gateway.
Claude Code and Gemini CLI keep their native wire protocols and isolated
provider homes while the local gateway translates requests onto the metered
Vibyra/OpenRouter path. Grok Build uses an isolated `GROK_HOME`, the official
`grok` foreground executable, and a local OpenAI Chat Completions adapter. Its
fixed `grok-build` session-title request is accepted only as a native alias and
settled under the terminal's exact selected billing model. Qwen Code uses an
isolated `QWEN_HOME`, managed Node 22, and
`/desktop/qwen/v1/chat/completions`. Sandboxed Qwen launches forward the
terminal-scoped gateway token through Qwen's supported `OPENAI_API_KEY`
variable and use `host.docker.internal` because loopback is container-local.
The Qwen route accepts exact-token requests only from loopback or a detected
Docker bridge subnet, and native readiness includes the
`Type your message or @path/to/file` composer; otherwise semantic assignments
remain queued until timeout. Unsandboxed full access keeps the loopback
gateway. Kimi Code and Mistral Vibe use isolated
`KIMI_CODE_HOME` and `VIBE_HOME` profiles with
`/desktop/kimi/v1/responses` and `/desktop/mistral/v1/responses`. Models from
providers with no official CLI mapping use Vibyra Agent with an exact-model
gateway grant instead of falling back to a different provider CLI.
Vibe workspaces are explicitly untrusted in its isolated trust file so project
configuration cannot replace the Vibyra-owned provider contract.

Acceptance for mapped providers is the same native interaction shown by a
connected provider account, with auth/billing changed to Vibyra. Acceptance for
API-only providers is an explicitly labeled Vibyra Agent terminal with real
file/shell tools, shared truthful commands, permission modes, cancellation,
serialized input, and persistent resume. `aiTerminalOpenRouterCli.mjs` must not
copy a provider's native banners, tips, slash commands, or composer identity.

Provider account readiness has three independent states: CLI installed,
provider authenticated, and billing usable. Do not mark Claude Code or Gemini
CLI connected from executable presence alone. The stored OpenAI API key belongs
to deployment-owned Vibyra features such as voice; it does not authenticate a
personal Codex terminal, which requires ChatGPT auth in Codex CLI. Settings >
`AI accounts` owns installation, native provider sign-in, status, cancellation,
and disconnect for Codex, Claude Code, and Gemini CLI. The bridge exposes
`GET /desktop/provider-accounts` plus provider-scoped
`POST .../{login|cancel|disconnect}` routes. Login children strip inherited API
credentials; Codex uses `codex login`, Claude uses
`claude auth login --claudeai`, and Gemini uses its official Google OAuth mode.
Terminal setup keeps the Vibyra-credits versus personal-account choice and
links to Settings without silently changing the selected model or rewriting
unrelated terminal billing modes. Start with `providerAccountAuth.mjs`,
`providerAccountState.mjs`, `providerAccounts.mjs`,
`app.profile-ai-accounts.js`, and `app.terminals-models.js`.
Settings > `AI accounts` should show model chips only for models whose
terminal-native runtime can use that signed-in provider: Codex/OpenAI,
Claude/Anthropic, and Gemini/Google. When the terminal picker is in `My AI
accounts` mode, filter the model list to those login-capable families; API-only
or Vibyra-token-only providers such as DeepSeek, Qwen, Kimi, Mistral, and Grok
remain hidden there until personal-account support is actually implemented.
The Settings renderer must normalize legacy provider-account payloads that have
`connected` but no `status`; otherwise stale bridge state can show `Sign in
required` beside a `Disconnect` action. Provider-account login/cancel/disconnect
routes are local desktop routes and must not fall through to the phone bearer
token path that returns `Missing or invalid desktop token`.
Provider sign-in must produce a visible user path: the bridge opens the first
OAuth URL emitted by the official CLI in the system browser, and Settings keeps
an `Open sign-in page` fallback while the provider is connecting. Do not rely on
silent background CLI output alone. For Gemini/Google login, Vibyra must write
both `security.auth.selectedType = "oauth-personal"` and
`security.auth.useExternal = true` into Gemini `settings.json`; setting only
`selectedType` can leave the official CLI in an interactive auth prompt without
surfacing a browser page from the Settings modal.
Gemini provider-account login must launch the direct Gemini executable with a
writable stdin, not the Linux `/usr/bin/script` pseudo-terminal wrapper used for
full PTY terminals. The login flow emits `Opening authentication page in your
browser. Do you want to continue? [Y/n]:`; the bridge auto-confirms that prompt
once, which lets the official CLI call `xdg-open`/system browser with the
Google OAuth URL. Keeping stdin ignored or using the full-TUI wrapper can leave
Settings stuck with no visible Google sign-in page.

Codex is bundled as an exact app dependency and also supplies Vibyra Agent's
isolated non-interactive tool engine. Native Claude, Gemini, Qwen, Kimi,
Mistral, and Grok download actions live directly on their model-picker rows; there is no
separate Terminal tool panel. The picker retains each company's normal logo
and hides runtime implementation/status text. It shows only an icon button when
a CLI must be downloaded and a rotating icon while that download is active,
with accessible labels and tooltips. Do not bundle Claude Code by default
without explicit Anthropic redistribution permission.

The terminal AI model picker is intentionally organized as a compact custom
menu, not a raw provider dump. `desktop/assets/app.terminals-models.js` renders
one header with the active token source and model count, a short quick-pick
strip, searchable provider sections with counts, and compact model rows.
`app.terminals.model.1.css` owns the picker shell/quick picks; `.2.css` owns
row density. Preserve this structure for both setup and `+` new-terminal
model picking.

Vibyra Agent must replace the bundled Codex engine's model-visible base prompt
with a Vibyra-owned `model_instructions_file`. Every new and resumed turn also
passes `developer_instructions` containing the exact selected OpenRouter slug.
The remote model may know that Codex supplies hidden local file/shell
orchestration, but it must identify itself as the selected model running through
OpenRouter via Vibyra Agent, never as Codex, OpenAI, or a provider-native CLI.

Treat transport, identity, billing, and live behavior as separate acceptance
layers. A successful request or correctly branded banner does not prove that
the selected model received the right identity instructions. Before declaring
an API-only model fixed, verify all of the following:

- The authoritative session and gateway grant agree on the exact model,
  `vibyra-agent` runtime, and billing model.
- A captured outbound Responses payload contains the exact model, Vibyra-owned
  top-level instructions, and dynamic developer identity for that model.
- The backend settles the reservation under the exact selected model key.
- A fresh turn and a resumed turn identify the exact model, OpenRouter route,
  and Vibyra Agent runtime in the authoritative PTY transcript.

`billing_credits_exhausted` is a Vibyra account admission failure before
OpenRouter dispatch, not evidence that the native company CLI has an invalid
key. Keep zero-credit accounts fail-closed. The desktop gateway rewrites this
failure to name Vibyra tokens, include known balance/reset/window data, and
state that the company CLI key is not the problem. The protected Grok path was
live-proven with Grok Build 0.2.39, a disposable funded account, exact
`x-ai/grok-build-0.1` settlement, and a child environment containing only the
short-lived terminal gateway token rather than `OPENROUTER_API_KEY`.

Model self-reports, screenshots, release-date answers, HTTP success, and unit
tests alone are not routing proof because model output can hallucinate while
transport still succeeds. Changes to model-visible instructions or immutable
launch metadata must increment `AI_TERMINAL_LAUNCH_CONTRACT_VERSION` so
recovered workers cannot retain stale identity behavior. If live verification
fails before dispatch, first check backend migrations, account state, and the
active backend target rather than misclassifying an environment failure as a
provider-routing defect.

Detached provider child spawn is part of PTY creation.
`createPtyTerminal()` waits through
`waitForPersistentAiTerminalStartup()` until worker state contains
`status=running` and a provider child PID. An immediate worker exit removes the
failed session, revokes its grant, rolls back its workspace, and returns a
bounded startup error before semantic assignment. Personal provider sessions
also require the current launch-contract version during recovery. This prevents
a stale bridge plan, such as contract 23 against worker source contract 24,
from appearing later as `Terminal startup timed out` or
`AI provider has exited`. Runtime compatibility version 17 invalidates workers
created before this handshake.

Creation responsiveness is separate from provider readiness. The collection
route returns immediately after the authoritative child-PID handshake; it does
not wait for the provider's idle composer or initial assignment acceptance.
The renderer connects the PTY WebSocket before submitting the initial semantic
assignment, so native startup output remains visible while the assignment
queues safely in the worker. `spawnAiTerminalProcess()` must not execute a
synchronous provider `--version` probe on this path.
Loaded hosts can delay detached worker scheduling enough to miss a short child
PID handshake even when the worker is alive. The bridge uses a longer bounded
startup window and, if that still times out while the persistent worker state is
not exited, keeps the terminal session visible in `starting` instead of rolling
it back with `terminal_worker_startup_timeout`. Multi-terminal renderer
launches create visible terminal records immediately but stagger provider
starts, so native CLI cold starts do not all contend in the same microtask.

Codex startup can be blocked by its own interactive model-migration notice
before the composer exists. The launch path reads the selected model's current
`upgrade.model` from the user's `models_cache.json` and supplies Codex's
supported `notice.model_migrations={...}` override. This acknowledges the
notice while preserving the model the user selected; do not automate the menu
with blind terminal input. Personal Codex sessions still receive isolated
auth, config, memory, and state homes, while their plugin marketplace checkout
is linked from the existing user cache. Safe account-level startup files
(`models_cache.json`, `version.json`, `installation_id`, and migration markers)
are seeded into each home, and bundled Codex defers MCP tool schemas through
tool discovery without disabling configured servers. A cold four-terminal
June 11, 2026 benchmark showed first visible output for every terminal by about
1.0 second, compared with 11-13 seconds before this batch fix. Full composer
readiness measured about 12.3-13.8 seconds instead of roughly 20 seconds; the
remaining interval is Codex's own MCP connection phase.

Do not treat that isolated benchmark as a guaranteed user-facing result. A
later live four-terminal launch on the same date created all Vibyra sessions
within about 160 ms, but Codex produced first output only after about 21
seconds and reached authoritative ready state after roughly 26-39 seconds.
The host had an approximately 6.8 load average on 8 CPU cores and several
other Codex processes, so machine contention and network-dependent Codex/MCP
startup materially affect batch latency. This proves the bridge and renderer
are not the dominant delay, but it does not make the remaining delay
acceptable or unchangeable.

Future startup work should preserve native CLI functionality while evaluating:

- launch staggering or a bounded Codex startup queue to reduce four-way CPU,
  disk, database, and network contention;
- safe warm-process or prewarmed-runtime reuse if Codex exposes a supported
  session boundary that preserves per-terminal isolation;
- further reduction of repeated per-terminal state/database initialization;
- immediate mounted terminal presentation with accurate initializing state,
  independent of native composer readiness.

Benchmark both isolated and loaded-host four-terminal launches. Record child
spawn, first PTY output, native composer readiness, CPU/load, existing Codex
process count, and MCP startup status. Never attribute the result solely to
Vibyra or solely to user hardware without those measurements.

Terminal project selection in setup is a simple saved-project dropdown:
`app.terminals-project-discovery.js` locally filters known `currentState.projects`,
and `app.terminals-project-picker.js` renders one search input plus project
rows. Do not restore the synthetic `full-pc` row, native folder/file actions,
or async whole-PC search to this dropdown.

PTY-backed terminals must preserve mounted xterm DOM nodes across
`/desktop/state` refreshes. Patch status, helper text, active/hidden classes,
settings menus, terminal add/remove/reorder, and companion panels in place
instead of forcing a full content `innerHTML` render that disconnects xterm.
For performance with many open terminals, live PTY output/status updates should
use dirty-terminal patching in `app.terminals-pty-runtime.js` instead of full
topbar/page rebuilds or project-shell tab/rail reconstruction; hidden project,
focus, and fullscreen panes must not mount or fit xterms. Detached worker output
persistence is live-streamed to the renderer but disk-flushed through a short
debounce in `aiTerminalWorker.mjs` to avoid per-terminal write churn. Launch,
socket-open, and session patch paths should mount only the affected terminal,
repeated xterm fits should coalesce per terminal, and xterm themes should be
cache-keyed by the visible theme scope instead of recomputed on every mount.
Only projects that own at least one authoritative terminal appear beneath the
left-rail `Terminals` item. Recovered terminals keep their project rows across
app restarts, while removing a project's final terminal removes its row. The
selected project scopes the top terminal dock and visible focus/grid panes;
other project PTYs remain mounted with `.terminal-project-hidden`. The terminal
renderer maps all open terminal articles into the stage and only uses the active
project count for grid sizing and rail/tab copy; switching project tabs must not
prune inactive project articles or disconnect their xterm hosts. Fast project
tab activation must re-run `syncPtyTerminalGrid()` before visible xterms mount
or fit, otherwise the next project can inherit the previous project's grid
dimensions. The rail shows framework, terminal count, and derived
working/ready/attention/stopped state, remembers the last active terminal per
project, and hides nested rows when the rail collapses.
Terminal selection copy in `app.terminals-pty-runtime.js` uses xterm's
selection first, then highlighted DOM text inside the xterm element, and has a
capture-phase `Ctrl`/`Cmd`+`C` shortcut so `Ctrl+Shift+C` copies selected text
without breaking no-selection `Ctrl+C` interrupts.
The left-rail `Terminals` heading also owns a `New terminal group` plus action.
It opens a two-step project-workspace setup while current PTYs remain alive and
returns to the prior project on Cancel. Every setup starts with a dedicated
`Solo` or `Team` choice rendered as two spacious, flat side-by-side options
with one large semantic icon and outcome-based supporting copy. They have no
individual card surfaces, borders, shadows, divider, boxed icon backgrounds, or
directional arrows. Centered titles, generous whitespace, staggered entrance,
and a slight icon/choice hover lift provide hierarchy; disable motion under
`prefers-reduced-motion`. Solo is best for independent focused builds, fixes,
and quick changes and can launch `1–12` terminals with a truthful preview based
on the same grid geometry used after launch. Team turns one required goal
into `2–4` scoped roles: Builder + Reviewer, optionally Coordinator and
Verifier. The desktop bridge compiles a versioned trusted role policy and keeps
the user goal in separate untrusted assignment data. Exactly one Builder owns
production edits; support roles receive enforced read-only launch profiles.
Codex uses `developer_instructions`, Claude uses
`--append-system-prompt` plus Plan Mode and read-only tools, and Vibyra Agent
composes the role policy with its runtime identity. Gemini, Grok, Shell, and
unresolved Auto Team launches fail closed until they expose a verified trusted
role channel. Team ID, size, role, phase, capability, contract version, and
policy hash persist through bridge recovery. This is scoped
coordination, not a claim of automatic dependency scheduling, cross-terminal
messaging, merge completion, or reviewer-enforced gates.
`teamId` is an opaque correlation key rather than an authorization boundary.
The bridge preserves current `team-...` identifiers and deterministically
canonicalizes any non-empty legacy value into that bounded format, so renderer
version skew cannot make every member fail with `Invalid Team identifier`.
Missing IDs, invalid role topology, empty goals, and untrusted runtime channels
still fail closed.
Role contract V2 gives each worker a distinct concise workflow, forbidden
actions, evidence standard, and stopping rule. It explicitly states that roles
currently run independently in parallel, so Verifier and Reviewer must not
assume Builder output is visible.

For the researched provider-specific prompt contract and the work required to
make these roles genuinely sequential and enforceable, use these deep
references:

- `Desktop/AI Team Prompting Research.md`
- `Desktop/AI Team Role Prompt Specification.md`
- `Desktop/AI Team Orchestration Plan.md`
- `Desktop/AI Team Dynamic Planner Implementation Plan.md`

The current Team implementation still starts roles concurrently and does not
relay validated artifacts or Builder revisions. Do not describe Coordinator,
Verifier, or Reviewer as enforcing a real gate until the orchestration plan's
sequencing, authoritative state, and artifact requirements are implemented.
The reviewed dynamic-planner decision is deterministic policy plus GPT-5.4
mini for bounded decomposition, GPT-5.4 nano only for optional narrow
classification, and Ollama only as an explicit private mode. Planner output is
untrusted assignment data. Vibyra code owns role topology, capabilities,
permissions, trusted prompts, validation, persistence, and launch.
The Team renderer now posts the selected goal, size, project, model, and
truthful parallel execution mode to `/desktop/terminal-teams/plan` before
creating terminals. It keeps the setup mounted while showing an in-place
planning state, validates the returned goal and fixed topology, normalizes
assignments into deterministic role order, previews each bridge-specialized
title and one-line objective, then launches every role with that objective as
untrusted assignment data. A bridge-issued `teamId` groups the terminals;
`planId` is the compatibility fallback and is always persisted separately as
`teamPlanId`. Cloud authentication, quota, timeout, transport, or invalid-model
output falls back to a bridge-generated deterministic plan that passes the same
local invariants. A malformed desktop route response or renderer validation
failure creates no terminals and leaves setup available for retry. Renderer
planning state, bridge requests, validation, preview transitions, assignment
prompts, and plan-derived terminal creation live in
`app.terminals-team-planning.js`. Load it immediately before
`app.terminals-team.js`, which owns the fixed role catalog, recovery metadata,
setup markup, and active Team bar. The roles still start concurrently.
The planning preview and active Team bar must expose the authoritative plan
source. Show `AI-planned` with `plannerModel` only when `plannerMode` is not
`deterministic`; otherwise show `Built-in fallback` with the bounded
`fallbackReason`. Persist this metadata from the bridge-owned stored plan into
public PTY session state. A planning animation or generic role objective is not
evidence that the AI planner ran; zero credits, missing auth, timeout, provider
failure, an undeployed `/api/chat/team-plan` endpoint, or invalid output can all
produce the deterministic templates.

For `My AI accounts` Team setup with a Codex/OpenAI model, the bridge now uses
the connected Codex account to produce the strict structured assignment plan.
The planner runs ephemerally with an isolated `CODEX_HOME` containing only the
existing auth, ignores user config/rules, uses read-only mode, and validates
the proposal against the same bridge-owned topology and scope rules. Successful
plans persist as `plannerMode=provider`; timeout, auth, process, or semantic
validation failure stops setup instead of silently launching generic
assignments. The renderer must send `tokenMode` and the selected model to
`POST /desktop/terminal-teams/plan`. Vibyra-credit planning remains the cloud
`/api/chat/team-plan` path with a visibly labeled deterministic fallback.
The provider output schema is generated for the selected topology, including
the exact assignment count and allowed role keys. Because structured output
cannot express every semantic invariant, the provider planner validates the
proposal locally before returning it. A schema-valid failure such as
support-role write scope, duplicate roles, overlapping paths, or invalid
criterion references receives one complete corrective Codex retry with the
bounded validator reason. The retry is validated again and still fails closed
if unsafe; rejected scope is never silently sanitized or launched.

A shared progress rail names `Workspace`, `Setup`, and `Terminals`. Render it
once on the setup page, centered above and outside the setup card, never in the
terminal topbar. Use evenly centered nodes, labels beneath, one continuous
connector, completed-state tint, and a restrained active ring. Remove the rail
after launch so the terminal dock retains its compact project identity, add
action, tabs, quick actions, and options.

Step 2 keeps Solo direct: terminal count with `1/2/3/4/6/12` presets and a
bounded custom value, truthful grid preview, project, model, access, workspace
safety when applicable, reasoning, token source, and launch. Team is
outcome-first: it leads with `Describe the outcome`, one generous goal
textarea, and `Vibyra will plan the smallest useful team.` Project, Model,
Workspace safety, and Reasoning effort remain visible. Team size defaults to
`Automatic`; the optional `2/3/4` override, Access, and token source live in
collapsed `Advanced options`. Team does not expose the Solo arbitrary
count or grid preview and does not render generic role cards before planning.
While the authoritative request runs, transform the bottom launch action into
the compact live planning surface; do not insert a second activity strip near
the goal. Keep a visible secondary Cancel action beside it; cancellation must
abort the browser request and propagate through the bridge to terminate the
active cloud request or provider subprocess, then restore the editable form.
The planning action stays graphite rather than becoming a solid purple box and
uses a semantic sweep, expanding people-icon rings, pulsing dots, and short
copy transitions. Show only observable phases: request analysis while the
provider is pending, advance once at spaced elapsed-time thresholds from prompt
analysis to `Planning team roles` after about 3 seconds and `Assigning
individual roles` after about 7 seconds, then hold the last pending message
without looping. These are present-progress descriptions, not completion
claims. Response validation starts only after the provider returns, followed
by terminal preparation before launch. Clear every pending transition on
response, failure, or cancellation.
Store the current phase in renderer state, and while Team planning is active do
not let the periodic desktop-state patch replace the setup panel; otherwise
each refresh resets the visible copy to the initial analysis phase.
Do not show percentages or completion claims, and disable motion
under `prefers-reduced-motion`. After the authoritative plan returns, reveal compact
flat role rows containing only each generated title and one-line objective.
Team launch remains disabled until the goal is non-empty. An unassigned Team
gets its own left-rail group keyed by persisted `teamId`, a concise name
derived from the Builder assignment or shared goal, and the people icon rather
than Solo's General/folder identity. The disclosure describes only two payment choices: Vibyra tokens
use Vibyra credits and the backend-owned OpenRouter transport; My AI accounts
use the user's connected official account and its billing. OpenRouter is never
presented as a direct terminal billing source because the Vibyra gateway must
protect the provider credential and enforce account credits and quotas. The
disclosure uses an accessible button and an in-place
height/opacity transition, preserves its open state when setup preferences
patch the panel, and disables motion for reduced-motion users. It omits
provider implementation/status rows and does not repeat the selected mode or
render a second setup heading. Same-step option patches mark the replacement
panel stable so entrance animations do not replay; those animations are
reserved for actual Workspace/Setup navigation. The setup project selector
uses the same neutral field surface and hover treatment as the model selector.
The completed `Workspace` step provides Back navigation. Team workspaces retain
visible Safe mode. Setup selects an existing discovered project; it never
creates a filesystem project implicitly. Start with
`desktop/assets/app.terminals-team.js`,
`desktop/assets/app.terminals-team-setup.css`,
`desktop/assets/app.terminals-team-bar.css`,
`desktop/assets/app.terminals-pty.js`,
`desktop/assets/app.terminals-setup-flow.css`,
`desktop/assets/app.terminals-controls.js`, and
`desktop/assets/app.terminals-project-picker.js`. Validate with the terminal
asset test suite, especially `app.terminals-team.test.mjs` and
`app.terminals-setup-flow.test.mjs`. Once launched, a compact Team bar shows
the shared goal and only observed role states such as Working, Ready, Needs
attention, or Stopped. It must not invent percentages, merge state, or
completion claims.
`patchTerminalSetupPanel()` must synchronize the in-page progress rail and the
`terminal-setup-flow--mode` wrapper class when moving between Workspace and
Setup. The rail sits outside `.terminal-setup-panel`, so replacing only the
panel leaves Step 2 visibly marked as Step 1. Replace the rail only when its
`aria-current` step changes; ordinary Step 2 patches should not replay its
entrance animation.
Incrementally inserted `.terminal-notice` elements must immediately bind their
dismiss control through `bindTerminalNoticeControls()`. Dismissal clears local
notice state and removes the banner in place without remounting xterm.
Keyboard and paste input must have exactly one browser event owner.
`app.terminals-pty.js` delegates terminal input binding to `bindPtyInput()` in
`app.terminals-pty-runtime.js`; when xterm is available, only `xterm.onData`
forwards typed bytes. Attaching a bubbling `keydown` listener to the outer
`[data-terminal-input]` host as well causes every physical keypress to be sent
twice. The outer keydown/paste fallback is only for environments without
xterm and must become inert if xterm later becomes available. In Electron keep
xterm `screenReaderMode` disabled because its accessibility DOM can duplicate
keyboard input on Windows. If wrapper focus lands on `[data-terminal-input]`
while xterm exists, a capture fallback may refocus xterm and forward the current
printable key exactly once; events from inside `.xterm` still belong only to
`xterm.onData`. Ignore `onData` from detached or replaced xterm instances.
Selected xterm text copies through `attachCustomKeyEventHandler`, document-level
capture `copy`, xterm native `copy`, and the Electron
`vibyraDesktopClipboard` bridge; Ctrl/Cmd+C must still send an interrupt when
no xterm selection exists. Keep `desktop/assets/app.terminals-input.test.mjs`
passing whenever terminal input binding changes.
Saved screenshot Copy deliberately writes both native PNG data and a quoted
absolute path as clipboard text. Let xterm consume that text through its normal
paste path; do not add an image-specific keydown or paste listener to the
terminal host, because that would violate the single input-owner contract.
Screenshot drag uses the private
`application/x-vibyra-screenshot-path` browser drag type. The terminal host is
a drop target only for that type and calls `xterm.paste(path)` exactly once,
without Enter. Do not replace this with Electron `webContents.startDrag()`:
native file drag cannot supply the browser text payload required for terminal
path insertion.
Keep echoed keystrokes off synchronous persistence paths. The detached worker
broadcasts output immediately, batches transcript appends asynchronously, and
debounces ordinary `state.json` updates. Browser localStorage stores PTY
metadata only; the detached worker transcript is authoritative.
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
Provider CLI exit is not terminal death. `terminalSessionCommand()` in
`aiTerminalVibyraShell.mjs` must run the selected provider command without a
final `exec`, then print the `Project shell ready` marker, reset TTY modes, and
`exec $SHELL -i` so the same PTY remains a real project shell after `Ctrl+C`,
provider `/quit`, or a native CLI crash. The worker detects that marker and
sets `providerState: "fallback-shell"` while keeping `status: "running"`;
only closing/exiting the fallback shell should publish the terminal `exit`.
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
Codex's main chat uses an inline viewport regardless of alternate-screen
policy; alternate screen is reserved for overlays and pickers. Because the PTY
worker starts before xterm subscribes, `aiTerminalWorker.mjs` must answer the
first cursor-position query with the configured bottom row and insert the
matching cursor move into renderer output so Codex and xterm begin at the same
coordinate. Later live probes pass to mounted xterm; detached probes use the
worker's ANSI cursor tracker. Repeatedly answering every probe with the bottom
row corrupts Codex's inline reflow.
Batch terminal creation must also render and mount xterm before the PTY request
captures its initial size. Use an immediate microtask after synchronous render,
not `requestAnimationFrame`: launching Codex at the `100x30` fallback and
resizing later leaves its inline composer in the middle even when the final
backend geometry is correct.
Codex reserves two rows beneath its native status line. The renderer therefore
gives both xterm's internal buffer and create, resize, and recovered Codex
sessions two rows beyond the measured visible host. It expands the xterm root
by those exact cell heights inside the overflow-hidden host. Idle terminals
remain top-aligned so the empty reserve rows are clipped below the pane. When
Codex writes working, status, or approval content into either reserve row, the
renderer translates xterm upward by exactly two cell heights; it resets when
those rows become empty. This keeps the physical composer position stable
between idle and active states. Giving only the backend the extra rows corrupts active-turn progress
because Codex can address rows beyond xterm's buffer, producing clipped gray
blocks even when the idle composer appears correct. PTY measurement must remain
clamped to the visible host height rather than the expanded viewport so repeat
fits do not accumulate overscan. Claude, Gemini, and shell geometry remains
one-to-one.
Recovered terminals must not fit while Electron's document is hidden.
BrowserWindow begins at default bounds before the window manager restores a
maximized window; sending that intermediate size makes Codex permanently
reflow its inline viewport. Fit all mounted terminals once visibility returns.
Layout-driven resizing must also wait until pane geometry settles. The left
rail and right terminal workspace animate their grid columns, so sending every
intermediate `ResizeObserver` size repeatedly reflows Codex and can leave its
inline composer in the middle of the pane. Keep launch sizing immediate, but
debounce later observer/sidebar fits and send one final xterm/backend resize
after the host stops changing.
Codex 0.138 can still clear and redraw its inline viewport from the top after
that final `SIGWINCH`, without issuing another cursor-position query. After
each Codex write, measure the last non-empty xterm screen row and translate the
surface down by exactly its trailing visible blank rows. Keep that bottom
anchor offset additive with the fractional paint inset and subtractive from
the existing two-row overscan lift. Do not apply this visual re-anchor to
Claude, Gemini, or shell terminals.
PTY output auto-follow is user-scroll aware. Capture
`terminalPtyViewportIsNearBottom(xterm)` before live writes, snapshot resets,
and focus repositioning, then pass that decision into `positionPtyViewport`.
Only scroll to bottom when the user was already near the bottom; otherwise
preserve their scrolled-up viewport while the terminal continues working. Keep
Auto-deciding terminals top anchored.

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

The terminal page has one persistent icon-only sidebar launcher in the
top-right shell actions, including setup when no terminals exist. It opens one
resizable right workspace with Editor, Preview, AI, and Memory modes. Switching
modes replaces only workspace content; the terminal stage and xterm sessions
remain mounted and visible on the left. Preview controls live inside that
workspace rather than replacing the desktop top navigation. On narrow windows,
the workspace overlays from the right instead of shrinking the terminal below
its usable floor. Chat threads remain in-memory and scoped per terminal id so
switching terminal/project context does not mix conversation history.
The workspace begins with one segmented Editor / Preview / AI / Memory bar and
an adjacent close action. It has no separate `Workspace` title or repeated
terminal/project subtitle; active context remains inside the relevant mode.
The switcher, Editor file tabs, and active-file toolbar share one neutral
workspace chrome family and divider token. Active modes/files use only a thin
purple edge plus a quiet connected surface; do not stack unrelated black,
purple, and editor-gray header bands or use a large purple active block.

Terminal light-mode ownership is centralized at the end of the stylesheet
cascade in `app.terminals-theme-audit.css` and
`app.terminals-workspace-theme-audit.css`. Those sheets convert legacy
feature-level dark literals to semantic `--terminal-*` surfaces for setup, PTY
controls, Editor chrome, Preview startup, and fullscreen Memory. Keep them
after every terminal feature sheet in `desktop/app.html`. Xterm reads semantic
ANSI and selection tokens through `terminalXtermTheme()`, while Monaco defines
paired `vibyra-dark-plus` and `vibyra-light-plus` themes. Both mounted
renderers observe explicit appearance changes and OS color-scheme changes
while appearance is `auto`; changing theme must not remount or reset a PTY or
editor model. Validate with `app.terminals-theme-audit.test.mjs`, the desktop
AI suite, and a real Chromium render of setup plus Editor/Preview/Memory.

When reporting a broad terminal audit, never say every problem was found unless
every reachable terminal state, provider TUI, responsive layout, workspace
mode, modal, and theme transition was actually exercised. State exactly which
surfaces were verified, name any untested or externally owned provider states,
and describe remaining risk. Passing tests and representative screenshots prove
the covered paths only; they do not justify an absolute completeness claim.
Do not render AI, Voice, Memory, Preview, or project quick actions beside the
terminal tabs. The sidebar launcher toggles the whole workspace and opens AI by
default.
Editor is a mode of the existing terminal right workspace. Xterm registers a
link provider for source-like paths and opens the selected file, line, and
column without rewriting PTY output. `app.terminals-editor-state.js`,
`app.terminals-editor-view.js`, `app.terminals-editor-monaco.js`, and
`app.terminals-editor-runtime.js` own its tabs, explorer, Monaco models, dirty
state, save/revert behavior, disk refresh, and link parsing;
`app.terminals-editor.css` owns the VS Code-inspired workbench. Monaco is a
local app dependency served only from `/desktop/vendor/monaco/vs/`; do not
replace the center with a textarea or CDN runtime. Preserve models and view
state across companion remounts while disposing the active editor instance.
`terminalEditor.mjs` serves terminal-scoped file lists, reads, and
revision-checked saves from the authoritative session `cwd`, so Safe mode edits
remain inside that terminal's worktree. Reject path and symlink escapes,
ignored generated directories, binary/oversized files, and stale saves.
Opening Editor immediately loads the active terminal's Explorer tree; it does
not wait for a hyperlink click. The tree follows active terminal changes and
lists normal files, assets, and dotfiles while excluding generated directories.
Explorer folders start collapsed. Editor uses the shared companion default and
persisted resizer width; it must not override the page grid with a wider
mode-specific percentage.
The file sidebar has one compact directory-path header only; do not repeat an
Explorer title, agent name, branch, or separate workspace subtitle.
Keep that path header free of an always-visible refresh button because it
collides visually with open file tabs at narrow companion widths. File-tree
load errors may still show an inline Retry action.
Opening, switching, or closing Editor must not remount xterm.
Keep the generic desktop static-file fallback limited to one path segment
(`/desktop/<file>`). Nested `/desktop/...` API misses must reach the normal JSON
404 response; otherwise an old or missing Editor route is misreported as an
`ENOENT desktop/files` filesystem error.
Preview is exposed only by the Editor / Preview / AI / Memory switcher
inside the right workspace; do not add Test or Preview to the terminal dock or
project quick actions. `app.terminals-test-state.js`,
`app.terminals-test-view.js`, and `app.terminals-test.js` own its state,
markup, and lifecycle. It keeps the terminal/setup stage mounted and previews
projects or explicit HTTP(S) URLs across common phone, tablet, laptop, desktop,
Full HD, rotated, and custom dimensions.
The Preview UI uses one compact toolbar: project, short state chip, grouped device
selector with quiet Auto marking, rotation, Fit/zoom, hidden address editing,
and refresh. The preview remains inside Vibyra and stays the visual focus;
there is no external-browser action, permanent URL field, second device row,
or footer status strip. Zoom belongs in the Preview toolbar so the canvas
contains only the preview frame and its loading state. Startup stays inside the selected frame as a
Vibyra-branded progress overlay with concise status, a `View command`
disclosure, failure text, and Retry. The preview console is a full-width dock
below the canvas with persisted height, a top-edge height handle, an explicit
close control, an issue-focused count, Copy, Clear, and one `Fix with AI`
action per
warning/error. That action leaves Preview and submits the individual diagnostic to
an idle terminal already bound to the preview project, or creates a new
project-bound terminal with the diagnostic as its initial assignment. It must
not stage a desktop Chat draft.
PTY/xterm panes are edge-to-edge in focus and grid layouts. Keep
`.terminal-xterm` padding at zero and let xterm retain its calculated
`.xterm-screen` height; only the viewport should be forced full height so
native composer and status rows stay anchored to the terminal bottom. Grid
mode also keeps stage gap, tile radius, and tile outer border at zero. Six
terminals use a balanced `3 x 2` grid. `app.terminals-pty-runtime.js` fits a
mounted xterm from its real rendered CSS cell dimensions and viewport client
size, counting only fully visible rows instead of rounding pane height up;
rounding up can clip the bottom row in tall one- and two-terminal panes. Grid
tiles and PTY hosts use paint containment plus hidden overflow so an over-tall
native screen cannot draw across the next pane header.
Pointer or keyboard focus inside a PTY must also update `activeTerminalId` and
patch the active pane classes in place. The selected provider-colored edge must
follow the terminal receiving input without remounting xterm; header-only
selection is not sufficient.
Desktop project previews use `POST /desktop/preview`; starting a recognized dev
server uses `POST /desktop/preview/start-server` only after a visible
confirmation. The bridge issues a short-lived project-scoped capability from
`previewCapabilities.mjs` instead of exposing the phone bearer token. The
renderer maps same-bridge previews to `preview.localhost`, which keeps normal
web storage available while `desktopUiAuth.mjs` rejects that origin from
privileged desktop routes. Native desktop APIs and executables are outside this
browser preview contract.
`previewRecommendation.mjs` derives Test's initial viewport from project
analysis plus package/app/PWA manifests. Mobile apps default to iPhone,
websites to laptop, SaaS and desktop renderers to desktop, and browser games to
Full HD; explicit portrait/landscape metadata rotates the base preset. The
renderer marks the result `Auto` and lets manual device, dimension, or rotation
changes take over immediately. Detection never bypasses approval to start a
development command.
Keep the terminal add button, terminal tabs, and options button in one centered
content-sized dock. The tab list grows only with its tabs up to its scroll cap,
so a one-terminal session stays compact; Vibyra AI remains a separate
top-right shell action.
The terminal page uses one flat terminal dock and one terminal stage. Do not
render a separate project navigation row above the panes. Every open terminal
remains reachable from the top dock and visible in grid mode; project identity
stays in terminal setup, header metadata, and details.
The terminal setup contract is defined earlier in this note. Preserve its
flat Solo/Team choice, in-page progress rail, combined Step 2, visible reasoning
effort, collapsed token-source disclosure, and absence of an initial-goal
field. Preserve the terminal surface and tabs during visual cleanup; the
three-dot options menu owns the labeled Project, Workspace, Access, optional
path detail, inline rename, and separated Close terminal action. Token source
stays in setup's Advanced options and is not shown in the per-terminal menu.
New terminals receive a persisted short common human name. Focus and grid pane
headers show that name with the current agent identity and quiet per-pane
full-screen, details, and close controls. Full-screen hides sibling panes
without unmounting xterm; Escape restores the layout. Running/contextual closes
retain confirmation, and Safe mode remains the recommended multi-terminal
workspace default. Start in `app.terminals-window.js` and
`app.terminals-window.css` for this behavior. The selected terminal uses its
provider accent for a crisp inset edge, subtle header tint, and title emphasis;
keep the treatment glow-free and layout-stable.
Terminal token source is an execution contract, not display metadata.
Downloading a CLI changes availability only; it does not prove adapter
readiness. Vibyra-credit sessions persist separate billing, provider, runtime,
protocol, native-model, billing-model, permission, sandbox, and
contract-version fields. A registered provider's genuine native CLI owns the
foreground PTY. A tool-capable provider-qualified model without an official CLI
mapping receives runtime `vibyra-agent`, adapter `responses`, protocol
`openai-responses`, and an exact one-model billing grant. Its foreground process
is the bundled Vibyra Agent client; an isolated Codex `exec --json` subprocess
provides the tool loop without owning or imitating the visible provider TUI.
`aiTerminalLaunchOwnership.mjs` validates both foreground modes and rejects
altered entry arguments, stale contracts, one-shot native replacements, and
provider/runtime mismatches. Blank Auto opens as an authoritative Vibyra
waiting session with no project requirement, provider worker, launch plan, or
gateway credential.
`desktop/lib/aiTerminalAutoWaiting.mjs` owns its intro, prompt, local echo,
backspace, paste, and first-line capture. The first raw xterm line or semantic
assignment constrains routing to runtime-plus-adapter-ready providers, resolves
and persists the concrete launch descriptor before worker creation, launches
the selected native CLI under the same terminal ID, waits for its real idle
composer output, and writes the prompt once. A spawned process is still
`starting`; marking it `ready` before the composer appears can acknowledge
input that Codex discards during initialization. The renderer must not issue a
second `/assign`. Routing or authentication failure restores the `❯ auto`
prompt for retry instead of exiting the session.
`POST /desktop/v1/responses` bridge authenticates through the desktop account
token and proxies to backend `POST /api/codex/responses`, which streams
OpenRouter's Responses API and ledger-charges membership credits from the final
usage event. The session keeps `requestedModel: auto` for provenance while its
visible model and title change to the concrete routed model.
All account-authenticated desktop consumers use `desktopAppApiUrl()`: account
verification, Auto routing, desktop chat, project memory, Responses, Anthropic,
and Gemini proxies must target the same backend. Do not add independent
localhost defaults to terminal proxies. A valid production account token sent
to a local Laravel database returns `401` before OpenRouter is reached and
looks like an expired-login or missing-provider-key failure.
Any backend `401` from Auto routing, desktop chat, Responses proxying, or
desktop-session verification clears the bridge account immediately. The
renderer must not expose authenticated UI until `/desktop/session` succeeds.
Runtime ownership lives in `aiTerminalRuntimeCatalog.mjs`,
`aiTerminalRuntimes.mjs`, and `aiTerminalRuntimeRoutes.mjs`. Codex is pinned in
the app dependencies for OpenAI terminals and Vibyra Agent's internal tool
engine. Claude, Gemini, Qwen, Kimi, and Mistral are explicit managed downloads
under `~/.vibyra-agent/runtimes/`; native CLIs are not enabled for Vibyra
billing until their authentication, protocol, cancellation, tool, sandbox, and
billing smokes pass. Unknown provider-qualified models may use Vibyra Agent only
when the terminal catalog confirms tool support. Unqualified unknown models,
missing engines, unsafe launch metadata, and cross-provider grants fail closed.
Do not bundle Claude Code by default without Anthropic redistribution
permission.
The local Responses gateway uses short-lived terminal-bound bearer credentials
from `desktop/lib/terminalGatewayAuth.mjs`. Only token hashes and constraints
are persisted in mode-0600
`~/.vibyra-agent/terminal-gateway-auth.json`; issuance, verification, individual
revocation, and terminal-wide revocation survive bridge restarts. The route
requires both loopback transport and a valid token, then enforces optional
model and per-minute request constraints. It never delegates to
`authorizeDesktopUi` or trusts a missing Origin header as spending authority.
The raw gateway token exists only in the private mode-0600 detached-worker
config/environment, never in public PTY session payloads, and is revoked by the
worker itself whenever the provider exits or worker shutdown begins. Bridge
close/exit revocation remains defense in depth. The detached worker renews the
same scoped record every six hours while the terminal remains alive so a
persistent terminal does not expire after twelve hours. Renewal does not widen
models, runtime, provider, adapter, protocol, native/billing model, or
request-rate constraints.
`terminalSessionCommand()` exits with an AI CLI instead of falling through to
an unrestricted project shell. Explicit `shell` sessions remain interactive.
Persistent configs carry runtime contract version `18`; restoration terminates
older Vibyra wrapper workers rather than reconnecting them after an upgrade.
The Responses proxy propagates local client disconnects to the backend fetch
through `AbortController` and contains upstream stream errors. The backend
normalizes missing function-call `call_id` values and records completed,
failed, incomplete, disconnected, error, and terminal-less EOF outcomes
separately instead of treating every EOF as success. Provider-specific native
tool-type translation remains unimplemented; validate that boundary with a
real paid two-round tool call before claiming every OpenRouter model is fully
compatible.
The dynamic terminal model catalog in `desktop/lib/openRouterModels.mjs`
requests and locally requires OpenRouter `supported_parameters` to contain
`tools`; missing capability metadata fails closed for concrete terminal models,
while `Auto` remains available for pre-execution routing. The shared backend
pricing snapshot preserves normalized `supported_parameters` for every chat
model, and `OpenRouterPricingCatalog::supportsTerminalToolCalling()` is the
terminal-only fail-closed helper. It is intentionally not a global chat filter;
the Responses controller must check the resolved concrete Auto model when that
request path adopts enforcement.
The isolated Vibyra `CODEX_HOME` must not copy auth, user config, plugins, or
skills, and the environment strips inherited provider credentials. It does
write a mode-0600 Vibyra-owned `config.toml` containing only the active
terminal workspace's trusted-project entry. Selecting a workspace in Vibyra is
the trust decision; without this minimal config, native Codex shows its
directory trust prompt on every fresh isolated terminal. Apply the same
isolation to Vibyra Agent's internal engine; the foreground runtime receives
only its terminal-scoped gateway credential and exact selected model. The
custom Codex provider declares that credential through
`model_providers.vibyra.env_key`. Codex shell tools exclude it with
`shell_environment_policy.exclude`, and direct Vibyra Agent `!` commands run
from a copied environment with the token removed.
The local Responses path requires `chat_cost_reservations`, weekly quota
columns, OpenRouter reservation totals, and a reservation status that accepts
`settling`. Additive billing migrations must guard individual columns because
partially upgraded SQLite databases can contain only part of an older migration.
Use `.agents/skills/vibyra-ai-terminal-diagnostics/SKILL.md` for this boundary.
A valid fix separately verifies visible runtime ownership, agent capability,
and billing/auth routing, then inspects the live authoritative PTY transcript.
Tests or cosmetic provider-name replacement are not proof.
`My AI accounts` exposes OpenAI, Anthropic, and Google models backed by their
installed official CLIs, including qualified IDs from those three official
providers. OpenAI requires ChatGPT-authenticated Codex; installed Claude Code
and Gemini CLI own their native sign-in and billing flows. API-only provider
slugs and Vibyra Agent stay unavailable in that mode and never impersonate
native CLIs. The PTY
bridge independently derives the agent from token source and rejects
unsupported combinations. Existing recovered workers keep their persisted
agent/source until closed; enforce this contract on new launches.
Membership model-tier locks apply only to `Vibyra tokens`. `My AI accounts`
must keep provider-supported native models selectable regardless of the
Vibyra plan because the provider account owns entitlement and billing.
Vibyra-funded terminals remain exact-model capabilities: the local gateway
rejects native `/model` switches, and Laravel independently applies
`CreditCalculator::planAllowsModel()` before reserving credits. The current
billing config gives every paid plan all model tiers, so this lock materially
distinguishes Free from paid accounts. The authenticated account payload also
exposes `maxConcurrentAgents`, `maxActiveProjects`, and `contextTokenCap`.
Desktop rejects new Vibyra-funded PTYs at the terminal cap before provider
startup, while Laravel transactionally rejects overlapping pending/settling
`desktop-terminal` reservations across devices. Personal-account terminals are
exempt. Free keeps one foreground Vibyra terminal for the supported budget
workflow, but legacy/background agent runs honor its configured zero allowance.
Local admission includes pending launches, preventing parallel project-memory
or worktree preparation from racing past the cap.
Managed project caps apply only to new folders under
`~/Desktop/Vibyra Projects`; existing managed projects and arbitrary opened
repositories remain usable. Count-and-create is serialized by a root lock file
across desktop processes, and symlink entries count conservatively. Context
caps run before reservation/provider
dispatch and clip output to the remaining allowance or return
`membership_context_limit` when the endpoint minimum cannot fit. Native
protocol adapters forward the clipped output value upstream, and Deep Research
retry instructions consume the existing context allowance rather than
restoring a larger output budget.
Terminal gateway grants fail closed unless every model/runtime/provider/
adapter/protocol/native-model/billing-model constraint is present. Expired
grants cannot be renewed, and Auto grants include the native alias without
widening the billing model.
Dynamic OpenRouter pricing also fails closed for membership and admission.
Missing or invalid prompt/completion prices are premium in both the desktop
picker and backend tier resolver rather than becoming zero-cost budget models.
Credit reservations and provider `max_price` constraints use the conservative
default fallback for an incomplete token-price pair. Explicit complete
zero/zero pricing, including genuine `:free` models, remains free.
Setup preference changes patch only `.terminal-setup-panel` through
`app.terminals-setup-stability.js`. Keep the outer `.terminal-setup` and its
right-side companion mounted and preserve setup scroll. Safely center the panel
inside `.terminal-setup-stage`; oversized configurations scroll within that
stage without shifting or clipping the companion.
The outer setup grid mirrors the opened-terminal grid: `.terminal-setup-stage`
owns center padding/scrolling and the companion remains full-height against the
right edge. `app.terminals-companion-context.js` maps the selected pre-launch
project into the active companion tools without changing the private `"setup"`
chat/action scope. Companion entrance animation is initial open only; state
updates must not replay it.
The setup model picker is a fixed overlay positioned by
`app.terminals-layout.js`. It anchors to the model button, clamps before the
right companion, always opens below the button, and constrains its scrollable
list to the remaining viewport height. It never participates in setup card
layout or flips above the field.
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
Keep Vibyra identity and the Chat / Talk switcher on one compact row at the
normal 360px overlay width. Empty Chat uses one concise invitation, two
lightweight one-line actions, and a visually dominant bottom composer rather
than nested prompt cards. Talk uses an open voice canvas with one authoritative
phase/status treatment and a flat transcript; do not wrap it in another large
card or repeat `Ready` across the phase, status, and conversation header.
Talk to Vibyra is an internal AI surface selected through the compact
Chat / Talk switcher; it is not a standalone companion mode. `/voice` and
`Alt+V` open the AI tab in Talk state. The voice recorder, transcript, action
routing, and speech playback modules remain unchanged and bind inside the AI
surface.
The companion frontend presents Vibyra AI as the assistant for the whole
desktop app. Never label it as limited to the active terminal or display
`Using context from...`; terminal and project identifiers may still be passed
quietly for routing and relevant answers.
Keep the companion Chat CSS/JS versioned in `app.html` so a
running Electron renderer cannot retain the pre-polish assets after a reload.
Do not show persistent local-model installation or availability copy in the
composer; keep the panel neutral and report an actionable runtime error only
after the user sends a request.
The companion shell keeps two explicit rows: the workspace switcher and one
full-height active section. AI owns its own compact identity/Chat-Talk row and
full-height Chat or Talk surface; Memory remains a separate workspace mode.
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
Native color must originate from the provider CLI, not renderer rewriting.
The desktop process may inherit `NO_COLOR=1`, so every PTY launch removes it
and explicitly sets `TERM=xterm-256color`, `COLORTERM=truecolor`,
`CLICOLOR=1`, `CLICOLOR_FORCE=1`, and `FORCE_COLOR=3`. When terminals look
white, inspect raw session SGR sequences first: style-only codes with no
foreground-color codes prove launch-time color suppression. Existing workers
retain their original environment and must be reopened to adopt this contract.
Validate the contract with temporary native sessions and inspect raw output,
not screenshots alone. Codex, Claude, and Gemini have been confirmed to emit
real `38;5` or `38;2` foreground-color sequences after this environment fix.
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
route forwards it, and each native runtime receives its own verified launch
mode: Codex `--dangerously-bypass-approvals-and-sandbox`, Claude Code
`--dangerously-skip-permissions`, and Gemini CLI
`--approval-mode yolo --no-sandbox`. Strip an `openai/` OpenRouter prefix
before passing the selected model to Codex CLI.
Manual Solo/Team setup also exposes one persisted Access choice for the whole
new batch. Full access is selectable for concrete Codex, Claude, Gemini, and
Vibyra Agent runtimes; unresolved Auto and shell sessions remain Standard.
Provider adapter permission/sandbox capability lists are the backend authority
for this boundary. Launch contract version `25` invalidates workers created
before current native provider ownership and permission metadata were part of
the immutable plan.
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
Public sessions expose `providerState` as `starting`, `ready`, `busy`,
`fallback-shell`, or `exited`; raw `/input` remains separate for ordinary
keyboard/PTTY traffic. Assignment timeout sends a cancel message so work still
queued in the worker is not executed later.

Home terminal activity is provider-driven, not an elapsed-output lease. The
detached worker broadcasts `busy` when semantic or keyboard work is submitted
and restores `ready` when the provider returns to its idle prompt. Codex uses
its spinner/plain terminal-title transition plus idle composer markers;
Vibyra/Claude/Gemini use their restored prompt markers. The renderer mirrors
those signals so terminals detached before this protocol shipped also update
without destroying their conversation. Worker snapshots must publish session
changes after applying `providerState`, even when snapshot output is unchanged.

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
Semantic assignments preserve multiline prompts through bracketed paste for
the real Vibyra Codex TUI and directly visible provider CLIs.
Preserve active creates and recently starting sessions during collection
reconciliation. Never persist or replay `initialPrompt`, because recovery must
not rerun agent work.

Auto terminal routing is a real prompt-classification backend decision, not a static
`auto -> gpt-4o-mini` alias. `backend/app/Services/AutoModelRouter.php`
classifies the original user prompt before desktop project/profile/memory
context is appended, selects an exact OpenRouter slug, and falls back to the
strongest plan-allowed model. Current specialties are: Gemini 3.1 Pro Preview
for visual/frontend and research reasoning, Claude Sonnet 4.6 for large-context
multi-file analysis, Claude Opus 4.8 for difficult review/debug/architecture,
GPT-5.5 for agentic implementation, and Gemini 3.5 Flash for focused fast work
or free-plan fallback. Manual model selections and skill-owned tool models
bypass Auto routing. Both JSON and stream responses return `autoRouting` plus
the actual `modelKey`; billing and memory record the actual selected model.
For the Vibyra Auto terminal client, the route-only endpoint accepts an
`allowedProviders` constraint derived from native runtimes whose Vibyra adapter
is ready. Blank Auto already has an authoritative Vibyra PTY session, but no
provider worker exists yet. On its first prompt, choose the concrete model,
persist the immutable launch plan, rename the tab, launch the native CLI under
the same terminal ID, then run the original prompt exactly once. The waiting
prompt is only a pre-provider input layer; it must not become a hidden
long-running model wrapper. Do not add a paid classifier call or a second prompt
submission after routing. OpenAI/Codex, Anthropic/Claude, Google/Gemini, Qwen
Code, Kimi Code, Mistral Vibe, and Grok Build have managed-credit adapters.

The Auto waiting presentation is keyed by the authoritative
`autoAwaitingTask` session field. `app.terminals-pty-runtime.js` patches
`.terminal-auto-waiting`, provider classes, and the visible model chip in place
without remounting xterm. `aiTerminalVibyraLogo.mjs` owns the static straight,
symmetric 3D ANSI V and its fixed-geometry color frames. During first-task
routing, `ptyTerminals.mjs` clears visible content plus scrollback into that
dedicated screen, anchors the Vibyra title on the terminal center row, persists
one initial frame, and publishes home-position redraws ephemerally. The logo
geometry remains fixed while a diagonal truecolor wave crosses its face/depth
cells and one spark moves through a fixed-width signal track. The loop restores
the cursor and stops before a provider starts; a bounded 960 ms minimum ensures
at least four frames are visible even when routing is fast. Animation ticks do
not enter recovery snapshots. Routing failure clears and redraws the normal Auto intro
with the error rather than appending beneath the animation.
`app.terminals-auto-polish.css` owns only the
idle readiness pulse and must not add a watermark, orbit, or pseudo-element
mark over the PTY.
`app.terminals-chrome-polish.css` owns
paint-only terminal chrome, focus, notice, and setup transitions. Both disable
motion under `prefers-reduced-motion` and must never transform or resize xterm.

If Responses requests show generic high-demand copy, inspect
`backend/storage/logs/laravel.log` before treating it as provider capacity. An
existing June 9 database could lack `chat_cost_reservations.meta` because the
create migration was edited after it ran; additive migration
`2026_06_09_000012_add_meta_to_chat_cost_reservations_table.php` repairs those
installations without resetting user data. The same legacy schema may reject
the newer `settling` reservation state; migration
`2026_06_09_000013_widen_chat_cost_reservation_status.php` replaces the stale
enum constraint with the application-owned status string contract.
For terminal 429s, inspect `GET /desktop/state` before the local backend
database because Desktop normally targets the production API. The returned
`desktopAccount` is authoritative for plan and quota windows. Free-plan policy
allows 15 credits per five-hour burst window and all 50 monthly credits in the
weekly window; the monthly credit and USD ceilings remain the final limits.
Responses billing failures preserve `error.code` and optional details so quota
rejections are distinguishable from provider rate limiting.
Native Codex retries HTTP 429 and 422 Responses failures and eventually hides
their useful body behind `exceeded retry limit`. The local
`desktopCodexResponses.mjs` compatibility proxy translates only Vibyra
`billing_*` failures to plain-text HTTP 400 for the native TUI. JSON error
envelopes are printed verbatim by Codex, and an error-only stream is treated as
disconnected. Billing code/status stay in response headers; genuine provider
429s remain 429. The local proxy enriches legacy `billing_usage_cap` responses
from authoritative `desktopAccount` burst/weekly usage and reset timestamps.
Codex 0.138 exposes `--no-alt-screen` for inline PTY sessions. Embedded launches
and the ownership guard require that supported flag; passing
`-c tui.alternate_screen=...` can be parsed as a TOML unit value and exit before
the composer appears.
Codex tool schemas cross a PHP JSON boundary in
`CodexResponsesEndpoint`. Normalize empty schema maps back to JSON objects
before provider dispatch; without this, a valid `properties: {}` becomes
`properties: []` and OpenAI rejects the native CLI request. Provider failures
also surface nested OpenRouter error details and log the sanitized provider
error so generic `Provider returned error` copy is diagnosable.

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

Vibyra-credit model pickers keep native-provider models visible while their
gateway adapters are being completed, but do not label those rows `Vibyra
unavailable`. Backend launch validation remains fail closed until the selected
provider adapter passes its release gates. Auto itself is always selectable
with Vibyra tokens and opens without a project; provider validation occurs when
the first prompt is routed.

Renderer launch scheduling must not depend on xterm mounting succeeding.
`queueStartPtyTerminal()` calls `startPtyTerminal()` immediately, before any
`requestAnimationFrame` work. Xterm mounting is deferred best effort; otherwise
a hidden/throttled renderer or one xterm exception can leave a local terminal
queued/loading forever without any authoritative server session. The create
request has a bounded abort timeout and converts timeout/failure into an exited
terminal notice instead of an indefinite pending state.

Native TUI geometry is synchronized across three owners: the backend session,
the kernel PTY, and xterm. Session patches retain authoritative `cols`/`rows`;
xterm is created at that saved geometry before transcript replay, then fitted
to the visible pane. Socket open forces a resize confirmation, and later fits
skip the backend call only when both xterm and the session already match.
Focus, input, live output, and replay completion return xterm to the bottom so
Codex, Claude, Gemini, and managed-provider composers remain visible. Terminal
focus styling uses `:focus-within` because xterm's hidden textarea owns focus.
Rounded xterm rows can exceed a pane by part of one CSS cell at some fullscreen
or grid aspect ratios. The renderer measures that fractional pixel overflow
from the visible host pane, extends xterm by the guard amount, and does not use
stale internal viewport dimensions or lift the entire terminal for fractional
inset.
It also reserves a three-pixel paint guard so pane containment, focus edges,
and the fullscreen window boundary cannot cover the final glyph pixels when
row geometry fits exactly. This correction does not alter PTY rows and remains
separate from Codex's dynamic two-row overscan.

Recurring diagnostic lesson: when Codex and Claude both look only slightly
clipped, treat that as shared renderer geometry until live measurements prove
otherwise. Reproduce the exact fullscreen/grid layout and compare tile, host,
xterm root, viewport, screen, cell height, row count, transform, and bottom
edges before editing. Do not begin with provider-specific fixed pixel guesses;
they can hide the symptom at one aspect ratio while failing at another. A
visual fix is complete only after a live post-reload geometry probe plus the
terminal regression suite.

Runtime readiness is checked centrally by renderer `createTerminal()` before a
local terminal record is inserted, so setup clicks, desktop actions, task
batches, and permission relaunches cannot manufacture a loading-only terminal.
Blank Auto is the exception to concrete runtime validation: it opens a
bridge-authoritative Vibyra waiting session and defers provider selection until
the first prompt. Concrete Vibyra-token models require both an installed native
CLI and a ready billing adapter. Model rows show a download icon, then a
rotating icon during the five-minute-bounded install request, then no
installation or runtime badge once available. Internal managed-credit adapter readiness
is never presented as installation/account state. Token mode never changes
implicitly. Claude and Gemini managed-credit launches run their genuine native
CLIs with terminal-scoped gateway credentials, not personal provider
credentials. Claude uses an isolated `CLAUDE_CONFIG_DIR` with onboarding and
workspace trust pre-completed. Gemini uses an isolated `GEMINI_CLI_HOME`,
enforced `gemini-api-key` auth, a Vibyra-owned `GOOGLE_GEMINI_BASE_URL`, and
session-scoped workspace trust. Gemini CLI 0.46 supports gateway transport but
its interactive validator rejects `gateway` as a selected auth method; API-key
auth still sends the terminal-scoped credential only to the custom local
gateway. This prevents first-run and login dialogs without using a personal
Google account. Persistent managed Gemini workers carry a scoped
`geminiProfileVersion`; profile changes invalidate only older Gemini workers
on bridge recovery rather than restarting unrelated provider terminals.

Desktop translates Anthropic Messages and Gemini GenerateContent through the
deployed `/api/codex/responses` billing gateway, then translates streamed
text/tool events back to each native protocol. This keeps Desktop functional
against the production API without requiring a synchronized new backend route.
When replaying native multi-turn conversation history into Responses, prior
assistant text is still request input and must use `input_text`. Using
`output_text` inside the next request works for the first turn but OpenRouter
rejects later Gemini and Anthropic prompts as an invalid Responses request.
Exact terminal capabilities still bind native and billing models. Native Claude
and Gemini composers transition authoritative provider state from `starting`
to `ready`, so a visible real CLI cannot remain covered by a loading state.
Missing Qwen, Kimi, and Mistral runtimes remain downloadable. Their enabled
native adapters become ready once the pinned managed executable and required
runtime are present.

Claude and Gemini gateway requests recover `billingModel` from the
terminal-scoped token rather than requiring native CLIs to duplicate it.
Claude native IDs map independently to OpenRouter billing IDs, including
`claude-haiku-4-5` -> `anthropic/claude-haiku-4.5`,
`claude-sonnet-4-6` -> `anthropic/claude-sonnet-4.6`, and
`claude-opus-4-8` -> `anthropic/claude-opus-4.8`; retired Claude 3.5 Haiku is
not offered. A native `/model` switch outside the token capability returns a
nonretryable capability error, not a false login failure. Billing limits are
translated into provider-native HTTP 400 envelopes with the exact capacity and
reset message, while genuine provider 429 responses remain retryable.

Terminal reservations separate conservative financial holds from usage-window
admission. Native Gemini can send roughly 50 KB of static system/tool context
for a tiny prompt; reserving that context plus the maximum 2,000-token answer
and safety margin against the burst window falsely blocks short requests.
`CreditCalculator::estimateCredits()` still protects balance/monthly exposure,
while terminal endpoints use unsafed expected usage with
`terminal_quota_output_tokens` for burst and weekly quota. Reservation metadata
stores `quota_reserved_credits`, and release/settlement reconciles quota to
exact provider usage, including actual usage above the estimate.
Dynamic OpenRouter terminal models use their live catalog price plus the normal
terminal reservation margin for balance and quota admission; the separate
general dynamic-model uncertainty multiplier must not be stacked on top. When
the requested output allowance is the remaining affordability problem,
`TerminalOutputBudget` lowers it to the largest funded value at or above the
800-token terminal floor and the backend sends that cap upstream. Exact usage
settlement remains authoritative.

Deep recovery record: `Vibyra/_ai/Runs/2026-06-10 Vibyra Gemini Terminal
Recovery.md`.

Semantic native-TUI assignments send bracketed paste and Enter as separate
worker writes; combining them can leave the text visible but unsubmitted.
Gemini receives a longer paste-settle delay than Claude and Codex.
Bridge account authentication persists to mode-0600
`~/.vibyra-agent/desktop-account-session.json`, restores before terminal
recovery, revalidates on startup, and is deleted on sign-out or expiry. This
prevents a bridge restart from silently breaking every Vibyra-token provider.

Focused validation:

```bash
node --test desktop/assets/app.terminals-input.test.mjs desktop/assets/app.terminals-companion-rail.test.mjs desktop/assets/app.terminals-new-menu.test.mjs
node --test desktop/lib/localAi.test.mjs desktop/lib/desktopActions.test.mjs desktop/lib/desktopChat.test.mjs desktop/lib/aiTerminalProcess.test.mjs
node --test desktop/lib/aiTerminalPersistentProcess.test.mjs desktop/lib/ptyTerminalsSocket.test.mjs desktop/lib/terminalWorktrees.test.mjs
```

## June 10, 2026 - Generalized API-Only Provider Routing

Every provider-qualified OpenRouter model without a production-ready managed
native adapter uses the bundled exact-model Vibyra Agent runtime. Qwen,
Moonshot/Kimi, Mistral, and xAI are excluded because their official native
adapters are enabled. Dynamically discovered API-only providers such as
DeepSeek continue to use Vibyra Agent.

OpenRouter's Responses endpoint returns HTTP 500 for some valid non-OpenAI
tool models, including observed DeepSeek V4 Flash and Qwen 3.5 9B requests.
The backend therefore sends non-OpenAI Codex traffic through Chat Completions,
translates Responses history and tools into chat messages, and synthesizes
Responses text/function-call events back to the Codex engine. Billing settles
from the Chat Completions usage payload under the exact selected model.

Keep the picker and backend on the same dynamic pricing tier thresholds:
budget requires prompt pricing at or below $1/M and completion pricing at or
below $5/M; balanced allows $5/M prompt and $20/M completion; anything higher
is premium. This prevents a free-plan picker selection from becoming a 403
only after terminal launch.

The launch contract is version 20. Persisted terminals with earlier provider
ownership metadata must be rebuilt.

## June 10, 2026 - Vibyra Agent Presentation And CLI Review

API-only provider terminals now share one richer, truthful Vibyra Agent
presentation:

- `aiTerminalVibyraAgentPresentation.mjs` owns raised provider wordmarks based
  on the real company symbol/name, ANSI Markdown emphasis, terminal-safe OSC-8
  hyperlinks, and elapsed task copy.
- The surface always says `via Vibyra Agent`; provider art never implies that
  the generalized runtime is an official company CLI.
- Long tasks announce `still working` after 30 seconds and once per minute,
  then print the measured `Worked for` duration.
- `/help` lists only local handlers or real agent workflows. The implemented
  set includes shell/context/session controls plus `/test`, `/build`,
  `/search`, `/security-review`, and `/init`.
- Presentation and later Team launch metadata changes incremented the launch
  contract to `20`, so recovered workers cannot retain stale identity, command,
  or role behavior.

Official-source review found native coding CLIs for xAI Grok Build, Qwen Code,
Kimi Code, and Mistral Vibe. These belong on the native adapter/release-gate
path and must not be visually copied by Vibyra Agent. The production pins are
Grok Build `0.2.39`, Qwen Code `0.17.1`, Kimi Code `0.14.0`, and Mistral Vibe
`2.14.1`. MiniMax `mmx-cli` is a capability bridge into other agents,
Meta Llama CLI manages Llama Stack, and Z.AI's coding helper configures
third-party agents; none is a model-family native coding terminal for current
Vibyra routing. DeepSeek, Perplexity, Cohere, NVIDIA, IBM Granite, and the other
API-only catalog families continue to use the custom Vibyra Agent surface
unless primary provider documentation establishes an applicable native coding
CLI and its Vibyra adapter passes release gates.

## June 10, 2026 - Centered Auto Deciding Presentation

Auto model selection owns a short explicit `autoDeciding` session state between
the first submitted prompt and provider launch. During that state:

- `aiTerminalVibyraLogo.mjs` centers the complete logo, title, status, and
  signal block vertically and uses the full symmetric 3D V for normal-height
  panes.
- `app.terminals-pty-runtime.js` clears bottom overscan transforms and calls
  `scrollToTop()` after live writes, replay, and focus. Normal terminals still
  use their existing bottom scrolling and provider-specific geometry.
- `ptyTerminals.mjs` publishes `autoDeciding: true` before the first animation
  frame and clears it before launching the routed provider or restoring the
  waiting Auto prompt.
- The provider handoff is an authoritative output replacement, not an appended
  clear sequence. The bridge replaces the stored transcript with a full
  clear-screen sequence, the renderer honors `replaceOutput` by resetting
  xterm instead of merging local scrollback, and the provider session identity
  is published before its process can emit startup output. This prevents the
  completed V frame from reappearing at the bottom during launch.
- Routing failures use the same replacement path to remove the animation before
  restoring the normal Auto prompt.
- Provider startup runs concurrently with the animation. Auto displays for at
  least 1.44 seconds, and `persistentHandlers()` suppresses worker snapshot
  output plus buffers live provider bytes while `autoDeciding` is true. The
  first provider output is released only after the minimum display time; slow
  providers therefore keep the centered animation until they actually render.
  A 30-second bounded fallback prevents a silent provider from leaving the
  animation indefinitely.

Do not infer this presentation state from `model === "auto"` or
`providerState === "busy"`; both have broader meanings. Keep the explicit flag
and the renderer regression in `app.terminals-input.test.mjs`.

## June 10, 2026 - Permanent Terminal Bottom Anchoring

Observed failure:

- Codex and Claude initially rendered their composers at the pane bottom.
- Fractional fullscreen/grid heights could clip the final glyph pixels.
- After opening or closing the left rail or right terminal workspace, Codex
  could move its composer into the middle of the pane.
- An earlier immediate companion fit looked correct at startup but resized
  xterm and the native PTY repeatedly during the 180 ms grid-column animation.

Root cause was two independent behaviors:

1. `ResizeObserver` and `scheduleTerminalCompanionFit()` sent every transient
   animation width to xterm and the backend. Each backend resize generated a
   `SIGWINCH`, causing repeated native TUI reflow against intermediate sizes.
2. Even after receiving one correct final resize, Codex 0.138 could clear and
   redraw its inline viewport from the top without issuing another cursor
   position query. The worker's correct one-time startup probe therefore could
   not re-anchor this later redraw.

Permanent renderer contract:

- Initial terminal launch remains immediate and uses the mounted xterm cell
  metrics. Never debounce startup sizing.
- Later layout-driven fits use one per-terminal 120 ms settle timer. Observer,
  left-rail, right-workspace, splitter, and window changes reset that timer.
- Preserve a pending `forceBackend` request while the timer resets, then resize
  xterm and the backend once at the final stable geometry.
- Companion layout changes must not call `mountVisibleXterms()` or
  `fitPtyXterm()` during their animation.
- Cancel pending settled fits when a terminal is removed.
- Codex retains its two backend/xterm overscan rows.
- Every provider retains the measured fractional-row correction and three-pixel
  paint guard.
- After each Codex write or transcript replay, inspect xterm's active screen,
  find the last non-empty row, and translate the renderer down by the number of
  trailing blank visible rows. Compute the translation from the real xterm CSS
  cell height rather than a fixed pixel offset.
- Combine the dynamic Codex bottom anchor with the fractional paint inset and
  existing reserve-row lift. Claude, Gemini, and shell terminals do not receive
  the Codex-specific trailing-row anchor.

Implementation locations:

- `desktop/assets/app.terminals-pty-runtime.js`
  - `scheduleSettledPtyXtermFit()`
  - `cancelSettledPtyXtermFit()`
  - settled `ResizeObserver` routing
  - `terminalPtyBottomAnchorRows()`
  - combined transform in `applyPtyBottomOverscan()`
- `desktop/assets/app.terminals-companion.js`
  - companion changes request settled fits only
- `desktop/assets/app.terminals-pty.js`
  - pending fit cleanup on explicit close
- `desktop/assets/app.terminals-input.test.mjs`
  - regression coverage for settled resizing and Codex trailing-row anchoring
- `desktop/app.html`
  - cache version `terminal-settled-bottom-anchor-20260610`

Live verification used an already reflowed Codex session. Its 29-row xterm had
nine trailing visible blank rows inside a 454 px host; the renderer measured
the real cell height and applied `translateY(145px)`, restoring the composer to
the pane bottom without changing PTY row ownership. Temporary title-based
geometry instrumentation was removed after verification.

Final validation:

```bash
npm run test:desktop-ai
```

Result: 292 tests passed, 0 failed. JavaScript syntax checks and
`git diff --check` also passed. The running Electron renderer was reloaded
without restarting or closing the authoritative terminal workers.

## June 11, 2026 - Team Identifier Lifecycle And Official CLI Corrections

`Invalid Team identifier.` is emitted only when a request contains role, size,
or goal metadata with an empty ID. The generated bridge Team IDs were already
valid; the repeat failure came from lifecycle skew and incomplete restored
renderer records.

Permanent contract:

- The renderer repairs blank Team IDs for a complete restored group before any
  member starts and serializes Team fields through one all-or-none preflight.
- The bridge lowercases current-format IDs and deterministically canonicalizes
  every non-empty legacy value.
- Desktop boot immediately reconciles `GET /desktop/pty-terminals`, including
  when local storage is stale or empty.
- Team renderer payload changes increment the shared terminal action protocol.
  Protocol `2026-06-11.13` is exposed with Team role contract `2`; Team assets
  use the `terminal-team-identity-20260611` cache key.
- Planner metadata survives renderer persistence.

Official CLI follow-up:

- Managed Mistral Vibe resolves runtime ID `mistral` to executable `vibe`.
- Legacy Kimi and Mistral model aliases normalize to OpenRouter billing slugs
  under `moonshotai/...` and `mistralai/...`.
- Live runtime status confirmed Codex, Claude, Gemini, Qwen, Kimi, Mistral, and
  Grok ready. The recovered four-member Team remained running under one shared
  ID after the bridge and Electron reloaded.

Validation: `npm run test:desktop-ai` passed 398 tests; focused Team/PTY tests
passed 44; runtime/launch tests passed 38; `git diff --check` passed.

## June 11, 2026 - Outcome-First Team Setup

Team Step 2 now defaults size to `Automatic` and sends `teamSize: 0` so the
authoritative planner can choose the smallest valid `2–4` role topology. The
renderer adopts the returned size for workspace preparation and launch.
Predefined role cards stay hidden before planning; an active request shows a
compact reduced-motion-safe planning strip, and successful plans reveal compact
generated role rows in place. Project, Model, Workspace safety, and Reasoning
effort remain visible, while size override, Access, and payment live under
Advanced. The launch action reads `Plan and start team`.

This renderer contract uses terminal action protocol `2026-06-11.19` and the
`terminal-team-planning-motion-20260611` Team asset cache key. Validate with
`npm run test:desktop-team-planner`.

## June 11, 2026 - Asset-Backed Provider Terminal Logos

The generalized Vibyra Agent provider intros no longer use three-line,
hand-authored ASCII monograms or one shared dimensional frame.

Permanent contract:

- Each registered provider theme exposes a canonical `theme.logoId`.
- Versioned provider SVGs, provenance, checksums, and generated 64x64 RGBA data
  live under `desktop/assets/provider-logos/`.
- `desktop/lib/aiTerminalProviderPixelLogo.mjs` decodes the compact generated
  data and renders true-color ANSI half blocks, with transparent silhouettes,
  monochrome output, bounded widths, and deterministic unknown-provider
  fallback art.
- Product-family marks win where a distinct published identity exists, such
  as Grok, Qwen, Kimi, Mistral, and Gemma. The surrounding runtime remains
  truthfully labeled `via Vibyra Agent`; logo treatment never implies a native
  provider CLI.
- Rebuild assets with `node scripts/provider-logo-assets/build.mjs` and verify
  registry parity with `node scripts/provider-logo-assets/validate.mjs`.
- Generate the visual acceptance artifact with
  `node scripts/provider-terminal-review/run.mjs`. It renders the real
  `renderIntroForModel()` output through bundled xterm and headless Chrome,
  captures every registered provider, and writes one 29-page PDF to
  `~/Desktop/Vibyra-Agent-Provider-Terminal-Visual-Review.pdf`.
- The capture xterm uses 38 rows for the current 35-line intro. Fewer rows can
  scroll the full-size logo before the screenshot and invalidate the review.

Validation covered 29 unique, nonblank screenshots with content clear of the
terminal bounds, provider logo unit tests, presentation/runtime tests, and the
full `npm run test:desktop-ai` suite.

User acceptance: on June 11, 2026, the 29 asset-backed provider terminal logos
and Desktop review PDF were explicitly approved as the desired visual quality.
Preserve the large, distinct, true-color logo treatment and do not regress to
small generic marks, shared frames, or hand-authored ASCII approximations.

## June 11, 2026 - Terminal Adversarial Lifecycle Audit

- Vibyra Agent now strips inherited provider credentials by generic credential
  suffix, confines Standard paths through canonical real paths and existing
  ancestors, and resumes read-only Codex threads through config sandbox mode.
- Script-backed close terminates the Linux provider session. Startup includes a
  short stability check, first semantic assignments allow 30 seconds for cold
  composers, detached workers revoke their own gateway grant, and persistent
  runtime compatibility is version `18`.
- Desktop Quit and signal shutdown track HTTP/upgraded sockets, attempt normal
  close, then force remaining connections closed after one second.
- Team cancellation remains active through cloud response decoding and clears
  revealed previews. Automatic sizing derives bounded complexity signals from
  goals and paths. Personal Codex plans reject duplicate JSON keys, recovered
  Team workers must match the current role contract. Team planning UI uses a
  one-way pending sequence rather than a loop: prompt analysis immediately,
  role planning after about 3 seconds, and individual-role assignment after
  about 7 seconds; real validation and preparation remain response-driven.

Validation: `npm run test:desktop-ai` passed 440 tests before final Team
hardening; `npm run test:desktop-team-planner` then passed 53 tests and focused
lifecycle/process/shutdown coverage passed 47 tests. Processes launched before
runtime version `18` retain old code until closed or retired during recovery.

## June 11, 2026 - Team Planning Progress Acceptance

- The accepted Team setup keeps planning feedback inside the graphite launch
  action with the people/rings/dots animation and a visible `Cancel` action.
- Pending copy advances once: `Analyzing your prompt` immediately, `Planning
  team roles` after 3 seconds, and `Assigning individual roles` after 7
  seconds. It then holds until the provider responds and never loops.
- `Validating assignments` is shown only after a provider response, and
  `Preparing terminals` is shown immediately before launch.
- Phase state survives periodic desktop refreshes because an active Team setup
  panel is not replaced. Cancellation aborts the request, clears scheduled
  phase transitions and previews, and restores the editable setup form.
- The renderer assets use the `terminal-team-spaced-phases-20260611` cache key.
  Verify with `node --test desktop/assets/app.terminals-team.test.mjs
  desktop/assets/app.terminals-setup-stability.test.mjs`; the accepted focused
  suite passes 19 tests, including the one-way no-loop schedule assertion.

## June 11, 2026 - Atomic Team Launch And Native Runtime Hardening

- Team creation now uses one authorized `POST /desktop/terminal-teams/launch`
  operation. The renderer creates deferred local records, while the bridge
  reserves capacity, starts every member, delivers the bridge-compiled trusted
  assignments, and rolls back every created session, gateway grant, and
  prepared worktree when any member fails.
- The renderer must never queue independent PTY starts for a planned Team.
  Failed aggregate launch also removes all deferred local records.
- Managed Qwen loads a private mode-0600 Node preload guard. Before Docker or
  Podman is spawned it changes `OPENAI_API_KEY=<scoped token>` to the
  name-only `OPENAI_API_KEY` argument, allowing Docker to inherit the value
  without exposing it through host process argv. Live `/proc/<pid>/cmdline`
  validation confirmed the value is absent.
- Full terminal rerenders detach and restore connected xterm elements instead
  of disposing and replaying them. Tab reordering supports
  `Alt+ArrowLeft/Right`. Later Windows input hardening disabled Electron xterm
  screen-reader mode to prevent duplicate keyboard events.
- Live native readiness checks confirmed Kimi Code reaches `ready` quickly and
  Mistral Vibe reaches `ready` after a roughly 20-second cold initialization.
  Do not classify a silent Mistral startup as failed before that bounded cold
  start completes.
- Six verified stale bridge processes, two detached `/tmp` test workers, and
  one orphaned Vibyra-owned Qwen container were removed. The active bridge and
  its four current user terminal workers were preserved.

Validation: `npm run test:desktop-ai` passed 449 tests, including aggregate
Team rollback, Qwen argv rewriting, xterm preservation, keyboard accessibility,
and native runtime contracts. Live Kimi, Mistral, and Qwen checks left no test
container or test terminal session running.

Full audit record:
`Vibyra/_ai/Runs/2026-06-11 AI Terminal Security And Reliability Audit.md`.

## June 14, 2026 - Top Chrome Tabs And Multi-Launch Reveal

- Terminal project groups are browser-style tabs centered in the authenticated
  top chrome. Active agents remain compact rows under Terminals in the global
  left rail; do not restore a terminal-page project navbar or page-local agent
  sidebar.
- Independent-agent and Coordinated Team launches that create two or more
  terminals call `revealTerminalBatch()`, switch to grid layout, clear stale
  fullscreen state, and persist the layout. This prevents non-fullscreen users
  from seeing only the active terminal after a batch launch.

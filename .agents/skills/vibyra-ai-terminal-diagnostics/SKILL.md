---
name: vibyra-ai-terminal-diagnostics
description: Diagnose and fix Vibyra Desktop AI terminal launch, PTY, branding, provider-routing, token-source, agent-engine, assignment, recovery, and transcript problems. Use when a Vibyra terminal looks like Codex/Claude/Gemini, opens the wrong interface, behaves like a basic readline chat, wraps or duplicates input, loses agentic file/tool capability, uses the wrong account or credits, restores stale output, or differs from a supplied terminal screenshot.
---

# Vibyra AI Terminal Diagnostics

## Required Context

Read:

1. `Vibyra/_ai/Memory Protocol.md`
2. `Vibyra/_ai/Context Map.md`
3. `Vibyra/_ai/Project Context.md`
4. `Vibyra/_ai/Vibyra Desktop Memory.md`
5. `Vibyra/_ai/Desktop/AI Terminals.md`

Also use `VibyraDesktopFrontendDesign` when visible layout or presentation
changes.

## Product Boundary

Keep these concerns separate:

| Concern | Vibyra tokens | My AI accounts |
| --- | --- | --- |
| Visible process owner | Native CLI when an approved provider adapter exists; otherwise Vibyra Agent for tool-capable API models without an official CLI | Native CLI for the connected account |
| Presentation | Genuine native TUI or an explicitly labeled Vibyra Agent surface with provider logo/accent | Selected provider's native TUI |
| Agent capability | Native provider tools or Vibyra Agent's shared real commands, file/shell tools, cancellation, and resume | Official CLI process |
| Billing/auth | Vibyra account and backend credits; backend-owned OpenRouter transport | Connected official account |

For Vibyra tokens:

- Launch Codex for OpenAI models, Claude Code for Anthropic models, Gemini CLI
  for Google models, Qwen Code for Qwen models, Kimi Code for Moonshot models,
  Mistral Vibe for supported Mistral models, and Grok Build for `x-ai/grok-*`
  models.
- For a provider-qualified, tool-capable catalog model that has no registered
  official CLI, launch the bundled foreground `Vibyra Agent` runtime. Keep one
  truthful shared command profile. Provider presentation is owned by
  `aiTerminalVibyraAgentBranding.mjs` and
  `aiTerminalVibyraAgentPresentation.mjs`: each registered API-only company may
  have an original dimensional terminal mark, palette, prompt token, activity
  language, and status copy, but never a copied native TUI or a claim that the
  surface is the provider's official CLI. Unknown qualified providers use a
  deterministic fallback theme.
- Keep Vibyra Agent slash commands real and provider-neutral. The structured
  catalog in `aiTerminalCommandProfiles.mjs` distinguishes local commands from
  executable agent workflows. Local workspace actions live in
  `aiTerminalVibyraAgentWorkspace.mjs`; use structured filesystem or subprocess
  APIs, strip the terminal gateway credential, and keep Standard-mode
  `/cd`, `/context`, `/files`, and file mentions inside the launch workspace.
  `/unstage` removes Vibyra staged context only and must never run `git reset`.
  Keep `/stop` immediately cancellable while an agent task owns the foreground
  process instead of waiting behind the serialized prompt queue.
- Select official CLIs by model family, not company alone. For example,
  `google/gemini-*` uses Gemini CLI while `google/gemma-*` uses Vibyra Agent.
  Apply the same rule when a native-CLI company publishes another API-only
  model family.
- Vibyra Agent uses the bundled Codex `exec --json` engine internally for real
  file and shell tools, but sends the exact selected model through the
  terminal-scoped Vibyra Responses gateway. Give it an isolated `CODEX_HOME`
  without auth, user config, plugins, or skills. If the engine is unavailable,
  fail closed instead of falling back to `/desktop/chat`.
- Replace Codex's model-visible base instructions with a Vibyra-owned
  `model_instructions_file`, and pass the exact selected OpenRouter slug in
  `developer_instructions` on every new or resumed turn. If an API-only model
  says it is Codex, Codex CLI, or OpenAI, capture the outbound Responses payload:
  the expected contract names Vibyra Agent in `instructions`, the exact model
  in the runtime identity, and Codex only as the hidden local tool orchestrator.
- Do not declare a generalized-terminal fix complete from a branded banner,
  HTTP success, unit tests, or the model's self-report. Prove the authoritative
  session and grant, captured outbound model and instructions, settled billing
  reservation under the exact model key, and a live authoritative PTY response.
  Exercise both a fresh and resumed turn when instruction persistence changes.
  Screenshots and factual answers such as release dates are not routing evidence
  because model output can hallucinate.
- Treat `billing_credits_exhausted` as proof that native CLI authentication
  reached Vibyra's backend billing guard, not as a provider CLI API-key
  failure. Inspect the authenticated account's balance plus burst/weekly
  windows before changing adapters. A zero balance must remain fail-closed;
  prove routing separately with a disposable funded account, the real native
  PTY, an exact-model settled reservation, and confirmation that the child
  receives only its terminal gateway token rather than the backend OpenRouter
  key.
- Changes to model-visible instructions or immutable launch metadata must
  increment `AI_TERMINAL_LAUNCH_CONTRACT_VERSION` so recovered workers cannot
  keep stale identity behavior.
- Treat provider child spawn as part of terminal creation. After launching a
  detached worker, wait for persisted state to report `running` with a real
  child PID before returning success or assigning the initial prompt. If the
  worker exits first, return its bounded startup category immediately, remove
  the failed session, revoke its gateway grant, and roll back its workspace.
  Do not hold the creation response open until the provider reaches its idle
  composer or accepts the initial assignment. Return after the child-PID
  handshake, attach the renderer WebSocket immediately, and deliver the
  initial assignment through the semantic assignment route while startup
  output is already visible. Keep synchronous `--version` probes off the
  provider spawn path.
  Native CLIs can also block before their composer on an interactive migration
  or upgrade notice. Inspect the authoritative PTY transcript before treating
  this as slow startup. For Codex, read the selected model's current
  `upgrade.model` from `models_cache.json` and pass the supported
  `notice.model_migrations={...}` config override so the selected model is
  preserved without sending blind menu keystrokes. Personal Codex terminals
  keep auth, config, memory, and runtime state in their isolated `CODEX_HOME`,
  but reuse safe account-level startup caches and the existing `.tmp/plugins`
  marketplace checkout so every terminal does not repeat model discovery,
  update checks, migrations, or marketplace cloning. Bundled Codex versions
  that support `tool_search_always_defer_mcp_tools` should defer MCP tool
  schemas from the critical startup path while keeping those tools available
  through discovery. Do not disable configured MCP servers merely to improve
  startup time.
  Test batch startup under both idle and loaded host conditions. Capture the
  bridge session-creation span, first authoritative PTY output, composer-ready
  span, system load/CPU, existing Codex process count, and MCP startup state.
  A live four-terminal run created Vibyra sessions in about 160 ms while Codex
  took about 21 seconds to emit output and 26-39 seconds to become ready on an
  8-core host near 6.8 load. Treat this as combined Codex startup plus host and
  network contention, not as proof that Vibyra has no remaining optimization
  work. Preserve a backlog for bounded launch staggering, supported warm
  runtime reuse, reduced isolated-home initialization, and immediate truthful
  terminal presentation.
  For renderer performance with many open terminals, keep live PTY
  output/status updates on the dirty-terminal patch path in
  `app.terminals-pty-runtime.js`; do not rebuild the whole terminal topbar/page
  for ordinary output, and do not mount or fit xterms hidden by project, focus,
  or fullscreen state. Detached workers should stream output immediately but
  debounce disk persistence in `aiTerminalWorker.mjs` to avoid per-terminal
  write churn. Launch, socket-open, and session patch paths should mount only
  the affected terminal, repeated xterm fits should coalesce per terminal, and
  xterm themes should be cache-keyed by visible theme scope instead of
  recomputed on every mount.
  A bridge/worker launch-contract mismatch means source changed under a stale
  bridge; refresh the bridge and never surface it as a generic assignment
  timeout. Apply launch-contract compatibility checks to personal provider
  sessions as well as Vibyra-credit sessions.
- Its custom Codex provider must declare
  `env_key="VIBYRA_TERMINAL_GATEWAY_TOKEN"`. Exclude that variable through
  `shell_environment_policy.exclude` so model-generated commands cannot read
  the spending credential, and remove it from the environment used by direct
  `!` shell commands. Strip inherited provider credentials by generic
  credential suffix as well as known provider prefix.
- The detached worker renews the same scoped token every six hours while the
  terminal is alive. Renewal preserves its terminal, model, runtime, provider,
  adapter, protocol, and rate-limit constraints. The worker must revoke its own
  token when the provider exits or shutdown begins; bridge revocation alone is
  insufficient because the bridge may be detached.
- Blank Auto opens an authoritative Vibyra waiting terminal without a project,
  provider worker, launch plan, or billing credential. Its first submitted
  prompt is routed before native worker creation; the same terminal ID then
  transitions to the selected provider CLI and delivers that prompt exactly
  once. Routing failures return to the `❯ auto` prompt instead of closing or
  hanging the terminal.
- Treat terminal project selection as three fallback layers: bounded startup
  discovery, debounced deep name/path search, then Electron-native `Choose
  folder` or `Choose file`. A selected file resolves to its containing folder,
  and explicit selections persist in
  `~/.vibyra-agent/recent-projects.json`, including plain folders without
  framework markers. The visible `Browse full PC` row must open the native
  folder picker; it must not silently choose the synthetic home-directory
  scope. Keep arbitrary path choice behind the native picker and register the
  result through the desktop-authorized project route.
- Give each CLI an authenticated local gateway in its native supported wire
  protocol. Never route a non-OpenAI model through Codex merely because Codex
  already supports Vibyra's Responses gateway.
- Never use Vibyra Agent for a provider that is registered to an official CLI.
  Do not copy that provider's native TUI, commands, or identity into the
  generalized surface.
- Keep provider installation, authentication, and billing readiness as separate
  states. An installed Claude Code or Gemini CLI executable is not proof that
  its account is authenticated; verify provider-native auth state or report
  `Sign in required` and let the official CLI own login. Likewise, a stored
  OpenAI API key used by Vibyra chat or voice is not the Codex terminal account:
  personal OpenAI terminals require the authenticated Codex CLI account. Do not
  let connecting or disconnecting one credential silently change unrelated
  personal-account terminal modes. Settings account actions use
  `/desktop/provider-accounts/{codex|claude|gemini}/{login|cancel|disconnect}`;
  inspect `providerAccountAuth.mjs` and `providerAccountState.mjs` first.
  Renderer account rows must normalize legacy bridge payloads that report
  `connected` without a `status`, and their visible status and action must be
  derived from the same normalized state. If account actions return `Missing or
  invalid desktop token`, the route is falling through to phone auth or the
  live bridge is stale; refresh the desktop bridge and verify the
  provider-account POST route locally. Starting provider login must visibly
  open a user path: detect the official CLI's emitted OAuth URL, open it in the
  system browser from the bridge, and expose an `Open sign-in page` fallback in
  Settings while the account is connecting. Do not treat a silent background
  login process as usable. Gemini/Google Settings login must write both
  `security.auth.selectedType = "oauth-personal"` and
  `security.auth.useExternal = true` to Gemini `settings.json`; setting only
  `selectedType` can leave the CLI in its interactive auth prompt without
  opening or printing the browser URL for Vibyra to surface. Gemini
  provider-account login must run the direct Gemini executable with writable
  stdin, not the Linux `/usr/bin/script` full-TUI wrapper; auto-confirm the
  `Opening authentication page in your browser. Do you want to continue?
  [Y/n]:` prompt once so the CLI opens the Google OAuth URL.
- Grok Build uses OpenAI Chat Completions through
  `/desktop/grok/v1/chat/completions`. It sends a fixed `grok-build` request for
  session titles before the selected coding-model request; authorize that value
  only as a native alias and settle it under the terminal's exact billing model.
- Qwen Code uses OpenAI Chat Completions through
  `/desktop/qwen/v1/chat/completions`, an isolated `QWEN_HOME`, and managed
  Node 22. In sandboxed Qwen modes, pass the terminal-scoped gateway token as
  `OPENAI_API_KEY` because Qwen's Docker launcher forwards that supported
  variable but not arbitrary terminal credential variables. Point Qwen at
  `host.docker.internal`, authorize only token-authenticated traffic from a
  detected Docker bridge subnet on the Qwen route, and recognize
  `Type your message or @path/to/file` as the native ready composer. Keep
  loopback routing for unsandboxed full access. Kimi Code and Mistral Vibe use
  OpenAI Responses through
  `/desktop/kimi/v1/responses` and `/desktop/mistral/v1/responses` with isolated
  `KIMI_CODE_HOME` and `VIBE_HOME`. Bind every route to the exact runtime,
  provider, protocol, native model, and billing model in the terminal grant.
  Mark Vibe's workspace explicitly untrusted so it skips the trust prompt while
  refusing project `.vibe` config, hooks, agents, and skills.
- Keep `CODEX_HOME` isolated without auth, user config, plugins, or skills, and
  strip inherited provider credentials. Generate a mode-0600 Vibyra-owned
  `config.toml` containing only the active terminal workspace trust entry;
  otherwise native Codex blocks every fresh Vibyra terminal on its trust
  prompt because the user's trusted-project config is intentionally excluded.
- Treat full access as an explicit launch-time capability, not a cosmetic
  terminal label. The setup choice applies to the whole new batch and persists
  for later launches. Use each foreground runtime's real bypass command:
  Codex `--dangerously-bypass-approvals-and-sandbox`, Claude Code
  `--dangerously-skip-permissions`, Gemini CLI
  `--approval-mode yolo --no-sandbox`, Qwen Code `--approval-mode yolo`,
  Kimi Code `--yolo`, Mistral Vibe `--agent auto-approve`, Grok Build
  `--permission-mode bypassPermissions --sandbox off`, and the bundled Vibyra
  Agent's existing full-access engine mode. Never label a shell or unresolved
  Auto session as full access.
- Treat Team role policy as bridge-owned launch metadata, never renderer-owned
  prompt text. Keep the goal and repository content in untrusted assignment
  data. Codex uses `developer_instructions`; Claude uses
  `--append-system-prompt`; Vibyra Agent composes the role with its runtime
  identity. Support roles must launch with real read-only controls.
- Treat `teamId` as an opaque correlation key, not an authorization boundary.
  Preserve current `team-...` values and deterministically canonicalize any
  non-empty legacy renderer value in the bridge. Continue to reject missing
  IDs, invalid roles or sizes, empty goals, and runtimes without a trusted role
  channel.
- `Invalid Team identifier.` now means the request contained some Team metadata
  but an empty `teamId`; a non-empty legacy ID is canonicalized. Check renderer
  and bridge version skew before changing the validator. Team renderer changes
  must bump `TERMINAL_ACTION_PROTOCOL_VERSION`, expose the Team role contract
  through `/desktop/runtime`, and use new immutable asset query versions.
- On renderer load, repair blank IDs across the complete restored Team before
  any member starts, then build the POST through `terminalTeamRequestFields()`
  so requests contain either all required Team fields or none. Boot must also
  call `syncPtyTerminals()` even when local storage is empty or stale, allowing
  authoritative detached sessions to be recovered.
- Fail Team launch closed when a runtime lacks a verified higher-priority role
  channel. As of June 10, 2026, Gemini, Grok, Shell, and unresolved Auto are not
  Team-compatible. Do not downgrade them to prompt-only roles.
- Changes to the Team role contract must increment
  `TERMINAL_TEAM_ROLE_CONTRACT_VERSION`; changes to process launch metadata
  must also increment the AI terminal launch/runtime compatibility versions so
  stale detached workers are rejected.
- Treat dynamic Team planning as untrusted decomposition. The renderer submits
  intent, while the bridge issues and persists the authoritative plan. GPT-5.4
  mini may propose bounded assignments, scope, criteria, and risks under strict
  schema; it cannot create roles, permissions, tools, trusted prompts,
  lifecycle transitions, or provider policy. GPT-5.4 nano is classifier-only
  unless evaluations promote it. Ollama planning is explicit private mode and
  falls back locally to deterministic planning. Read
  `Vibyra/_ai/Desktop/AI Team Dynamic Planner Implementation Plan.md` before
  changing Team planning, persistence, launch, or recovery.
- Never infer that a Team used AI planning from the planning animation or role
  titles. Inspect the authoritative plan's `plannerMode`, `plannerModel`, and
  `fallbackReason`. Deterministic objectives such as “Implement the smallest
  complete change” indicate fallback, commonly because the account is signed
  out, has no credits, the planner timed out, or its output failed validation.
  Preserve fallback reliability, but label the preview and active Team bar as
  `AI-planned` or `Built-in fallback` with the bounded reason.
- When Team terminals use `My AI accounts` with a Codex/OpenAI model, generate
  assignments through the connected Codex account in an isolated ephemeral
  planner home. Pass the selected token mode and model from the renderer, keep
  roles and permissions deterministic, validate the strict proposal locally,
  and fail the setup closed if personal-account planning times out or returns
  invalid references. Do not silently replace a failed personal-account plan
  with generic assignment templates. Keep Vibyra-credit cloud planning and its
  explicitly labeled deterministic fallback as a separate path.
- Constrain the personal-account output schema to the selected topology's exact
  assignment count and role enum. Schema-valid output can still violate local
  semantic policy through duplicate roles, support-role write scope,
  overlapping paths, or invalid criterion references. Validate inside the
  provider planner and allow one complete corrective retry containing only the
  bounded validator reason. Validate the retry again and fail closed if it is
  still invalid; never sanitize unsafe scope or launch the first rejected plan.
- Reject duplicate JSON object keys before parsing provider-authored Team
  output. Automatic sizing must derive bounded complexity signals from the goal
  and candidate paths, and recovered Team sessions must match the current role
  contract version.
- Team planning UI may report only observable request analysis, response
  validation, and terminal preparation. Never rotate timer-authored mapping,
  role, assignment, or review claims without bridge evidence.
- Resolve dynamic PTY assignments through
  `terminalTeamAssignmentForPlan(planId, roleKey, teamId)` or
  `teamPlanById(planId)` from `desktop/lib/terminalTeamPlanner.mjs`. Never
  accept renderer-authored `teamTask` as the dynamic assignment authority.
- Keep Team renderer planning/request/validation/preview and plan-derived
  launch helpers in `app.terminals-team-planning.js`, loaded immediately before
  `app.terminals-team.js`; the latter owns fixed roles, recovery metadata,
  setup markup, and the active Team bar.
- Solo setup may launch `1–12` independent terminals. Keep its preset/custom
  count and grid preview bound to the actual available terminal capacity, use
  `terminalGridMeta()` for preview geometry, and pass the selected count to
  `createTerminals()`. Team keeps its separate `2–4` role topology and must not
  inherit the Solo arbitrary count or preview.
- Keep the current planning store's limitation explicit: it is immutable but
  process-local until durable restart persistence is added. Do not claim plan
  recovery across a bridge restart from the core implementation alone.
- Codex is bundled. Native Claude, Gemini, Qwen, Kimi, Mistral, and Grok CLIs are
  downloaded from the model picker. Qwen `0.17.1`, Kimi `0.14.0`, Mistral Vibe
  `2.14.1`, and Grok Build `0.2.39` have enabled Vibyra adapters; future runtime
  additions still require matching authentication, streaming, tool, and usage
  adapters before they can run behind Vibyra billing.
- Managed Mistral lookup uses runtime ID `mistral` even though its executable is
  named `vibe`. Canonical OpenRouter billing namespaces are
  `moonshotai/...` and `mistralai/...`; normalize legacy `moonshot/...`,
  `mistral/...`, and unqualified Kimi/Devstral aliases before issuing a grant.
- Do not bundle Claude Code by default without Anthropic redistribution
  permission.
- Protect the local Vibyra model gateway with a short-lived terminal-bound
  credential. Loopback address or a missing Origin header is not sufficient
  authorization to spend account credits. Long-lived terminal sessions keep
  that credential valid only through detached-worker renewal.

Interpret user wording carefully:

- “Work/use the terminal like Codex” means real PTY interaction, agentic
  tools, repository edits, persistent context, and reliable input unless the
  user explicitly asks to copy Codex's visual interface.
- “Actual Vibyra terminal” means either the selected provider's genuine native
  CLI or the honest Vibyra Agent surface, both billed through Vibyra with real
  agent tools rather than a chat-only imitation.
- When screenshots compare Vibyra credits with My AI accounts and the
  My-account terminal is the desired reference, preserve that native TUI and
  change only provider/auth/billing. Do not interpret “Vibyra” branding or
  “do not open GPT” as permission to replace Codex with a copied readline UI.
- When a screenshot contradicts an implementation assumption, treat the
  screenshot as evidence and reclassify the failure before editing again.

## Diagnose Before Editing

For Vibyra Voice credential errors, keep provider-account and Voice resolution
separate. `openAiAccountCredential()` is intentionally limited to the private
provider store, while `openAiVoiceCredential()` may fall back to
`OPENAI_API_KEY` from the process or ignored root/backend `.env` files. Verify
the Voice resolver directly before asking the user to reconnect an account, and
never print the credential while diagnosing it.

For a Voice transcript that shows `You` but omits a spoken `Vibyra` response,
trace the initiating user-message object through setup-to-terminal transfers.
The assistant row must be appended to the thread that still contains that exact
user object, not whichever terminal is active when the AI request finishes.

For local prompt-history or Hermes-ingestion gaps, verify a prompt event and a
linked outcome event share the same `turnId` and `sessionId` in
`Vibyra/Prompt Transcripts.md`. Structured chat and Talk close their own turns
after desktop actions resolve. Native PTY and F8 dictation are paired in
`app.terminals-pty-prompt-log.js`; completion occurs when the provider returns
to ready, exits, or remains output-idle for four seconds. Do not log raw audio
or duplicate F8 as a second typed PTY prompt.

For bottom clipping, anchoring, or “almost correct” screenshot reports, use a
measurement-first workflow:

1. Reproduce the exact fullscreen/window and grid layout from the screenshot.
2. Measure the tile, PTY host, xterm root, viewport, `.xterm-screen`, CSS cell
   height, row count, transforms, and bottom-edge differences in the live DOM.
3. Separate three causes before editing: fractional-row overflow, native
   provider reserve rows, and paint clipping from containment/focus/window
   edges.
4. Fix shared geometry once when multiple providers show the same symptom.
   Provider-specific offsets are allowed only after measurements prove a
   provider-specific contract.
5. Re-probe the live fullscreen DOM after reload, then run regression tests.
   Source inspection and unit tests alone do not establish visual correctness.

Do not iterate through guessed `1px`/`2px` offsets from screenshots. A fixed
offset can appear correct at one aspect ratio and fail when the pane height,
grid count, fullscreen state, or window-manager bounds change.

For the June 10, 2026 reference implementation and measured acceptance result,
read `Vibyra/_ai/Desktop/AI Terminals.md`, section
`Permanent Terminal Bottom Anchoring`.

Classify the failure:

1. **Wrong visible product**
   - The PTY shows the wrong provider's native TUI, or Vibyra Agent falsely
     presents itself as an official provider CLI.
   - Inspect `aiTerminalProcess.mjs` and the live process tree. The visible child
   must match `terminalRuntimeForModel(model)` and use its Vibyra adapter.
   If the on-disk resolver succeeds but the live create route reports
   `unsupported_provider`, compare
   `/desktop/runtime.aiTerminalLaunchContractVersion` with
   `AI_TERMINAL_LAUNCH_CONTRACT_VERSION`. A stale bridge has cached the old
   registry; relaunch through `Vibyra Desktop`, which replaces mismatched
   bridge contracts before reopening the window.

2. **Replica terminal or wrong runtime**
   - The screen copies provider styling but lacks the shared Vibyra Agent
     commands, routing, permissions, interruption, or agentic execution.
   - Inspect foreground ownership, runtime status, and launch arguments.

3. **Chat-only behavior**
   - Replies work but file edits, slash commands, shell passthrough, context
     mentions, or tool activity do not.
   - Reject `/desktop/chat` fallback and decorative readline-only behavior.
     For Vibyra Agent, verify its foreground process owns the PTY and its
     isolated internal engine provides `/help`, shell execution, file edits,
     resume, rapid multiline input, and interruption.

4. **Correct UI/capability, wrong billing**
   - Inspect token-source routing, isolated environment, Responses proxy,
     backend authentication, model resolution, and usage settlement.
   - For Vibyra Agent capability mismatches where the expected and requested
     model text is identical, inspect `/desktop/v1/responses`. It must pass the
     registry-derived `runtimeId` and `providerId` as well as model, adapter,
     protocol, and native model into `authorizeTerminalGatewayRequest`.
     Omitting either identity makes every custom provider grant fail despite an
     exact model match.
   - If the local gateway succeeds but Laravel returns `422 Unknown Vibyra
     terminal model`, inspect `CreditCalculator` injection and
     `OpenRouterPricingCatalog`. The calculator must require its catalog
     dependency; an optional nullable constructor leaves every dynamic model
     permanently unknown. The backend must also refresh the catalog on demand
     when a selected provider-qualified model is absent, stale, or the cache is
     empty. Verify the exact screenshot slug through `modelConfig()` and
     `supportsTerminalToolCalling()` after clearing the cache.
   - Read `GET /desktop/state` before querying a local database. The desktop
     may use the production API, and its `desktopAccount` contains the
     authoritative plan, remaining credits, burst usage/reset, and weekly
     usage/reset. A terminal 429 with credits remaining can still be a burst
     or weekly reservation rejection rather than provider rate limiting.
   - Native Codex retries 429 and 422 Responses errors, then replaces the
     backend body with a generic retry-limit message. Vibyra billing failures
     must cross the Codex-facing Responses boundary as plain-text HTTP 400
     errors. JSON envelopes are dumped verbatim, while error-only streams are
     treated as disconnected. Preserve billing code/status in response headers,
     and keep genuine provider 429 responses unchanged.

5. **Input or PTY corruption**
   - Duplicate input, separate requests per line, wrapping, missing prompts, or
     stuck activity.
   - Inspect renderer input ownership, assignment formatting, worker activity,
     `/usr/bin/script` sizing, synchronous worker filesystem writes, and
     browser localStorage transcript duplication.
   - Codex's main chat is an inline viewport in both alternate-screen policies;
     alternate screen is used for overlays and pickers. If the composer starts
     above blank rows even though `stty size` matches xterm, confirm the worker
     answers the first `CSI 6 n` cursor-position query with the configured
     bottom row and inserts the matching `CSI row;1 H` into renderer output.
     Sending only the response makes Codex and xterm disagree about the cursor,
     so later relative drawing re-anchors the composer. After startup, pass
     live probes to mounted xterm; while detached, answer from an ANSI cursor
     tracker rather than repeatedly claiming the cursor is at the bottom.
     Codex 0.138 exposes `--no-alt-screen`; use that supported flag for inline
     PTY sessions. A `-c tui.alternate_screen=...` override can be parsed as a
     TOML unit value and make the CLI exit before its composer appears.
   - Native Codex keeps a two-row safety margin below its status line. To make
     the composer visually flush with Vibyra's pane bottom, give both xterm's
     internal buffer and the Codex backend PTY two rows beyond the measured
     visible host. Expand xterm by exactly those cell heights inside the
     overflow-hidden host. While idle, leave it top-aligned so the two empty
     reserve rows are clipped below the pane. If Codex draws status, working,
     or approval content into those rows, translate xterm upward by exactly
     the same height so that content becomes visible. If only the backend receives the extra
     rows, active-turn progress can address rows xterm does not own and render
     as clipped gray blocks. Clamp future measurement to the host's visible
     height so the transformed viewport cannot accumulate more rows on each
     fit. Do not apply this overscan to Claude, Gemini, or shell terminals.
     A rounded visible row count can exceed the pane by a fractional row at
     some fullscreen or grid aspect ratios. Measure that pixel overflow from
     xterm's CSS cell height and the real host height, then extend and lift the
     renderer by that amount plus a three-pixel paint guard for every provider.
     The guard prevents pane containment, focus edges, and the window boundary
     from covering the final glyph pixels even when row geometry fits exactly.
     Keep this pixel inset separate from Codex's dynamic two-row overscan.
     Do not fit or resize a recovered PTY while Electron's document is hidden:
     BrowserWindow starts at its default bounds before the window manager
     restores maximization. Fit once visibility returns, or Codex permanently
     reflows its inline composer against the false intermediate dimensions.
     Treat animated sidebar and grid changes the same way: keep initial launch
     sizing immediate, but debounce layout-driven `ResizeObserver` fits until
     the terminal host stops changing. Sending each transient width to xterm
     and the backend can leave Codex's inline composer anchored to an
     intermediate layout.
     Codex may then clear and redraw from the top on the one final resize
     without requesting cursor position again. In that case, measure xterm's
     last non-empty Codex screen row after each write and translate the surface
     down by its trailing visible blank rows. Combine that dynamic bottom
     anchor with the fractional paint inset and existing two-row overscan;
     do not apply it to other provider terminals.
   - For grid overlap or clipped native composers, compare the tile, PTY host,
     xterm viewport, and `.xterm-screen` rectangles. Fit mounted terminals from
     xterm's real CSS cell dimensions, and require paint containment on every
     grid tile and PTY host; font-size row estimates can allocate one row too
     many.
   - Real native TUIs may display a bracketed-paste assignment without
     submitting it when the closing paste marker and Enter arrive in one
     stdin write. The worker must write the paste first, then send Enter
     separately after a runtime-specific delay. Gemini needs a longer settle
     window than Claude or Codex.
   - If a new terminal remains locally `loading` but `GET
     /desktop/pty-terminals` has no matching session, inspect
     `queueStartPtyTerminal()`. Do not put the create request behind
     `requestAnimationFrame` or another visual scheduler because
     hidden/throttled renderers may never run those callbacks. Queue it in an
     immediate microtask after synchronous terminal rendering, mount xterm
     synchronously as best effort, then measure and post. This lets batch
     launches use the real pane geometry instead of the `100x30` fallback
     without depending on a paint frame. Bound the request with an abort
     timeout so a lost bridge cannot leave `pending` set forever.
   - Vibyra Agent must forward foreground `SIGTERM` to its active hidden engine
     or direct shell command, escalating to `SIGKILL` after a short bound.
     Closing the terminal must not orphan active project processes.

6. **Missing native terminal color**
   - Inspect raw session output before changing xterm themes. If transcripts
     contain text-style SGR codes such as bold/dim but no foreground-color SGR
     codes, the provider did not emit color; the renderer did not remove it.
   - Inspect the desktop process and child launch environment for `NO_COLOR`,
     weak `TERM` values, or missing truecolor capability. Vibyra PTYs must
     remove inherited `NO_COLOR` and explicitly provide `TERM=xterm-256color`,
     `COLORTERM=truecolor`, `CLICOLOR=1`, `CLICOLOR_FORCE=1`, and
     `FORCE_COLOR=3` to shell and every native provider runtime.
   - Do not synthesize provider colors in `terminalDisplayOutput()` or rewrite
     transcripts. Preserve the native CLI's ANSI stream and let xterm map it
     through the theme palette.
   - Verify with a temporary native session and inspect raw output for `38;5`
     or `38;2` color sequences, then close only that temporary session.

7. **Fix absent after restart**
   - Inspect authoritative sessions and persisted workers. Renderer reload does
     not replace a detached worker launched with old code.

8. **Auto errors**
   - Blank Auto creation must succeed without a project or task and expose
     `model: "auto"`, `autoAwaitingTask: true`, `status: "running"`, and
     `providerState: "ready"`. It must not create a provider worker, immutable
     launch plan, or gateway credential yet.
   - The first xterm line or semantic assignment constrains routing to providers
     whose native runtime and Vibyra adapter are both ready, persists the
     concrete launch descriptor, starts the selected native worker under the
     same terminal ID, and queues the prompt. Do not mark the provider ready at
     `spawn()`: wait for the native CLI's real idle-composer output, then write
     the prompt once. Routing/auth failures restore the Vibyra Auto prompt for
     retry.
   - OpenAI/Codex, Anthropic/Claude, and Google/Gemini are adapter-ready.
     Other unsupported routes must be excluded before selection or fail before
     a PTY session appears; they must never fall back after launch.
   - Check the backend log before accepting provider-capacity copy. A Responses
     exception can be collapsed into a generic high-demand message.
   - If the log reports missing reservation tables or quota columns, inspect
     migration status and live schema. Partially upgraded SQLite databases need
     guarded additive migrations before the Responses smoke can pass.
   - Treat backend `401` as account invalidation: clear bridge credentials and
     keep the renderer unauthenticated until `/desktop/session` verifies.
   - Before blaming the saved account token or OpenRouter key for a terminal
     `401`, compare `/desktop/state.appApiUrl` with the URL used by every
     terminal proxy. Account verification, Auto routing, desktop chat, project
     memory, Responses, Anthropic, and Gemini proxies must all resolve through
     `desktopAppApiUrl()`. A production token sent to a localhost backend fails
     before OpenRouter is called and commonly appears as "please log in".
   - The verified desktop account token must survive bridge restarts in
     `~/.vibyra-agent/desktop-account-session.json` with mode `0600`. Restore
     the snapshot before terminal recovery, revalidate it asynchronously, and
     remove it on sign-out or failed verification.

9. **Permission escape**
   - Closing or crashing an AI CLI must not drop a Standard-access session into
     an unrestricted project shell.
   - Inspect `terminalSessionCommand()` and remove or permission-gate fallback
   shells before claiming sandbox or approval protection.

10. **Responses compatibility**
   - Do not assume every text model can drive an agent terminal. Require tool
     capability before exposing a model for interactive coding.
   - Keep native CLI IDs separate from billing IDs. Current Claude mappings
     include `claude-haiku-4-5` -> `anthropic/claude-haiku-4.5`,
     `claude-sonnet-4-6` -> `anthropic/claude-sonnet-4.6`, and
     `claude-opus-4-8` -> `anthropic/claude-opus-4.8`. Gateway authorization
     recovers the server-stored billing model; native requests must not repeat
     it, and a `/model` change must return a capability error rather than 401.
   - When billing failures are converted to plain-text HTTP 400 to stop native
     CLI retries, preserve that text and billing headers in the Anthropic or
     Gemini error envelope. Never replace it with a generic HTTP 400 message.
   - Distinguish a real burst-cap denial from an over-conservative terminal
     reservation. Native CLIs send large static system/tool context even for a
     short prompt. Keep the conservative maximum-output estimate for the
     balance and monthly USD hold, but admit burst/weekly quota using unsafed
     expected usage with the configured terminal quota output allowance.
     Settlement must reconcile both balance and quota to exact provider usage;
     never weaken the final charge or hard quota caps.
   - For dynamically priced OpenRouter terminal models, use the live catalog
     price plus the terminal reservation margin. Do not also apply the general
     dynamic-model uncertainty multiplier to terminal balance or quota
     admission. If output allowance is the remaining affordability problem,
     cap it to the largest funded value at or above the terminal floor and send
     that cap upstream. Keep exact settlement authoritative.
   - Treat missing or invalid dynamic prompt/completion pricing as premium,
     never as zero. The desktop picker and backend tier calculation must agree.
     Reservations and provider `max_price` constraints must fill incomplete
     token pricing from the conservative default fallback so partial catalog
     metadata cannot bypass Free-plan locks or understate admission cost.
   - `desktop/lib/openRouterModels.mjs` must require explicit
     `supported_parameters: ["tools", ...]` for concrete terminal catalog
     entries. Preserve `auto`, because it routes before execution.
   - The shared backend pricing catalog must retain all chat models. Use
     `OpenRouterPricingCatalog::supportsTerminalToolCalling()` only from a
     terminal-specific request path; missing metadata fails closed there.
   - Verify multi-round tool history against the gateway. Normalize required
     function-call IDs and provider-specific tool types instead of forwarding
     incompatible payloads unchanged.
   - Native Gemini and Anthropic conversational history is Responses input,
     including prior assistant text. Encode every historical text part as
     `input_text`; `output_text` belongs to streamed Responses output events
     and OpenRouter rejects it when it is replayed inside a later request.
   - Laravel decodes empty JSON objects as empty PHP arrays. Before forwarding
     Codex function tools, restore empty JSON Schema map fields such as
     `parameters.properties` to objects; otherwise OpenAI rejects tools like
     `get_goal` with `[] is not of type 'object'`.
   - Propagate client cancellation upstream and distinguish completed, failed,
     incomplete, disconnected, and streamed-error outcomes when settling usage.

## Source Order

- Launch ownership: `desktop/lib/aiTerminalProcess.mjs`
- Runtime registry/install: `desktop/lib/aiTerminalRuntimeCatalog.mjs`,
  `desktop/lib/aiTerminalRuntimes.mjs`,
  `desktop/lib/aiTerminalRuntimeRoutes.mjs`
- Environment/auth: `desktop/lib/aiTerminalVibyraShell.mjs`
- Generalized Vibyra Agent client: `desktop/lib/aiTerminalOpenRouterCli.mjs`,
  `desktop/lib/aiTerminalCommandProfiles.mjs`,
  `desktop/lib/aiTerminalVibyraAgentBranding.mjs`
- Launch guard: `desktop/lib/aiTerminalLaunchOwnership.mjs`
- Detached lifecycle: `desktop/lib/aiTerminalWorker.mjs`,
  `desktop/lib/aiTerminalPersistentProcess.mjs`
- Routing/assignments: `desktop/lib/ptyTerminals.mjs`
- Xterm input/replay: `desktop/assets/app.terminals-pty-runtime.js`
- Token-source picker: `desktop/assets/app.terminals-models.js`
- Gateway authorization: `desktop/lib/terminalGatewayAuth.mjs`
- Local proxy: `desktop/lib/desktopCodexResponses.mjs`
- Backend/billing: `backend/app/Http/Controllers/Concerns/CodexResponsesEndpoint.php`

```bash
rg -n "agentStatus|agentEngine|nativeCodex|aiTerminalOpenRouterCli|model_provider|CODEX_HOME|auth.json|formatAssignmentInput|terminalDisplayOutput|providerState" desktop backend
```

## Verification Gates

Do not call the issue fixed until applicable gates pass:

1. **Static ownership**
   - The selected model maps to its registered native runtime or, only when no
     official CLI mapping exists, the foreground `vibyra-agent` runtime.
   - Launch configuration contains that runtime's Vibyra gateway URL and
     terminal-scoped credential.
   - The launch guard rejects provider imitation, altered Vibyra Agent entry
     arguments, stale contracts, and provider/runtime mismatches.

2. **Live metadata**
   - Query `GET /desktop/pty-terminals`.
   - Confirm the immutable launch descriptor identifies Vibyra billing and the
     native runtime for the selected model provider.
   - Confirm every managed-credit worker uses the current launch contract
     version; legacy or mismatched workers must be terminated during
     restoration.

3. **Live transcript**
   - Strip ANSI from authoritative `output`.
   - Require native provider behavior for native runtimes. For Vibyra Agent,
     require its real shared commands, permissions, interruption, tool events,
     persistent resume, and branded composer.
   - Reject copied native provider presentation or any claim that Vibyra Agent
     is an official provider CLI.

4. **Prompt smoke**
   - Send one harmless task.
   - Confirm Vibyra-owned activity and a final answer or real provider error.

5. **Command smoke**
   - Compare advertised commands with the current official provider reference,
     not an inferred shared list.
   - Run `/help`, provider status/about, a workflow such as `/review` or
     `/plan`, and supported `!` shell behavior.
   - Paste several commands ending in `/exit`; command results must remain in
     order. Readline handlers must serialize asynchronous command execution.
   - After each command or response, Vibyra activity detection must recognize
     Codex `›`, Claude `❯`, Gemini bordered `>`, and Auto `❯ auto` prompts.

6. **Persistence**
   - Wait for old worker shutdown before reusing an ID, or use a fresh ID.
   - Reload Electron without cache and re-query the session.

7. **Regression**

```bash
node --test \
  desktop/lib/terminalGatewayAuth.test.mjs \
  desktop/lib/desktopCodexResponses.test.mjs \
  desktop/lib/desktopRoutes.responses.test.mjs
node --test \
  desktop/lib/aiTerminalOpenRouterCli.test.mjs \
  desktop/lib/aiTerminalCommandProfiles.test.mjs \
  desktop/lib/aiTerminalProcess.test.mjs \
  desktop/lib/ptyTerminalsSocket.test.mjs \
  desktop/assets/app.terminals-input.test.mjs \
  desktop/lib/aiTerminalActivity.test.mjs
npm run test:desktop-ai
npm run typecheck
git diff --check
```

8. **Protocol smoke**
   - Complete at least one real two-round shell or file tool call through the
     Vibyra gateway.
   - Cancel a live turn and confirm the upstream request stops and billing is
     not settled as a successful completed stream.
   - Reject catalog models that do not advertise tool support.

## Proven Failure Patterns

- Copying a provider terminal instead of launching the genuine Codex runtime.
- Treating `agent: "vibyra"` as permission to choose Codex for a non-OpenAI
  model instead of resolving the selected provider's native runtime.
- Writing ownership tests around an inferred product interpretation before
  reproducing the screenshot's native slash menu and process tree.
- Treating a concurrent implementation of the documented native-Codex
  contract as a conflicting writer without first reconciling the user-visible
  acceptance criteria.
- Falling back to `/desktop/chat` when the managed runtime is missing.
- Launching the real TUI with inherited provider credentials, user plugins, or
  account config.
- Trusting tests without inspecting the live PTY transcript.
- Reloading Electron while an old detached worker remains active.
- Reusing a terminal ID before its worker directory is removed.
- Hiding structured engine failures behind unrelated stderr warnings.
- Persisting every echoed readline character with synchronous append/stat/state
  writes, or duplicating authoritative PTY output into browser localStorage.
- Copying ChatGPT auth or API credentials into Vibyra-token sessions.
- Assuming a downloaded provider CLI can use Vibyra credits without a
  compatible protocol adapter.
- Sending Qwen, Moonshot/Kimi, Mistral, or xAI models through Vibyra Agent after
  their native managed-credit adapters are enabled. These providers must keep
  their official CLI as the foreground PTY owner.
- Sending every exact-model Vibyra Agent request to OpenRouter's Responses
  endpoint. Non-OpenAI models can advertise tools while that endpoint still
  returns HTTP 500; use the backend Responses-to-Chat-Completions compatibility
  adapter and synthesize Responses text and function-call events for Codex.
- Trusting loopback requests without a terminal-bound gateway credential.
- Falling through to an unrestricted interactive project shell after a
  Standard-access AI process exits.
- Forwarding Codex tool history and tool types to OpenRouter without a
  compatibility adapter.
- Treating stream EOF as success after `response.failed`,
  `response.incomplete`, a streamed error, or client disconnect.
- Editing an already-run migration and assuming an existing desktop database
  gained a new column or enum value. Add a forward repair migration, run it
  locally, and verify a live reservation reaches `settled`.
- Creating a local loading terminal before checking the selected native
  runtime and billing adapter. Put the guard in authoritative
  `createTerminal()`, not only in setup/model-picker click handlers, because
  desktop actions and relaunch flows also call it.
- Using the terminal loading wheel to represent a CLI download. Model rows must
  show `Download`, then a visible rotating `Downloading` indicator while the
  bounded install request runs. Once present, the row needs no installation
  badge; internal Vibyra-credit adapter readiness must not leak into
  user-facing account or installation state.

## Fix Principles

- Fix ownership and routing before styling.
- Preserve real native TUI behavior where mapped; preserve the honest Vibyra
  Agent contract for API-only providers.
- Keep picker tiers identical to backend dynamic pricing thresholds. A model
  shown as budget in the picker must not resolve as balanced in billing.
- Report actual provider failures.
- Test both the rejected implementation and intended product boundary.
- Update `Vibyra/_ai/Desktop/AI Terminals.md` when the contract changes.
- Keep installation state separate from billing-route readiness. An installed
  unqualified Claude or Gemini model can launch its official CLI through
  `My AI accounts`, where that CLI owns sign-in and billing. Vibyra-token
  launches still fail closed unless the matching managed-credit adapter is
  ready. Qualified OpenAI, Anthropic, and Google model IDs may use their
  corresponding official CLI through `My AI accounts`; API-only providers use
  the clearly labeled Vibyra Agent only with Vibyra tokens and never
  impersonate native CLIs.
- Apply membership model-tier locks only when `tokenMode === "vibyra"`.
  Personal-account terminals use the connected provider's entitlement and
  billing, so Free-plan Vibyra model tiers must not hide, replace, or block a
  supported native CLI model. Keep the authoritative Vibyra path protected by
  exact-model terminal grants plus backend `planAllowsModel()` checks; a native
  `/model` switch must not widen that grant.
- Treat the authenticated membership payload as the source for
  `maxConcurrentAgents`, `maxActiveProjects`, and `contextTokenCap`; retain
  plan-derived fallbacks when an older cached payload omits those fields.
  Vibyra-funded foreground terminals allow at least one active terminal so the
  Free budget-terminal workflow remains usable, while legacy/background agent
  runs honor Free's literal zero-agent allowance.
- Enforce Vibyra-funded concurrency twice: reject new local PTY capacity before
  provider startup, then have `ChatCostReservationService` transactionally
  reject overlapping pending/settling `desktop-terminal` requests. Personal
  provider-account terminals are exempt because their provider owns billing.
  Include pending local launches in admission so parallel project-memory or
  worktree setup cannot race past the cap. Do not terminate recovered or
  already-running sessions after a downgrade.
- Apply `maxActiveProjects` only when creating managed folders under
  `~/Desktop/Vibyra Projects`. Existing managed projects and arbitrary opened
  repositories remain accessible. Serialize the count-and-create operation
  with the root lock file so separate desktop processes cannot race past the
  cap, and count symlink entries conservatively.
- Enforce `contextTokenCap` before reservation and provider dispatch. Reduce
  output tokens to the remaining context where the endpoint's minimum response
  budget still fits; otherwise return `membership_context_limit` without
  spending credits or calling the provider. Native protocol translation must
  forward the clipped value to the upstream `max_tokens`, and retry
  instructions must reduce the retry output allowance instead of widening the
  original context budget.
- Issue terminal gateway credentials only with non-empty exact model, runtime,
  provider, adapter, protocol, native-model, and billing-model constraints.
  Reject legacy incomplete grant records and never renew a token after its
  expiry; Auto-routed terminals must include both billing and native aliases in
  the same exact grant.
- Keep Laravel's unmetered legacy desktop routes impossible to enable in
  production even when their environment flags are set. They are local/testing
  compatibility paths, not a fallback for membership-funded requests.
- Never silently change Vibyra tokens to `My AI accounts`. Claude and Gemini
  managed launches run the genuine provider CLI with an isolated profile and a
  terminal-scoped gateway token. Claude's private profile must pre-complete
  onboarding and workspace trust. Gemini CLI 0.46's interactive validator
  rejects the otherwise supported `gateway` auth selector, so managed Gemini
  must enforce `gemini-api-key` while setting `GOOGLE_GEMINI_BASE_URL` to the
  local Vibyra gateway and `GEMINI_API_KEY` to the terminal-scoped credential.
  Also set `GEMINI_CLI_TRUST_WORKSPACE=true` and never reuse cached Google
  login. When this managed profile contract changes, increment the scoped
  Gemini profile compatibility version so recovery retires only stale Gemini
  workers instead of reconnecting them with old environment settings.
- OpenRouter is an internal provider transport for `Vibyra tokens`, not a
  user-selectable terminal billing source. Keep the real provider credential
  behind the authenticated Vibyra backend, issue only a terminal-scoped local
  gateway credential to the CLI, and enforce Vibyra credit and quota checks
  before provider dispatch. Never place the raw OpenRouter key in the PTY,
  child shell environment, renderer account state, or terminal setup UI.
- Desktop translates Anthropic Messages and Gemini GenerateContent to the
  deployed Vibyra Responses billing gateway, then translates streamed
  text/tool events back to each native protocol. Keep exact billing-model
  constraints on the terminal capability.
- Native Claude and Gemini composers are interactive-ready states, not
  terminal loading states.
- Treat renderer and backend PTY dimensions as separate state. Preserve the
  authoritative session `cols`/`rows` when constructing xterm so saved TUI
  control sequences replay at the geometry that produced them, then fit the
  visible pane and force a backend resize when the socket opens. A renderer
  size match alone is not enough to skip resize; compare the session geometry
  too.
- Native Codex must start at the mounted pane's real rows and columns. Its
  inline composer does not reliably move to the bottom when a session launched
  at fallback geometry is resized after startup. In batch launches, finish the
  synchronous render, mount xterm, and measure its CSS cells before posting the
  PTY create request.
- Keep Codex's two backend overscan rows separate from xterm's visible rows.
  The worker cursor responder must remain authoritative for every cursor probe
  and follow backend resize rows. Existing detached workers keep old responder
  code, so reopen Codex terminals after this contract changes.
- Keep the native composer reachable by scrolling xterm to the bottom on
  focus, user input, live output, and snapshot completion. Use `:focus-within`
  for the visible terminal focus ring because keyboard focus belongs to
  xterm's hidden textarea, not the outer terminal region.
- Keep Vibyra Agent presentation in
  `aiTerminalVibyraAgentPresentation.mjs`: provider-raised wordmarks may use
  the real company symbol/name and accent, but the surrounding product must
  remain visibly `Vibyra Agent`. Render assistant Markdown with ANSI emphasis
  and OSC-8 links, announce elapsed work after 30 seconds and at minute
  boundaries, and finish with the measured duration. Every command listed by
  `/help` must map to a local handler or a real agent workflow prompt.
- Keep API-provider logo geometry out of hand-authored ASCII arrays. Provider
  themes reference canonical `logoId` values, versioned source assets live
  under `desktop/assets/provider-logos`, and
  `aiTerminalProviderPixelLogo.mjs` renders their RGBA data with true-color
  half blocks. Rebuild with `node scripts/provider-logo-assets/build.mjs`,
  validate all registered IDs, then run
  `node scripts/provider-terminal-review/run.mjs`. The review capture must use
  enough xterm rows for the complete intro; 38 rows fits the current 35-line
  provider intro without scrolling and produces one 29-page Desktop PDF.
- Recheck official CLI ownership against primary provider documentation before
  adding a provider to the generalized runtime. As of June 10, 2026, xAI Grok
  Build joins Qwen Code, Kimi Code, and Mistral Vibe as an official coding CLI
  that needs a native Vibyra protocol/billing adapter and release gates. Do not
  imitate it in Vibyra Agent. MiniMax `mmx-cli`, Meta Llama CLI, and Z.AI's
  coding helper are integration or infrastructure tools, not model-family
  native coding terminals for Vibyra routing.
- Treat planned Team launch as one bridge transaction. Use
  `/desktop/terminal-teams/launch`; do not let the renderer independently queue
  each PTY. On any provisioning or assignment failure, remove every created
  session, revoke its scoped gateway grant, and roll back prepared worktrees
  before reporting failure.
- For sandboxed Qwen, never pass a scoped gateway credential as
  `--env OPENAI_API_KEY=<value>` to Docker or Podman. The managed preload guard
  must rewrite it before spawn to name-only `--env OPENAI_API_KEY`. Validate
  the real child with `/proc/<docker-pid>/cmdline`; broad `ps | rg` checks can
  falsely match the diagnostic command itself.
- Preserve connected xterm elements across structural renderer fallback. A
  reorder or unrelated shell render must not dispose the terminal, clear it,
  and replay its transcript. Keep screen-reader mode enabled and retain a
  keyboard reorder path in addition to drag-and-drop.
- Allow a bounded cold-start window for Mistral Vibe. Version 2.14.1 can remain
  silent for about 20 seconds while local imports and capability discovery run,
  then render its composer and become `ready`. Kimi normally becomes ready
  much sooner.

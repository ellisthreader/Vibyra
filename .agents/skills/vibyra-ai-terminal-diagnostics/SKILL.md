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
| Billing/auth | Vibyra account and backend credits | Connected official account |

For Vibyra tokens:

- Launch Codex for OpenAI models, Claude Code for Anthropic models, Gemini CLI
  for Google models, Qwen Code for Qwen models, Kimi Code for Moonshot models,
  and Mistral Vibe for supported Mistral models.
- For a provider-qualified, tool-capable catalog model that has no registered
  official CLI, launch the bundled foreground `Vibyra Agent` runtime. Keep one
  truthful shared command profile; customize only the provider mark, name,
  accent, model label, and status copy. Never claim that this surface is the
  provider's official or native CLI.
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
- Its custom Codex provider must declare
  `env_key="VIBYRA_TERMINAL_GATEWAY_TOKEN"`. Exclude that variable through
  `shell_environment_policy.exclude` so model-generated commands cannot read
  the spending credential, and remove it from the environment used by direct
  `!` shell commands.
- The detached worker renews the same scoped token every six hours while the
  terminal is alive. Renewal preserves its terminal, model, runtime, provider,
  adapter, protocol, and rate-limit constraints; close still revokes it.
- Blank Auto opens an authoritative Vibyra waiting terminal without a project,
  provider worker, launch plan, or billing credential. Its first submitted
  prompt is routed before native worker creation; the same terminal ID then
  transitions to the selected provider CLI and delivers that prompt exactly
  once. Routing failures return to the `❯ auto` prompt instead of closing or
  hanging the terminal.
- Give each CLI an authenticated local gateway in its native supported wire
  protocol. Never route a non-OpenAI model through Codex merely because Codex
  already supports Vibyra's Responses gateway.
- Never use Vibyra Agent for a provider that is registered to an official CLI.
  Do not copy that provider's native TUI, commands, or identity into the
  generalized surface.
- Keep `CODEX_HOME` isolated without auth, user config, plugins, or skills, and
  strip inherited provider credentials. Generate a mode-0600 Vibyra-owned
  `config.toml` containing only the active terminal workspace trust entry;
  otherwise native Codex blocks every fresh Vibyra terminal on its trust
  prompt because the user's trusted-project config is intentionally excluded.
- Codex is bundled. Native Claude, Gemini, Qwen, Kimi, and Mistral CLIs are
  downloaded from the model picker. A download does not enable Vibyra billing:
  each CLI also needs a matching authentication, streaming, tool, and usage
  adapter before it can run behind Vibyra billing.
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
- Leaving a provider-qualified model attached to a disabled native adapter
  after the bundled Vibyra Agent exists. Qwen, Moonshot/Kimi, and Mistral
  models must use the exact-model Vibyra Agent route until their managed-credit
  native adapters are enabled end to end.
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

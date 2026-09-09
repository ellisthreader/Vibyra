# Desktop - AI Terminals

Read this for Vibyra Desktop (`desktop-tauri/`) terminal panes, PTY-backed AI
sessions, provider model routing, launch settings, and provider-account
boundaries.

## Contracts

The current presentation path is terminal bytes: `terminalBus.ts` routes
output/resync/exit events and `terminalEvents.ts` writes them into xterm owned
by `terminalRegistry.ts`. These events do not themselves encode agent questions
or command approvals. For structured conversation UI research, the official
Codex app-server reference (`https://learn.chatgpt.com/docs/app-server`) documents
item progress, approval requests, and user-input requests; this is a separate
integration contract, not an existing Vibyra feature.

The Rust/Tauri empty launcher persists its model, count, and effort per project
in `localStorage["vibyra.launch-settings.v2"]`. `modelEffort.ts` owns the
model-specific direct-native capability table, `LaunchTerminalCount.tsx` owns
the compact terminal-grid button and exact `1–12` popover, while
`LaunchEffortPicker.tsx` renders the model-aware stepped slider. The selected
label, hint, and endpoints are presentation only; every stop passes an exact
native effort value. Codex CLI 0.144.6 metadata gives GPT-5.6 Sol/Terra
low/medium/high/xhigh/max/ultra, Luna through max, and the current older GPT
models through xhigh; Ultra launches as `model_reasoning_effort="ultra"`.
Anthropic models use their documented low/medium/high/xhigh/max subsets through
Claude's `--effort`; unsupported models omit the control. Claude Code 2.1.203+
also supports the session-only `--effort ultracode` mode, which combines xhigh
reasoning with dynamic workflow orchestration. Vibyra offers it only when the
native Claude model advertises xhigh: currently Fable 5, Opus 5, Sonnet 5,
Opus 4.8, Opus 4.7, and qualifying fast variants. Keep this direct-account
contract exact: every stop passes a native effort value the CLI accepts.

Rust/Tauri terminal integration selection is persisted in native
`Settings.enabledAgentIds`. A catalog model is visible and launchable only when
its mapped CLI is both selected there and installed; native families map to
Codex, Claude, Gemini, or Qwen, while other OpenRouter companies require a
selected Aider or OpenCode integration. `modelRunners.ts` owns this shared gate,
`TerminalIntegrations.tsx` owns the Settings rows, and both
`LaunchSettings.tsx` and `AgentPickerModal.tsx` filter through the same plan.
An empty selection must show no models even when CLIs exist on PATH.

Rust/Tauri provider-account acceptance also covers native failure and credential
boundaries, not only connected-state rendering. Use an isolated HOME/PATH fake
CLI matrix for zero-exit-without-auth, non-zero exit, cancellation, logout
failure, OAuth URL fallback, malformed Gemini settings, and fake Gemini tokens;
then launch a fake provider through the production PTY path with fake ambient
provider credentials. Personal-account PTYs must not inherit those credentials,
successful login without usable auth must leave `connecting` within a bounded
time, Gemini status must establish usable auth rather than token-file shape, and
logout failure must surface. Keep provider status probes off the awaited
workspace-startup path or run them concurrently with a bounded aggregate delay.

The implemented Rust/Tauri boundary uses parallel native status probes and
starts account refresh without awaiting it before workspace/project init.
Transient `connecting` or probe-error states preserve an already selected
runtime; explicit signed-out/not-installed states remove it. Built-in Codex,
Claude, and Gemini PTYs carry an explicit credential-removal list through
`LaunchSpec` into portable-pty, while shell, SSH, and custom runtimes retain
their existing environment behavior. A successful login process has a
three-second credential settle window and then becomes retryable instead of
remaining Authorizing. Gemini configuration rejects non-object JSON safely and
requires a usable-length refresh token or an unexpired access token. Logout is
reported successful after a nonzero provider command only when a follow-up
probe confirms signed out. Provider-company models outside the curated native
CLI set fall back to a selected Aider/OpenCode OpenRouter route rather than
being passed unverified to the personal-account CLI. Durable regression
coverage includes `provider_auth_integration_tests.rs`, PTY environment removal,
Gemini fixture validation, provider-account policy, and model-runner tests.

## August 14, 2026 - Rust/Tauri Provider-Neutral Bottom Composer

- The new `desktop-tauri` renderer bottom-anchors every non-shell/SSH AI CLI;
  the rule is based on xterm's active content/cursor rows, not a provider list,
  so Codex and present or future company CLIs share one behavior.
- `src/lib/terminalBottomAnchor.ts` owns near-bottom detection and the
  cell-height paint offset. `terminalRegistry.ts` reapplies it after live
  output, resync, scroll, exit, and settings changes. Manual scrollback clears
  the offset and input never forces the viewport down.
- `TerminalView.tsx` fits once immediately after mount, then settles later
  layout-driven fits for 120 ms. This prevents companion/grid transitions from
  repeatedly resizing the native PTY while keeping the composer on the final
  pane rows after reflow.
- Validate with `npm --prefix desktop-tauri test`, typecheck/build, and a live
  Codex launch plus right-workspace resize. The focused regression lives in
  `desktop-tauri/tests/terminalBottomAnchor.test.mjs`.

## August 14, 2026 - Rust/Tauri Model Discovery Startup

- The empty launcher derives launchable models by filtering its static/live
  catalog through native CLI detection. An empty initial `agentStore` can
  therefore look like an empty model catalog even though offline models exist.
- `App.tsx` now starts agent discovery and catalog refresh independently from
  settings, filesystem-listener, and project initialization. The launcher
  shows a checking state until native discovery finishes, then reports a real
  missing-runtime state only when no installed runner matches.
- Ownership is `src/lib/appStartup.ts`, `state/agentStore.ts`,
  `components/rail/LaunchSettings.tsx`, and `LaunchModelPicker.tsx`. Validate
  with `tests/appStartup.test.mjs`, the Tauri test/typecheck/build gates, and a
  reopened live picker containing the installed GPT, Claude, or Gemini walls.

## Native model catalog maintenance

`nativeAccountModels.ts` owns exact personal-account CLI eligibility; artwork
is presentation only. `mergeNativeCatalog.ts` adds the verified native roster
to both live OpenRouter results and existing caches, retaining live metadata.
Never replace native availability with OpenRouter availability. Current
additions are GPT-6 Astra, GPT-5.3 Codex Spark, and Claude Fable 5.1; verify IDs
against official provider docs/CLI metadata and update `modelEffort.ts` together.
`tests/modelCatalog.test.mjs` covers live refresh, old/offline caches, absent
artwork, exact launch IDs, efforts, and the integration-selection boundary.

## Mac resume continuity (September 2026)

See [[Mac Experience And Sessions]] before changing resume or saved-pane UI.
Claude pins IDs; Mac Codex discovers the owning process's rollout UUID.
Legacy chats use explicit pickers, never recency guesses. Resume preserves the
account, output and actual safe worktree, starts the replacement before teardown,
and exposes errors without destroying the saved pane. Exit tracking belongs to
the terminal event bus even when xterm is detached. The `plan` skill records the
Mac UI/recovery validation and release-branch comparison workflow.

## Pane grid density (September 2026)

`gridLayout.ts` no longer returns a column count from a fixed ladder. It
searches every column count against every font from the configured size down to
10px and scores each by visible terminal characters, discounting width past 64
columns, empty cells in the last row, panes a scrolling stage pushes off screen,
and a shrunken font. Panes under ~14 text rows are discounted hardest, because
that is the state the seventh pane used to force. One to six panes on a laptop
stage still resolve to the old layout, full font and full chrome; past that the
grid trades frame and font for lines.

`paneChrome.ts` owns the three chrome budgets (comfortable/compact/dense) and is
the single source for `terminal-density.css`, which spends the same pixels as
CSS variables, and for `spawnGeometry.ts`, which predicts the xterm grid from
them. All three must move together — `tests/desktopInvariants.test.mjs` fails if
they drift. The grid stops shrinking rows at `minPaneHeight` (ten lines at the
smallest font) and scrolls instead.

The layout, not the settings, owns terminal font size: `applySettingsToAll`
deliberately skips `fontSize` and `TerminalStage` reapplies it through
`setTerminalFontSize`. `measuredCellSize()` reports the font it measured at, and
`TerminalStage` caches the normalised base cell per font, or a measured cell
taken at a reduced font would feed back into the next layout. `terminalInstance.ts`
now owns building one xterm; `terminalRegistry.ts` is the map of them.
Coverage: `tests/terminalGrid.test.mjs`.

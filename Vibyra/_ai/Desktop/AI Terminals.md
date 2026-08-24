# Desktop - AI Terminals

Read this for Vibyra Desktop (`desktop-tauri/`) terminal panes, PTY-backed AI
sessions, provider model routing, launch settings, and provider-account
boundaries.

## Contracts

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

## August 23, 2026 - Exact Codex Session Recovery

- A live Codex pane receives its UUID inside the CLI, not at launch. On Linux,
  native session saves resolve the open rollout filename from the PTY descendant
  tree and persist that UUID as `agentSessionId`; resume must then launch
  `codex resume <uuid>`, never the ambiguous `--last` form when an ID exists.
- Ownership is `vibyra-core/src/pty/conversation.rs`, `commands/session.rs`, and
  `commands/terminal_args.rs`. Keep the same-agent/same-directory ambiguity
  guard for legacy panes that genuinely have no ID.
- For recovery, back up `~/.config/vibyra-desktop/session.json` before mapping
  intact `~/.codex/sessions` rollouts. Do not quit or restart Vibyra from one of
  its child terminals; stage the repaired file and apply it after the app exits.

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

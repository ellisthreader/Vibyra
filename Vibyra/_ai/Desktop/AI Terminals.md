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

Model artwork is resolved in `src/lib/modelArtworkData.ts` by ordered slug
matching. Put point releases before their family prefix so a model such as
Fable 5.1 cannot inherit Fable 5 artwork. Fable 5.1 owns the 128 px
`claude-fable-5.1.png` sky, peach-cloud, and moon tile derived from Anthropic's
launch treatment; keep version text and the family label legible at picker size.

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

## August 26, 2026 - Terminal Copy Had Never Been Implemented

- Copying from a pane did nothing at all until now: `terminalClipboard.ts`
  handled only `KeyV`. Three things have to be true at once for a terminal
  copy to work here, and none were: xterm ships **no** copy chord of its own,
  its selection is painted rather than a DOM selection, and `base.css` sets
  `user-select: none` on `body` — so WebKit's native Ctrl+C and its
  right-click Copy both had nothing to reach either.
- The selection must travel through Rust: `write_clipboard_text`
  (`commands/clipboard.rs`) reuses the process-lifetime `with_clipboard`
  handle, which exists because on X11 the clipboard owner has to stay alive to
  serve what it copied. Do not open a per-call `Clipboard` here.
- Chord policy lives in the pure `lib/terminalClipboardKeys.ts`
  (`clipboardIntent`): Ctrl+Shift+C copies, Cmd+C copies on macOS,
  Ctrl+Shift+V pastes, and **plain ^C and ^V stay the program's** — ^C is the
  only way to interrupt an agent mid-answer. Ctrl+Shift+C is swallowed even
  with an empty selection so it can never arrive as an interrupt.
  Right-clicking a selection copies it; with no selection the event is left
  alone. `tests/terminalClipboard.test.mjs` pins the matrix.
- The display-dependent half has an `#[ignore]`d Rust test
  (`copies_text_other_processes_can_read`) that sets the clipboard and reads
  it back with `xclip` from another process. CI is headless, so run it by hand:
  `cargo test --lib -- --ignored copies_text_other`.

## August 25, 2026 - Review Dock Tool And GitHub Pull Requests

- Safe-mode worktrees are now reviewable: `prepare_safe_workspace` returns
  `SafeWorkspace { cwd, branch, base_commit }` (`workspace_ref.rs` owns the
  serializable `SafeWorkspaceRef`), the ref rides `SessionInfo.workspace` →
  `PaneState.workspace` → session.json, so suspended panes review after
  restart. Review is the fifth dock tool (`components/review/`,
  `state/reviewStore.ts`, `lib/reviewPolicy.ts`; sheets `dock-review.css`,
  `review-diff.css`, `review-actions.css`).
- A successful configured Safe-mode launch opens the right dock on Review for
  the newest pane. `configuredLaunch.ts` triggers this only after spawn succeeds;
  shared or failed launches leave the user's dock unchanged. The renderer
  contract is pinned in `tests/safeWorkspaceReview.test.mjs`.
- The Review footer is intentionally three controls: select a file then
  **Reject selected**, **Approve all** remaining changes, or use the compact
  GitHub-logo button at the far right. Rejection confirms the exact path,
  accepts only a file in the current native status, retains the `vibyra/*`
  branch guard, handles untracked files and renames, then refreshes the list.
- Native half: `vibyra-core/src/review/` (status via `--name-status`/
  `--numstat` + untracked; bounded 512 KiB per-file diff; merge = `git add -A`
  in the worktree then `git diff --binary <base>` applied to the user repo
  with `apply --check` first — all-or-nothing, never commits; discard closes
  the pane first, then `worktree remove --force` + `branch -D`). Every merge/
  discard/PR path refuses non-`vibyra/*` branches — the ownership guard,
  since the renderer supplies the paths.
- GitHub: `vibyra-core/src/github.rs` + `commands/github.rs` shell out to
  `gh` (`git push -u origin` + `gh pr create`, URL parsed from stdout, only
  `https://github.com/` links may be opened). Repository status probes only the
  local `origin`; account status belongs to the integration manager so Review
  does not duplicate networked `gh` probes.
  Auth stays in `gh` — no tokens in Vibyra, same boundary as provider
  accounts. Contract tests: `tests/safeWorkspaceReview.test.mjs`,
  `review/tests.rs`, `github_tests.rs`.
- Settings → Integrations now owns GitHub account readiness through one shared
  renderer store and an AppState-owned native manager. It requests
  `repo,workflow,read:org,gist` (the last is part of GitHub CLI's minimum),
  verifies the same `gh api user` identity against
  `gh auth status` scopes, and unlocks Review only after both pass. Every `gh`
  process removes ambient GitHub token variables so automation credentials
  cannot silently replace the user's CLI account; `github_create_pr` repeats
  the permission check natively before commit or push.
- Browser login/refresh is tracked and cancellable. The bridge recognizes only
  the official `XXXX-XXXX` one-time-code prompt, copies the ephemeral code via
  the process-lifetime clipboard, feeds the expected newline to open GitHub,
  and never logs, serializes, returns, or stores the code. A zero-exit auth
  child is not success until identity and scopes probe ready. GitHub CLI 2.45
  writes human status to stderr and has no `auth status --json`; preserve the
  compatible parser and fake-CLI matrix. The Review GitHub control routes to
  Integrations while locked and reports a missing `origin` separately.
- The reusable external-CLI permission checklist lives in
  `.agents/skills/VibyraOptimse/SKILL.md`; use it when adding or repairing a
  desktop account integration.
- Deliberately not built: per-pane live change counts (would poll git per
  pane), CI watching, PR-comment iteration, worktree janitor.

## August 25, 2026 - Single Account Authority In Integrations

- Settings → Integrations is the only place a provider account is chosen. The
  rail launcher's per-project account dropdown (`LaunchAccountPicker.tsx`) and
  its `accountByProvider` override in `launchSettingsStore`/`configuredLaunch`
  were removed at Ellis's request — do not reintroduce a launch-time account
  picker.
- Every fresh launch inherits `Settings.activeProviderAccounts` (read at spawn
  in `terminalSpawnActions.ts`); only relaunch, restore, and account-switch
  paths pass an explicit `accountId`, because a pane keeps the login it
  started on. `tests/providerAccountLaunch.test.mjs` asserts `configuredLaunch`
  names no account.

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

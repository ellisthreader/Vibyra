---
title: AI Terminal Security And Reliability Audit
type: run
project: Vibyra
date: 2026-06-11
status: complete
tags:
  - ai/runs
  - project/vibyra
  - security
  - terminal
---

# AI Terminal Security And Reliability Audit

> [!info] AI quick context
> Durable run summary for Vibyra AI terminal hardening: credential stripping, sandbox checks, Team launch transactionality, PTY lifecycle, renderer preservation, and final desktop test pass.

Date: June 11, 2026

Scope: adversarial real-user testing and hardening of Vibyra's custom AI
terminal, official company CLI terminals, Team planning/launch, PTY lifecycle,
renderer behavior, credentials, workspaces, recovery, and cleanup.

## Security Fixes

- Expanded inherited credential stripping for Vibyra-managed runtimes. Provider
  prefixes and generic secret suffixes are removed before a terminal receives
  its scoped local gateway credential.
- Hardened Standard-mode file access with canonical real-path checks and
  existing-ancestor validation, blocking symlink and nonexistent-path escapes.
- Corrected restored read-only Codex sessions so recovery preserves enforced
  sandbox policy instead of silently widening access.
- Revoked terminal gateway grants when detached workers exit, not only when the
  bridge observes a normal close.
- Incremented persistent AI terminal runtime compatibility to version `18`, so
  stale workers are retired rather than reconnected under newer security rules.
- Managed Qwen now writes a mode-0600 Node preload guard that rewrites Docker or
  Podman `OPENAI_API_KEY=<scoped token>` arguments to name-only
  `OPENAI_API_KEY` before process spawn. Docker inherits the secret from its
  environment without exposing the value in host process argv.
- Live `/proc/<docker-pid>/cmdline` inspection confirmed the Qwen token value
  was absent from the real Docker child.

Primary modules:

- `desktop/lib/aiTerminalVibyraShell.mjs`
- `desktop/lib/aiTerminalVibyraAgentWorkspace.mjs`
- `desktop/lib/aiTerminalPersistentProcess.mjs`
- `desktop/lib/aiTerminalWorker.mjs`
- `desktop/lib/terminalGatewayAuth.mjs`

## PTY And Process Lifecycle

- Added a startup stability window so a provider that exits immediately after
  spawn is not reported as successfully started.
- Increased the first semantic assignment acknowledgement window to 30 seconds
  for cold native composers.
- Made script-backed shutdown terminate the provider process tree rather than
  leaving nested CLI or container processes alive.
- Added bounded Desktop HTTP and upgraded-socket shutdown: normal close first,
  then force remaining connections closed after one second.
- Preserved authoritative provider readiness, output, assignment IDs, and
  recovery state across renderer synchronization.
- Removed six verified stale bridge processes from this checkout, two detached
  `/tmp` test workers, and one orphaned Vibyra-owned Qwen container.
- Preserved the sole active bridge and its four current user terminal workers.

Primary modules:

- `desktop/lib/aiTerminalProcess.mjs`
- `desktop/lib/aiTerminalPersistentProcess.mjs`
- `desktop/lib/ptyTerminals.mjs`
- `desktop/lib/previewShutdown.mjs`

## Team Planning And Launch

- Kept Team planning cancellation active through provider response decoding.
  Late responses cannot reveal or commit a cancelled plan.
- Added bounded goal/path complexity signals for automatic `2-4` member Team
  sizing.
- Replaced permissive JSON handling with strict duplicate-key rejection for
  provider-authored Team plans.
- Added one corrective provider retry for schema-valid but semantically invalid
  plans, then fail closed.
- Enforced the current Team role contract during persistent worker recovery.
- Removed fake looping progress. The accepted setup advances once through:
  `Analyzing your prompt`, `Planning team roles`, and
  `Assigning individual roles`, then waits for real bridge evidence.
- Kept `Cancel` visible and planning feedback inside the launch action.
- Replaced independent renderer PTY POSTs with authorized aggregate
  `POST /desktop/terminal-teams/launch`.
- Aggregate launch validates shared Team identity, unique roles, capacity,
  project, model, and token source.
- The bridge starts all members and delivers bridge-compiled trusted role
  assignments. Renderer-provided task text cannot replace trusted role policy.
- Any member creation or assignment failure rolls back every created session,
  scoped gateway grant, persistent record, and prepared worktree.
- Failed aggregate launch also removes all deferred renderer records, so a
  partial Team is never left visible or running.

Primary modules:

- `desktop/lib/terminalTeamRoutes.mjs`
- `desktop/lib/ptyTerminals.mjs`
- `desktop/lib/terminalTeamPlannerClient.mjs`
- `desktop/lib/terminalTeamProviderPlanner.mjs`
- `desktop/lib/terminalTeamPlannerInput.mjs`
- `desktop/assets/app.terminals-team-planning.js`
- `desktop/assets/app.terminals-controls.js`

## Renderer And Accessibility

- Preserved connected xterm elements across structural fallback renders.
  Existing terminals are detached, the shell is replaced, then the same xterm
  elements are restored and fitted. Reorder/removal no longer disposes and
  replays unaffected terminals.
- Suppressed xterm mounting during the replacement render to prevent a duplicate
  instance from being created before restoration.
- Enabled xterm screen-reader mode.
- Added keyboard tab reordering with `Alt+ArrowLeft` and `Alt+ArrowRight`,
  including `aria-keyshortcuts` and focus restoration.
- Kept drag-and-drop ordering for pointer users.

Primary modules:

- `desktop/assets/app.terminals-pty-runtime.js`
- `desktop/assets/app.terminals-pty.js`
- `desktop/assets/app.terminals-controls.js`

## Live Native CLI Validation

- Kimi Code launched through the managed Vibyra gateway and reached
  authoritative provider state `ready`.
- Mistral Vibe launched through the managed Vibyra gateway and reached `ready`
  after roughly 20 seconds of silent cold initialization. A short observation
  window can misclassify this normal startup as a failure.
- Qwen Code launched its official Docker sandbox. The host Docker argv contained
  `--env OPENAI_API_KEY` by name only and no scoped token value.
- All live test terminal sessions and the Qwen test container were closed after
  validation.

## Test Coverage

- Added aggregate Team rollback coverage proving that a later member failure
  removes an earlier successfully started member.
- Added Qwen guard tests that execute a fake Docker child and verify no secret
  appears in its received argv.
- Updated terminal input tests for enabled screen-reader mode.
- Added source-contract coverage for xterm preservation and keyboard ordering.
- Re-ran focused Team, PTY, renderer, Qwen, process, and live readiness checks.
- Final `npm run test:desktop-ai`: `449/449` passed.
- Final focused renderer regression: `18/18` passed.
- `node --check` and `git diff --check` passed.

## Durable Rules

- Planned Teams launch only through the aggregate bridge transaction.
- Native CLI scoped credentials must never appear in command-line arguments.
- Recovery must fail closed when runtime or Team role contracts are stale.
- Structural terminal rerenders must preserve unaffected xterm instances.
- Mistral readiness needs a bounded cold-start allowance of about 20 seconds.
- Cleanup must prove ownership before killing a process or container and must
  preserve active user sessions.

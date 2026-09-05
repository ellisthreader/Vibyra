---
name: vibyra-optimise
description: Audit and refactor an app for permission breaches, code organization, file-size limits, and optimization. Use when asked to find places where users should approve or decline potentially sensitive actions, add balanced approval UI, split large files, organize code into focused types/contexts/hooks/components, or enforce a no-source-file-over-200-lines standard.
metadata:
  short-description: Permission and code-size audit
---

# VibyraOptimse

Use this skill when the task is both product-sensitive and structural: permissions, user approval flows, refactors, file-size limits, and app code organization.

## Core Standard

Find the sweet spot:

- Do require approval for actions that write files, execute generated code, apply agent edits, connect/control another device, spend credits, expose private local paths, or persist trust decisions.
- Do not require approval for read-only previews, local draft text, obvious navigation, reversible UI state, or low-risk status refreshes.
- Prefer project/session-scoped trust over global trust. “Always allow” should be narrow and visible.
- Keep every source code file under the project’s limit, commonly 200 lines. Exclude generated folders and temporary tool artifacts.

## Workflow

1. Read repo-specific agent instructions and memory notes first.
2. Map the risk surface before editing:
   - write/apply/discard paths
   - remote desktop or device control
   - billing/credits
   - authentication/session persistence
   - local file browsing and generated app preview
3. Choose approval points:
   - add explicit approve/deny for irreversible or non-obvious effects
   - add discard/cancel endpoints where pending work exists
   - make UI copy concrete: what will change, where, and whether trust will persist
4. Refactor with small ownership boundaries:
   - split hooks by action family
   - split UI into feature components
   - move shared types to `types`, `context`, or feature-local type files
   - move route/service helpers into traits/modules only when the boundary is real
5. Enforce the file-size gate after every major split.
6. Run focused validation:
   - typecheck
   - syntax checks for changed backend/desktop files
   - targeted smoke tests for approval/apply/discard flows when available

## Line-Count Gate

Use a gate like this, adjusted for the repo’s generated directories:

```bash
rg --files -g '!tmp' -g '!node_modules' -g '!backend/vendor' -g '!.git' -g '!.expo' -g '!.vibyra-agent' \
  | rg '\.(ts|tsx|js|jsx|mjs|php|css|html)$' \
  | xargs wc -l \
  | awk '$2 != "total" && $1 > 200 {print}' \
  | sort -nr
```

If the gate reports generated artifacts only, say so explicitly and keep the app-source gate clean.

### Vibyra Desktop

For the desktop app, use the canonical repo gate instead of the ad hoc command
above:

```bash
node scripts/check-desktop-lines.mjs
```

It scans first-party JavaScript, TypeScript, React, CSS, HTML, and Rust under
`desktop-tauri/`. It prunes dependency/build trees and reports the generated
provider-logo exclusion separately. Do not treat the desktop app as compliant
until this command reports zero first-party files over 200 lines.

## Mobile Code-Length Report

For a phone-only hierarchy or optimization summary, use the same manifest and
physical-line counter as the hard gate:

```bash
node scripts/check-source-lines.mjs --summary --scope scripts/source-scopes/mobile.json --limit 200
```

Present the generated compact table with file count, total lines, average,
largest file, and over-limit count. Also report application source separately
from tests/test support. Exclude assets, desktop, backend, generated, vendor,
cache, and temporary files, and name those exclusions. Do not use a shell line
counter for the final figures when the canonical checker is available.

## Refactor Patterns

- Provider files should coordinate hooks, not own every action.
- Large hooks should become a small coordinator plus focused hooks such as `use*PromptActions`, `use*FileActions`, `use*ConnectionActions`, or `use*ResultHandlers`.
- Large components should extract repeated panels, menus, cards, and modals into feature-local components.
- Backend controllers should delegate response shaping, validation helpers, and apply/discard logic to traits or service modules.
- Desktop/server route files should delegate asset serving, project browsing, project creation, and agent execution to modules.
- Avoid creating a single “helpers” dump. Name modules after the behavior they own.

## Desktop Terminal Reliability

When optimization work touches Vibyra terminals, preserve these invariants:

- For desktop integrations backed by an official third-party CLI, leave
  credential storage with that CLI and remove inherited automation-token
  variables from every status and action command. Track and cancel browser
  auth children, treat a zero exit as provisional, then verify the same account
  identity and exact required scopes before unlocking actions. Keep project
  readiness (such as a Git remote) separate from account readiness, enforce
  permissions again in native mutating commands, and cover login, scope
  upgrade, device-code handling, cancellation, and logout failure with a fake
  CLI matrix.

- An off-screen pane stays logically `hidden`, but native output delivery becomes
  `hibernated`. Detach its frontend event handler without disposing its registry
  xterm, then request an authoritative ring-buffer resync when it becomes active.
- Resume, restart, and account-switch actions are single-flight per pane. Start
  and verify the replacement before closing a working PTY, and tear down any
  replacement whose UI slot disappeared during launch.
- Give each pane a stable persistence ID. Serialize session saves, merge carried
  replay history with the current native ring, and do not let metadata-only
  saves replace a full snapshot.
- Block updater installation until the final full save succeeds, expose the
  installing state, and keep restart failures retryable.
- Keep the frontend pane cap aligned with the native session limit. Test rapid
  process exits because a child can finish before manager registration completes.
- Route keyboard, paste, drag/drop, and dictation input through the shared
  per-session serial writer. Never issue independent fire-and-forget
  `write_terminal` invokes: concurrent IPC can overtake and make terminal text
  appear one keystroke behind. Keep the queue behavior and IPC wiring tests.
- Treat renderer and font readiness as consumer contracts, not startup hints.
  Every xterm must await the cached renderer decision and an actual non-empty
  regular/bold bundled-font load before `open()` or `fit()`. Prewarming alone
  can lose to a fast restore. Attach one renderer per xterm and expose the
  observed backend on the terminal host for live inspection.
- Treat store focus and browser focus as separate terminal state. After an
  asynchronous xterm mount, focus its textarea only when the pane is still the
  active logical target, connected, non-inert, and unobscured by a modal. When
  a toast or palette answers a keyboard-only update/permission prompt, restore
  xterm focus after that control unmounts without overriding a newer pane choice.
- Keep `onData` free of viewport scans, fitting, or scroll anchoring; typing is
  an IPC hot path. Use xterm's `scrollOnUserInput` and let scroll/output events
  own anchoring work.
- Keep attention dots, strip badges, and Home status indicators static while a
  terminal grid is mounted. Perpetual CSS pulse animations can invalidate the
  WebKit/WebGL compositing surface and saturate a renderer even when PTY input
  is quiet. Before restoring an infinite animation near terminals, A/B it in a
  multi-pane native window and compare steady renderer CPU and process faults.
- Serialize Home, project, and Preview visibility changes through one shared
  transition queue. Home must hide native terminal delivery, stop previews,
  unwatch the workspace, and clear project-owned workspace state.
- Before spawning any AppImage PTY, strip the current and stale sibling
  `/tmp/.mount_*` entries from inherited path variables and remove AppImage's
  owned variables. Validate the new child environment, not only the planner.
- Run focused bus, visibility, relaunch, persistence, and updater tests; stress
  the native PTY limit; and verify single-instance ownership. For a terminal
  regression, also type a fast exact string in a real native window, inspect
  font and renderer state, sample steady renderer CPU, and check the PTY child
  environment. Do not claim a signed-in live terminal journey when account
  restoration prevented it.

## Validation Checklist

Before final response:

- App-source line-count gate returns no files.
- Typecheck passes for TypeScript projects.
- Changed JS/MJS files pass `node --check` when applicable.
- Changed PHP files pass `php -l` when applicable.
- Permission flow has all three states represented where needed: pending, approved/applied, denied/discarded.
- The final answer names any excluded generated folders, failed checks, or remaining risks.

## Releasing performance changes

- Establish the live source/version before porting an older audit checkout. Use
  an isolated branch from that live source and preserve unrelated dirty work.
- Rebase performance claims too: a fix already in the live release cannot count
  as a new measured gain. Record hardware, workload, source hashes and limits.
- Keep synchronous native input admission and ordering intact; bound reservations
  before allocation, and make rejected input visible even with notices muted.
- Validate a changed production launcher in the actual build image before
  cutover, including stream concurrency, authorization forwarding and shutdown.

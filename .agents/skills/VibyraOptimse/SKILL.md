---
name: vibyra-optimise
description: Audit and refactor an app for permission breaches, code organization, file-size limits, and optimization. Use when asked to find places where users should approve or decline potentially sensitive actions, add balanced approval UI, split large files, organize code into focused types/contexts/hooks/components, or enforce a no-source-file-over-200-lines standard.
metadata:
  short-description: Permission and code-size audit
---

# VibyraOptimse

Use this skill when the task is both product-sensitive and structural: permissions, user approval flows, refactors, file-size limits, and app code organization.

For a whole-software performance audit, use the evidence workflow below and
`Vibyra/_ai/Performance Audit Workflow.md`; do not turn an audit request into
an unrelated structural rewrite.

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

- For whole-PC lag or unexpected app exits, inspect `journalctl -u systemd-oomd
  -b` alongside current RAM, swap, and disk pressure before attributing the
  symptom to rendering. Memory can look healthy after oomd kills an app scope.
  Scope usage includes child agents/builds: measure descendants during a live
  recurrence before naming a leaking component. See Obsidian's
  `Desktop/Linux Memory Pressure And Storage.md`; disk cleanup alone does not
  fix memory exhaustion.
- For multi-day performance reports, inspect retained sysstat `saDD` files
  with `sadf` alongside dated oomd events. Preserve interval/timezone context;
  machine-level history does not establish per-process historical ownership.
- For build-driven HDD stalls, inspect the running Cargo target environment
  and open `.cargo-lock` path, then `findmnt -T` that path. Explicit targets
  can bypass an SSD-backed global config. Copy regenerable caches to SSD,
  wait for their builders to release them, compare the final copies, then
  preserve old paths with symlinks before removing verified HDD duplicates.
  Check that worktree cache symlinks remain gitignored and retain user-only
  access. Do not migrate live source worktrees as if they were build caches.
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
  input helper. The current `write_terminal` Tauri command is synchronous and
  only enqueues onto the native per-session writer thread; preserve both
  ordering and nonblocking IPC. Do not restore the old frontend promise chain
  that waits for each invoke response, or make the native command async.
  Keep the native ordered-write and blocked-reader tests plus IPC wiring tests.
- Treat renderer and font readiness as consumer contracts, not startup hints.
  Every xterm must await the cached renderer decision and an actual non-empty
  regular/bold bundled-font load before `open()` or `fit()`. Prewarming alone
  can lose to a fast restore. Attach one renderer per xterm and expose the
  observed backend on the terminal host for live inspection.
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

## Performance Audit Evidence

- Resolve the active repo before measuring. `/home/ellis/Desktop/SaaS` is a
  retired checkout; its retirement note points to `/home/ellis/Desktop/Vibyra`.
- Inventory desktop, Expo phone/browser, Laravel API, and public marketing
  separately. Record HEAD, dirty work, hardware, build mode, fixture sizes,
  sample counts, and concurrent load. A file count is not coverage percentage.
- Preserve user data and unrelated edits. Use scratch build output, synthetic
  fixtures, in-memory SQLite, array cache/session/mail, and isolated native
  XDG directories. Disable real account/keyring access in diagnostic launches.
  Do not trigger paid provider requests or production load tests for a baseline.
- Use the desktop verification commands, `npm run check:mobile`, Laravel
  tests, and both frontend production builds. An Expo asset-transform error is
  a build blocker even when TypeScript and unit tests pass; use
  `vibyra-expo-web-diagnostics` for malformed image bytes.
- Run performance measurements sequentially. Compare the same fixture, include
  warmup, reverse native probe phase order, and distinguish debug Rust from
  packaged release behavior. The probe's `paint` field is a next-animation-frame
  proxy, not measured physical screen presentation or input-to-photon latency.
- Attribute CPU to the owned process tree; one full core is 100%. Summed RSS
  includes shared pages more than once. Do not infer a leak or app ownership
  from whole-machine pressure, compile time, or a short stress run.
- For watcher exclusions, test kernel watch registration as well as delivered
  events. Callback filtering alone does not exclude generated directories from
  the recursive native watcher. For sync, measure bytes and serialization work
  as well as SQL counts; constant query count can still process megabytes.
- Separate measured findings, source-confirmed risks, proposed targets, and
  untested production/device behavior. Recheck concurrent source changes before
  applying a measured result to the latest UI. Publish raw synthetic evidence
  and a prioritized acceptance/rollback plan under `docs/audits/`.
- Stop only diagnostic processes owned by the audit. If a diagnostic Tauri
  build reused the shared Cargo binary path, restore the default build output;
  do not install or publish the diagnostic executable.

## Implementing Performance Changes

- Coalesce snapshots before expensive normalization, and bound pending writes.
  Preserve credential-clear barriers, identity invalidation and lifecycle flushes.
- For incremental state, preserve exact preimages through HTTP middleware,
  guard message identity, and replay uncertain writes before newer edits. Never
  treat a conflict as permission to overwrite the complete cloud state.
- Validate production worker changes with real authenticated fixture requests,
  mixed SSE/health traffic, graceful cleanup and an explicit rollback. Keep
  deployment and physical-device verification distinct from local test results.
- Native A/B comparisons must use the same frontend and frozen native sources
  except the variable under test. Use Cargo's actual `vibyra-desktop` artifact;
  a stale `debug/Vibyra` can exist beside it. Preserve direct keyboard IPC and
  reuse its rejection handler rather than adding per-write promise queues.
- See `Vibyra/_ai/Performance Implementation.md` for the current sync and
  resource-boundary contracts before modifying these paths.

## Agent Mode Audit Evidence

- Start with `Desktop/Agent Mode Audit Boundaries.md` in Obsidian. Resolve the
  published version to its source worktree; main and installed CLI versions can
  differ from the release's recorded verification versions.
- Trace policy through UI, native authority, provider configuration and actual
  tool execution. A permission label, shell classifier or SDK callback alone
  does not establish filesystem/network containment. Include bridge-down,
  fresh/resumed sessions, grant revocation and all task launch paths.
- Validate renderer-supplied IDs and ownership before filesystem effects. Use
  audit-owned scratch fixtures for malformed-ID and containment probes.
- Distinguish process exit from verified task outcome. Check routine status,
  atomic admission, cancellation, persistence failure and cursor-based recovery.
- Label React/mock-IPC screenshots as fixtures. Record live-engine opt-in and
  supported CLI versions; passing unit suites is not a live-provider claim.

## Validation Checklist

Before final response:

- App-source line-count gate returns no files.
- Typecheck passes for TypeScript projects.
- Changed JS/MJS files pass `node --check` when applicable.
- Changed PHP files pass `php -l` when applicable.
- Permission flow has all three states represented where needed: pending, approved/applied, denied/discarded.
- The final answer names any excluded generated folders, failed checks, or remaining risks.

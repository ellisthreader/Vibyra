# Vibyra unpublished work inventory — 6 September 2026

Publication follow-up: [0.6.0 delivery table](../releases/0.6.0-publication.md). This audit remains the original pre-release snapshot.

This is a release-provenance audit, not an implementation or release approval. Rows group related behavior; the 14 Agent rows belong to one implementation, not 14 independent branches.

## Verified baseline and coverage

- Public Windows, AppImage and Debian feed: **0.5.0**, checked live on 6 September. [Release feed](https://vibyra-production.up.railway.app/web-api/releases).
- Published source: `1b6c92bf6a31fe4363d0ea8e1de71b10d0c73d6f` (tag `v0.5.0`). [Successful build](https://github.com/ellisthreader/Vibyra/actions/runs/34033875878).
- Inspected **73 registered worktrees**, **133 local/remote references** (98 local and 35 remote, including the remote HEAD alias), fresh origin fetch, and all **5 open pull requests**. No Git stashes were listed.
- Fifteen worktrees had local changes. Status/file hashes were compared with the published tree; branch deltas were compared from their merge base, then meaningful differences were checked against current release source.
- Whole-file differences are candidates, not proof of a missing feature: later refactors, cherry-picks, replacements and deleted obsolete code were checked before classification.
- Files in generated/dependency directories, ignored build output, personal vault notes and raw validation transcripts were excluded from product findings. The retired SaaS checkout was identified separately and is not a release source.
- This covers discoverable repository refs/worktrees/PRs on this machine and origin. It does not claim coverage of edits on other machines, deleted/unreferenced branches, or every ignored local file.
- Backend entries describe absence from the 0.5.0 source baseline. The desktop feed alone does not prove an independent backend hotfix has not been deployed. Mobile presence in a desktop repository tag is likewise not App Store/TestFlight delivery evidence.
- No builds, provider calls, application changes, branch merges, restarts or publication were performed. Existing validation below is reported evidence, not a fresh rerun.

## Unpublished Agent implementation

All rows below are in `codex/agent-page-completion`, worktree `vibyra-1a062ef22f2-0`. Its HEAD remains `287bfa0`, while **93 tracked desktop files are modified and 62 desktop files are untracked**. The published release contains the committed baseline, not these working files.

| ID | Area / change | What is missing or pending | Status | Evidence |
|---|---|---|---|---|
| A01 | Agent — Task history | Active/recent task list, search, filters and task details. | Uncommitted; absent from 0.5.0 | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/TaskHistory.tsx) |
| A02 | Agent — Saved task outputs and evidence | Original instructions/access/account snapshot, saved answers, tool records and Codex file diffs. | Uncommitted; absent from 0.5.0 | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_runs/artifacts.rs) |
| A03 | Agent — Durable tasks and recovery | Succeeded/failed/cancelled/interrupted outcomes, admission limits, crash recovery and renderer event reconciliation. | Uncommitted; absent from 0.5.0 | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_runs/store.rs) |
| A04 | Agent — Codex App Server integration | New/resumed conversations use checked permission profiles and structured provider events. | Uncommitted; absent from 0.5.0 | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/codex_server/runtime.rs) |
| A05 | Agent — Current access and revocation enforcement | Intersect task access with teammate limits; recheck grants and stop work when access is revoked. | Uncommitted improvements | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/gate/context.rs) |
| A06 | Agent — Stronger approval decisions | Request/context fingerprints, tool-call identity, authority rechecks and stricter command classification. | Uncommitted improvements | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/gate/decide.rs) |
| A07 | Agent — Safer attachments and managed files | Ownership/symlink checks, bounded file copies, attachment manifests and provider image/PDF delivery. | Uncommitted improvements | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_chats/managed_paths.rs) |
| A08 | Agent — Reviewable learning proposals | Memory/skill proposals stay pending human review with task provenance and bounded proposal counts. | Uncommitted improvements | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/bridge/proposal_tools.rs) |
| A09 | Agent — Handoff receipts | Link parent/child tasks, preserve separate access and return saved child outcomes to the parent. | Uncommitted improvements | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/commands/agent_handoff_receipt.rs) |
| A10 | Agent — Routine execution reliability | Routines share task admission/execution checks and persist failed/cancelled outcomes correctly. | Uncommitted improvements | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/scheduler.rs) |
| A11 | Agent — Draft and conversation recovery | Per-chat text/access/account drafts, IME handling, retry settings and paginated conversation recovery. | Uncommitted improvements | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/state/agentDraftStore.ts) |
| A12 | Agent — Restore archived chats and teammates | Visible archive restoration rather than losing access to archived conversations/profiles. | Uncommitted; absent from 0.5.0 | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/ArchivedChats.tsx) |
| A13 | Agent — Task starters and provider readiness | Editable release-review/code-change/evidence-comparison starters and provider compatibility rechecks. | Uncommitted; absent from 0.5.0 | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/TaskStarters.tsx) |
| A14 | Agent — Explicit task account and execution limits | Per-chat provider account choice, stored account reference, compatibility floor, deadlines and observed tool-count cancellation. | Uncommitted improvements | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/ComposerAccount.tsx) |

[Implementation status](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/docs/implementation/agent-page-completion.md) records prior frontend/native/Linux-provider checks, but explicitly states the implementation was not merged, installed or released. Signed packaged-window and supported-platform acceptance still need review before shipping. Existing Agent Mode and its original Decisions bridge are already shipped; this table describes the later improvements.

## Other unpublished implementation, drafts and maintenance

| ID | Area / change | What is missing or pending | Status | Evidence |
|---|---|---|---|---|
| M01 | Models — GPT-6 Astra in desktop | Model picker entry, artwork, effort options and runner routing. | Committed in 0.5.1; not published | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/release-0.5.1/desktop-tauri/src/lib/staticModels.ts) |
| M02 | Backend — Astra backend model support | Chat/streaming aliases and billing configuration for Astra. | Absent from 0.5.0 source; runtime deployment not independently checked | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/release-0.5.1/backend/config/billing.php) |
| I01 | Host — Persistent computer-side Host | Standalone Host owns terminal sessions, events, history, projects, process stop and recovery. | Committed WIP; absent from release line | [source](/home/ellis/Desktop/Vibyra-iOS/host/crates/engine/src/sessions.rs) |
| I02 | Host/mobile — Encrypted pairing and relay | Noise transport, pinned host identity, invitations, local approval, relay and saved reconnect trust. | Committed WIP plus local changes; not released | [source](/home/ellis/Desktop/Vibyra-iOS/host/crates/server/src/auth.rs) |
| I03 | iPhone — New mobile workspace interface | Conversation-first composer, searchable sidebar, project/computer selection and light/dark/system themes. | Committed foundation plus uncommitted redesign | [source](/home/ellis/Desktop/Vibyra-iOS/mobile/src/ui/WorkspaceApp.tsx) |
| I04 | iPhone — Live remote terminal and controls | ANSI/Unicode terminal, output reconciliation, observation/control leases, keyboard keys, resize, reconnect and stop. | Committed foundation plus uncommitted implementation | [source](/home/ellis/Desktop/Vibyra-iOS/mobile/src/terminal/TerminalSurface.tsx) |
| I05 | iPhone — Project files and change review | Host-backed file browsing/text reads and colored working-tree diffs for the selected project. | Committed foundation plus uncommitted redesign | [source](/home/ellis/Desktop/Vibyra-iOS/mobile/src/ui/ReviewSheet.tsx) |
| I06 | iPhone — Optional sample workspace | Clearly labelled sample conversations/decisions/previews in Settings, separate from live Host work. | Uncommitted demo UI; not a live provider feature | [source](/home/ellis/Desktop/Vibyra-iOS/mobile/src/demo/useDemoWorkspace.ts) |
| R01 | Release — Exclude downloaded installers from Git | Remove old tracked release artifacts and ignore release-set so package verification sees only the candidate set. | Cleanup committed; latest CI ran earlier broken commit | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/release-0.5.1/desktop-tauri/.gitignore) |
| D01 | Desktop draft — Disable unfinished Custom agents/settings entry | A draft WIP gate also disables the old dock Chat panel; the published dock has since replaced Chat with Ask. | Uncommitted draft; requires selective review, not wholesale merging | [source](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a061431c4e-1/desktop-tauri/src/lib/wipFeatures.ts) |
| P18 | Maintenance — Backend PHP dependency updates | Open grouped proposal: 7 direct updates; release lockfile does not contain the complete proposal. | Open PR; requires reconciliation/testing | [source](https://github.com/ellisthreader/Vibyra/pull/18) |
| P19 | Maintenance — Website build dependency updates | Open grouped proposal: 9 direct updates; release lockfile differs. | Open PR; requires reconciliation/testing | [source](https://github.com/ellisthreader/Vibyra/pull/19) |
| P20 | Maintenance — Root/legacy Expo dependency updates | Open grouped proposal: 31 direct updates; distinct from the replacement mobile app. | Open PR; requires scope/SDK review | [source](https://github.com/ellisthreader/Vibyra/pull/20) |
| P21 | Maintenance — GitHub Actions updates | Open grouped proposal: 8 action updates against the older main branch. | Open PR; requires reconciliation with current release workflow | [source](https://github.com/ellisthreader/Vibyra/pull/21) |

The [0.5.1 build](https://github.com/ellisthreader/Vibyra/actions/runs/34042433769) built all three platform packages but failed the aggregate check with `Expected 3 release metadata files, got 6`. The failed source was `0049e3f`; cleanup `c2e61e0` is later. That cleanup does not include the Agent working files.

The [iOS status report](/home/ellis/Desktop/Vibyra-iOS/docs/ios-mobile-implementation-status.md) records prior Host/mobile/browser verification. It explicitly leaves Desktop-to-Host integration, signed physical-device acceptance, platform qualification and production security/account work open. This is unpublished work in progress, not a ready replacement for the installed desktop.

Dependency PRs target the older `main` branch. Some constituent updates overlap later release work; the proposed sets are not fully present. They must be reconciled, not merged wholesale as proof of release readiness.

## Differences that are already shipped or superseded

| Area found in old worktrees | Release evidence | Audit conclusion |
|---|---|---|
| Terminal copy/paste and shortcut labels | `write_clipboard_text`, native clipboard helper, terminal clipboard wiring and tests exist in 0.5.0. | Already included; old helper/test spellings differ. |
| Startup update gate and terminal focus | `fe3f684`; current `focusMountedTerminal`, blank-pane click focus and overlay restoration. | Already included through a newer implementation; old handoff helper is superseded. |
| Project activity, configuration and safe close | `a67d740`; native project activity and project controls exist. | Already included; standalone menu prototype/plan remains local. |
| Review fleet, collisions, selection and conflict handling | `3c7d908` and later Review work; current source uses Approve/Reject and GitHub connection guidance. | Already included and refined; old Land/Discard wording is not an omitted improvement. |
| Ask Vibyra and voice orb | `b1f6c5f` and later UI polish; `AskPanel`, `AskVoiceOrb`, voice bars and workspace context exist. | Already included; backup branch and dirty Ask worktree are older versions. |
| Guided New Project builder | `eae63dc`, current scaffold source and native command wiring. | Already included despite the original feature branch not being a release ancestor. |
| Software-compositing terminal pacing | `flush_config` uses the same 250 ms background interval, plus paint-aware delivery. | Already included; dirty prototype has an older structure. |
| Workspace watcher/input/cloud-persistence performance work | 0.4.4 release-line changes and byte-identical working-file counterparts in the main checkout. | Included in 0.5.0 source; stale local copies must not overwrite newer refinements. |
| Homepage and standalone downloads redesign | `2a75ffc`, merged into 0.5.0; previous turn verified live feed and publication. | Already included. |
| Manual Settings update check | Current `SettingsUpdatesPane` and update state handling. | Already included; original feature branch has been superseded. |
| Old Electron terminal PR #2 | [PR #2](https://github.com/ellisthreader/Vibyra/pull/2), 7 June, changes `desktop/assets` and `desktop/lib`. | Open but targets the retired runtime; not a current Tauri release candidate. |
| Changelog HTML mockup | Local `design-previews/vibyra-changelog/`; actual packaged changelog component exists. | Standalone design prototype, not omitted production wiring. |
| Legacy Chat WIP gate | Old dock Chat/Memory was replaced by Ask; Custom agents gate is separately listed as D01. | Old dock portion is superseded; do not disable the new Agent/Chat modes using this draft. |

## Plans or absent capabilities, not completed unpublished code

- Local/offline F8 transcription: the inspected worktree changed provider-boundary documentation only; no local transcription implementation was found there.
- Enterprise Agent features such as shared authorization, always-on workers, organization budgets, connector gateway and shared approvals remain explicitly outside the local Agent implementation.
- Unified existing Desktop chats on the new phone client require Desktop-to-Host IPC; the current phone connects to the standalone Host.
- Rich mobile sample decisions/previews do not establish live structured approvals or encrypted live preview support.
- macOS downloads are unavailable in the public feed; no completed unpublished macOS release was established by this audit.

## Release handoff

First preserve and review the dirty Agent implementation in an integration worktree based on the latest release line. Reconcile Astra and the installer cleanup there, run the relevant checks and signed package acceptance, then publish the exact reviewed commit. Treat the iPhone/Host work as a separate WIP release track. Review D01 for current applicability and the dependency PRs against current release manifests.

Do not merge all old worktrees: several would restore outdated UI, remove later safety checks, or revert already shipped refinements.

A machine-readable table is alongside this report: `unpublished-changes-2026-09-06.csv`. Coverage/source inventory: `unpublished-changes-2026-09-06-evidence.json`.


# Vibyra Agent page: release audit and enterprise completion plan

Audited 4 September 2026. Scope: Agent Mode in the latest published Vibyra Desktop release, its native execution path, adjacent shared Chat Mode contracts, and the architecture needed for enterprise use. This is an audit and recommendation document; production fixes have not been implemented.

## Verdict

**Agent Mode is a substantial local-agent foundation, but it is not ready to be presented as enterprise-ready.** The principal blockers are enforceable permissions, correct task outcomes, recovery and live visibility, and trustworthy result records. Improving the visual design alone would leave those blockers intact.

There is already useful architecture worth keeping: a distinct structured agent runtime, account-scoped SQLite persistence, native account resolution, named teammates, bounded event normalization, versioned skills, approval cards, timezone-aware routines, and shared UI components. The right next step is to finish one dependable task lifecycle across both providers, then add a small number of valuable enterprise workflows.

“100% audited” would imply evidence this review does not have. This report distinguishes reproduced defects, source-confirmed gaps, rendered fixture observations, and proposed capabilities. It is not a security certification or a claim that every operating-system/provider combination was exercised.

## 1. What “latest version” means here

The live [Vibyra release feed](https://vibyra-production.up.railway.app/web-api/releases) identifies **0.4.3** as the latest published desktop version. Windows, Linux AppImage and Debian packages are advertised; macOS is unavailable in that metadata. A copy is retained in [release-metadata.json](release-metadata.json).

The supplied /home/ellis/Desktop/SaaS checkout is retired. The usual /home/ellis/Desktop/Vibyra checkout is dirty and reports 0.2.8; it is not the release source. The authoritative source inspected was:

    /home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0

Its clean HEAD is 287bfa0016dab9fb2f54701cc96c6696837d92f0. The recorded 0.4.3 source commit is 4abe89647205ce9bfb2e94c892b50112a3939f41. The difference is only a 37-line release-memory update; the application source is identical. [Provenance record](provenance.json)

This identifies the published source; it does not establish which binary is currently installed or running on every machine. Packages were not downloaded and independently rebuilt or checksum-verified during this audit.

The local CLIs now report Codex 0.153.2 and Claude Code 2.1.261, whereas adapter comments describe verification against 0.150.1 and 2.1.258. That drift is a reason to maintain compatibility tests, not proof that either current CLI is broken.

## 2. Context and current implementation

Agent Mode was introduced in 0.3.5, gated in 0.4.2, and reopened with fixes in 0.4.3. The current Obsidian “Agent Mode As Built” note records the recent approval bridge, event-field normalization, error boundary and UI changes. Some explanatory comments and notes overstate the implementation; findings below supersede those claims for this release. A reconstruction-plan reference in the older note did not resolve in the checked vaults.

Agent Mode is separate from Code Mode's terminal panes. It uses structured Claude/Codex child-process output, rather than presenting a terminal transcript. Code Mode remains mounted to preserve live PTYs, and mode-level error boundaries protect it from Agent/Chat rendering failures.

A teammate is a local account-scoped database record containing its brief, provider engine, optional model/effort, permission default, private home, additional folder grants, memory, skills, peer rules and routines. A conversation has its own provider session identity. New teammates default to Standard permissions and Suggest reflection, and receive a writable private home.

The execution path is:

    Agent page → React stores → Tauri commands → native account-scoped AgentWorld
      → assemble brief, memory, skills and grants → provider adapter → CLI process
      → normalize and persist events → direct-chat channel → transcript
      → terminal outcome, reflection and routine bookkeeping

Claude tool questions can travel through the local MCP permission bridge into Vibyra's Decisions queue. The Codex adapter does not use that bridge. Routine and handoff turns use the same executor but discard its live event callback.

The PHP /agents/start, /agents/apply and /agents/discard routes are under the legacy desktop-route feature flag. They are not the task backend used by this Agent page. Current Agent IPC invokes native commands directly. [web.php:56](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/backend/routes/web.php:56) [agentChats.ts:100](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/ipc/agentChats.ts:100)

| Area | Present | What is incomplete |
|---|---|---|
| Dashboard | Search, waiting approvals, running section, next routines, counts | Complete workload visibility, finished results and reliable recovery |
| Teammates | Create, brief, provider, model/effort, grants, archive/delete | Capability-aware setup, provider-account selection, clear archive recovery |
| Chat | Persistent sessions, formatted answers, tool blocks, stop, retry, copy | Reattachment, history paging, draft isolation, reliable result provenance |
| Decisions | Inline/global cards, deny/approve, expiry and orphan handling | Coverage of every execution path and exact, immutable action authority |
| Memory | Ledger, proposals, correction, pinning and budget | Reliable candidate generation, relevant retrieval and governed sharing |
| Skills | Procedure, trigger, verification, boundary, versions and rollback | Model-to-proposal tool wiring and measured skill effectiveness |
| Routines | Schedules, timezones, pause, manual run, history | Correct outcomes, consistent admission rules and execution while app is closed |
| Handoffs | Peer allowlists, approval path, bounded delivery rules | Typed delegated tasks, result return and coherent parent/child tracking |
| Integrations | Provider account infrastructure elsewhere; plugin schema | Agent-specific connector gateway and delegated organization permissions |
| Enterprise administration | Native personal account scope | Shared task ownership, role policy, audit export, fleet execution and governance |

Primary entry points: [AgentMode.tsx:1](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/AgentMode.tsx:1), [agent_roster.rs:1](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/commands/agent_roster.rs:1), [turns.rs:48](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/turns.rs:48).

## 3. Evidence and validation

| Check | Result | Practical limit |
|---|---|---|
| Desktop frontend test suite | 761 passed, 0 failed | Includes tests beyond this page; not 761 end-to-end agent journeys |
| Desktop TypeScript | Passed | Does not establish permission enforcement |
| Canonical desktop source-size gate | Zero first-party files above 200 lines | Generated provider-logo exclusion reported separately |
| Locked Rust core library suite, Rust 1.88 | 317 passed, 0 failed | Does not execute the whole Tauri shell or live provider sessions |
| Isolated native probe | Reproduced classifier, grant-mapping, null-clear and path-deletion findings | Actual core source, scratch-only data; probe resolved cached dependencies separately |
| Current React components, styles and fonts | Six screenshots; no observed page-level horizontal overflow or uncaught JS errors | Synthetic stores, mocked IPC, Chrome rather than signed-in Tauri/WebKit |
| React interaction checks | Reproduced draft/access carryover and IME submission | Synthetic send handler; no prompt was sent to a provider |
| Live release metadata and local CLI help | Queried during audit | No paid model request or packaged-app certification |

The default Rust 1.85 toolchain was too old for the locked dependencies. Re-running the core suite with installed Rust 1.88 passed. This is an environment requirement, not an Agent Mode test failure.

Evidence: [frontend tests](frontend-tests.log), [core tests](core-tests.log), [typecheck](typecheck.log), [line gate](lines.log), [native probe](native-probe.rs), [probe output](probe.log), [UI measurements](ui-results.json), [interaction results](ui-interaction-results.json).

Not exercised here: authenticated packaged Linux journeys, Windows/macOS behavior, live two-provider resume/approval flows, production organization access, accessibility assistive technology, long-running load/recovery, full shell-crate tests, release build/signing, or penetration testing of the whole application. Live-engine tests exist but require an explicit opt-in; their existence is not evidence that they ran in this audit.

## 4. Release blockers: fix before broader autonomous use

Priority P0 below means a safety or authority blocker for an enterprise pilot. It is a task priority, not a CVSS score or a claim of unauthenticated remote exploitation.

### A01 — Chat deletion can remove a directory outside the account root. P0; reproduced.

The native delete command calls attachment cleanup before validating/deleting the account's chat record. The folder helper joins a renderer-supplied chat ID directly onto the base path. An absolute ID replaces the base; traversal IDs are also not rejected there. The cleanup then recursively deletes that path.

The isolated probe created only an audit-owned scratch directory outside a fake account root and confirmed that cleanup removed it. No user directory was touched. Exploitation of the command requires access to the local renderer/IPC surface; this audit did not establish a remote entry point.

**Fix:** validate the ID format and account ownership before any filesystem operation; derive managed paths from trusted records; reject absolute/traversal input; enforce containment and symlink-safe handling; report failures. Apply the same ordering to attachment creation, which currently copies before the database operation can reject an invalid chat.

**Acceptance:** malformed, absolute, traversal, foreign-account, nonexistent and symlink fixtures cannot create, copy or delete anything outside the intended managed chat directory.

Evidence: [agent_chat.rs:103](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/commands/agent_chat.rs:103), [attachments.rs:39](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_chats/attachments.rs:39), [attachments.rs:127](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_chats/attachments.rs:127).

### A02 — The approval classifier treats effectful operations as reads. P0; reproduced.

The real classifier returned Read / Allowed for these strings: sed with its write command, sort with an output file, git tag creation, git stash, and git remote add. These strings were classified only; they were not executed. A Read tool aimed outside any granted folder and the Task tool were also classified as Read without examining the delegated task's capabilities.

The gate checks folder grants for recognized file-write tools, but does not apply that same boundary to all reads or shell effects. Command-name matching cannot establish arbitrary shell behavior or filesystem confinement.

**Fix:** use typed tool operations with native validation and an operating-system sandbox enforcing readable/writable roots and network policy. Unknown shell behavior must not gain automatic permission through a “read” label. Delegate child capabilities explicitly. Retain a classifier for useful explanations and routing, not as the sole security boundary.

**Acceptance:** tests cover alternate command forms, subprocesses, path escapes, indirect file access, delegated tools and outbound destinations; denied capabilities remain denied regardless of wording.

Evidence: [shell_patterns.rs:98](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/approvals/shell_patterns.rs:98), [classify.rs:31](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/approvals/classify.rs:31), [decide.rs:39](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/gate/decide.rs:39).

### A03 — Codex folder grants and Full mode do not match the UI's containment promise. P0; mapping reproduced.

Read-only places are included in the same additional-directory list as writable places. Codex receives them as --add-dir, whose installed help explicitly describes additional writable directories. Full maps to danger-full-access. The Vibyra Claude approval bridge is unused by the Codex adapter.

On resume, the adapter does not propagate the freshly assembled directory list. Thus a grant being added or revoked in Vibyra is not reliably represented in the resumed provider configuration.

This proves the mapping/contract defect; it is not a claim that every operation bypasses every provider default. Current live behavior must be verified for supported CLI versions.

**Fix:** represent read and write capabilities separately; maintain equivalent effective policy on new and resumed sessions; connect native provider approvals; prohibit an uncontained mode from being described as limited to granted folders. Fail a capability check when the adapter cannot enforce the requested policy.

**Acceptance:** both providers pass identical fresh/resume tests for read-only roots, writes outside roots, revoked grants, network effects and approval denial.

Evidence: [places.rs:138](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_profiles/places.rs:138), [codex.rs:36](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_runtime/codex.rs:36), [codex.rs:79](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_runtime/codex.rs:79), [adapter.rs:104](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_runtime/adapter.rs:104).

### A04 — Turn permissions can exceed the teammate default, and the gate reads a different authority. P0; UI reproduced, native source confirmed.

The composer comment says a turn can only narrow the teammate's access. In practice, all three choices remain enabled for a Plan teammate, and native execution accepts the requested permission in preference to the profile. The gate separately derives write authority from the current profile rather than a persisted effective turn policy.

The browser probe changed the profile to Plan while the composer remained Full and confirmed that the send handler received Full. This is a contract violation even when the person can separately edit their own teammate settings.

**Fix:** explicitly define a teammate policy ceiling and a per-task request; intersect them with organization and runtime capabilities. Persist that effective policy and use it in the provider, broker and UI. Any deliberate ceiling change must be a separate, visible policy edit.

**Acceptance:** direct IPC cannot broaden a constrained task; changing a profile while a card waits cannot silently widen that task.

Evidence: [AgentComposer.tsx:59](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/AgentComposer.tsx:59), [turns.rs:64](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/turns.rs:64), [context.rs:49](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/gate/context.rs:49).

### A05 — A failed Claude approval bridge weakens permissions silently. P0; mapping reproduced.

When the bridge is unavailable, Standard and Full map to acceptEdits. The source explicitly intends a bind failure not to fail the turn. This removes the approval route the UI promises; the fallback was confirmed by calling the actual mapping function.

**Fix:** block execution with an actionable status when required policy infrastructure is unavailable. Only offer a separately verified restricted mode if it preserves the requested guarantees.

**Acceptance:** gate startup failure, disconnect and timeout cannot produce a broader provider mode or silently execute an effect that required a decision.

Evidence: [claude.rs:52](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_runtime/claude.rs:52), [turns.rs:121](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/turns.rs:121).

## 5. Reliability and completion findings

These are P1 unless marked P2. “Source confirmed” means the composed code path establishes the gap, while a packaged failure-injection test remains part of the proposed acceptance work.

| ID | Finding and evidence | Required completion and acceptance |
|---|---|---|
| A06 | **Routine failures can be recorded as success.** After preparation, the executor records failure/cancellation events but returns Ok. The scheduler determines success from whether that function returned an error. Source confirmed. [turns.rs:153](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/turns.rs:153) [scheduler.rs:116](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/scheduler.rs:116) | Return a typed outcome including succeeded, failed, cancelled, interrupted and blocked. A nonzero exit, spawn failure, cancellation or provider error must agree across chat, routine history, notifications and metrics. Distinguish process completion from verified task success. |
| A07 | **Reload and unattended work lack complete live recovery.** Direct sends have a channel; routine/handoff callbacks are empty. After reload, adoptRunning copies busy IDs once without subscribing to their events or clearing them on completion. Cached transcripts are not refreshed. Source confirmed. [agentChatStore.ts:86](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/state/agentChatStore.ts:86) [agentChatStore.ts:157](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/state/agentChatStore.ts:157) [agentWorkBus.ts:44](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/lib/agentWorkBus.ts:44) | Persist events with cursors and expose snapshot-plus-subscribe recovery. Reload during running, waiting and finishing must show the same work, catch up without duplicates and converge to its terminal state. Dashboard totals must come from authoritative jobs, not whichever chat lists were loaded. |
| A08 | **Execution admission and lifecycle are not atomic.** The busy check precedes asynchronous execution; registration occurs later and can replace an existing handle. Manual routine launch checks enabled but bypasses the scheduler's other admission rules. Deleting active work is not coordinated with its runner. Source confirmed. [agent_chat.rs:155](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/commands/agent_chat.rs:155) [hub.rs:1](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/hub.rs:1) [agent_routines_cmd.rs:92](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/commands/agent_routines_cmd.rs:92) | Use one atomic job claim, global/per-agent limits and a common launch policy for direct, scheduled, manual and delegated work. Define whether manual launch may override a global pause; display that rule. Duplicate sends/clicks cannot start duplicate jobs; delete/cancel/sign-out must settle runners before cleanup. |
| A09 | **Persistence failures can leave executing work without a durable record.** Event append, session binding and state updates often discard errors. Source confirmed. [turns.rs:71](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/turns.rs:71) | Treat failure to record required authority/outcome events as a controlled stop. Add transactional state/event updates and recovery reconciliation. Exercise full disk, locked DB and restart faults; surface incomplete records rather than inventing success. |
| A10 | **Historical context and approval provenance are incomplete.** The assembler creates a context fingerprint, but prepare drops it. The footer uses the current profile model. Approval resolution accepts an omitted expected fingerprint; generic tool payloads are summarized to 2,000 characters. The gate does not recheck revoked authority after the wait. Source confirmed. [prepare.rs:80](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/prepare.rs:80) [TurnFooter.tsx:45](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/TurnFooter.tsx:45) [broker.rs:144](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/approvals/broker.rs:144) [classify.rs:106](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/approvals/classify.rs:106) | Persist a run snapshot and canonical full action digest independently of its UI summary. Bind actor, job, provider tool-call ID, resource, payload, authority version and expiry. Require exact approval identity, consume it once, and revalidate current revocations immediately before execution. Export the actual historical model/context. |
| A11 | **Attachments are only partly connected to model input.** Files are copied; only image paths enter TurnPlan. The Claude builder ignores those images. General documents have no explicit parsed input manifest in this path. Codex receives all retained chat images on subsequent turns. Source confirmed. [attachments.rs:109](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_chats/attachments.rs:109) [adapter.rs:75](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_runtime/adapter.rs:75) | Advertise only supported inputs. Show whether an attachment was included, extracted or rejected. Add per-turn selection, aggregate size/token limits, MIME validation, safe parsing and source citations. Test each provider with images, PDF/text, unreadable/oversized files and deletion. Copying a file is not proof the model received it. |
| A12 | **Automatic memory formation is not reliably wired.** Reflection recognizes REMEMBER lines, but the context assembler does not instruct the model about that marker despite the comment saying it does. Automatic mode trusts the candidate's class and limited overlap rules. Source confirmed. [reflect.rs:9](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/reflect.rs:9) [agent_context.rs:68](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_context.rs:68) | Use a structured proposal operation, source evidence and an explicit review policy. Keep Suggest as the initial default. Separate facts/preferences from permissions; learning must never grant new authority. Test capture, correction, contradiction, expiry and malicious imported instructions. A second model call on every turn is unnecessary. |
| A13 | **Skill proposals and handoffs do not yet form a complete agent workflow.** Skills have authoring/version/history UI, but no corresponding general model proposal tool is exposed by the current approval bridge. Handoffs are user-triggered messages with guards, rather than typed child jobs with verified results returning to a parent. Source confirmed. [server.rs:1](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/bridge/server.rs:1) [agent_mail_wake.rs:1](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/commands/agent_mail_wake.rs:1) | Add narrowly scoped proposal/delegation tools only after the task model exists. Persist input, expected output, child authority, budget, parent linkage and completion receipt. Demonstrate one useful delegated workflow; do not count delivered text as completed delegated work. |
| A14 | **Provider account and resource controls are incomplete at the page boundary.** Native execution accepts an account reference, but the page does not supply one; routines/handoffs use defaults. Usage display has no enforced task budget or general runtime deadline. Installed capability probes do not establish every send contract. Source confirmed. [agentChatStore.ts:116](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/state/agentChatStore.ts:116) [env.rs:1](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/env.rs:1) [scheduler.rs:108](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/src/agent_mode/scheduler.rs:108) | Bind an explicit credential reference and capability/version snapshot to each run. Add deadline, maximum steps, retry allowance and spend/resource limits. Stop predictably on exhaustion, unavailable credentials or unsupported inputs; distinguish estimated spend from provider-billed usage. |
| A15 | **Results are not independently verifiable artifacts.** Changed-files UI reads today's uncommitted diff, which can include later or unrelated edits. It correctly labels that limitation, but it cannot establish this turn's change or restore it. Source confirmed. [ChangedFiles.tsx:13](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/ChangedFiles.tsx:13) | Store task-scoped artifacts, before/after revision identity, test receipts and source links. Use isolated worktrees for code edits where appropriate. Provide review/apply and conflict-aware recovery; never promise universal undo for external effects. |
| A16 | **Older chat history is unreachable through paging. P2.** Native storage provides the newest 400 events and an earlier-page API; the UI only fetches the initial page. Data remains in the DB but is not reachable by scrolling back. Source confirmed. [transcript.rs:22](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_chats/transcript.rs:22) [agentChats.ts:40](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/ipc/agentChats.ts:40) [agentChatStore.ts:86](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/state/agentChatStore.ts:86) | Add cursor paging with sequence deduplication, scroll anchoring and bounded rendering. A conversation with thousands of events must expose its complete history without losing position or duplicating blocks. |
| A17 | **Composer state can cross chat boundaries, and Enter ignores IME composition. P1.** The rendered probe retained a private draft and Full selection after switching chats, then an isComposing Enter submitted them to the new chat. Retry also omits the original permission, and the composer clears text before a failed send can recover it. Reproduced plus source confirmed. [AgentComposer.tsx:30](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/AgentComposer.tsx:30) [TurnFooter.tsx:87](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/TurnFooter.tsx:87) | Key drafts/access to the chat and run; retain failed drafts; guard IME Enter; make retry preserve or explicitly review original scope. Test teammate/chat switches, keyboard composition, retry after policy changes and send failure. |
| A18 | **Resetting model/effort to default is broken. P2.** JSON null deserializes to outer None for Option<Option<String>>, so the update is interpreted as “leave unchanged.” Reproduced using the actual AgentUpdate type. [record.rs:88](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src-tauri/crates/vibyra-core/src/agent_profiles/record.rs:88) | Use an explicit missing/set/clear update contract or appropriate deserializer. Test field absence, null and a nonempty value through IPC and reload. |
| A19 | **Archive/delete navigation and error visibility need completion. P2.** Missing selected teammates render null; deleted chat selection is not consistently reset. Several failed loads become empty arrays, making failure look like “nothing here.” Source confirmed. [AgentSurface.tsx:35](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/components/agentMode/AgentSurface.tsx:35) [agentChatStore.ts:80](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/state/agentChatStore.ts:80) [agentChatStore.ts:144](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/state/agentChatStore.ts:144) | Provide an archive/restore destination and deterministic post-delete selection. Show loading, empty and failed states distinctly, with a retry action. Coordinate destructive operations with active jobs. |
| A20 | **Future routine dates show “just now.” P2.** The past-only relative-time helper treats a negative delta as recent. Reproduced on dashboard and routine fixtures. Missed-run copy also needs to describe the scheduler's grace period accurately. [relativeTime.ts:1](/home/ellis/.config/vibyra-desktop/terminal-worktrees/vibyra-1a062ef22f2-0/desktop-tauri/src/lib/relativeTime.ts:1) | Use future-aware time labels and an exact local date/time with timezone. Test tomorrow, DST transitions, machine timezone changes, sleep/reopen and missed-run handling. |

## 6. Rendered UI assessment

The existing visual system should be retained. Shared panels, list rows, buttons, dialogs and settings groups already provide reasonable consistency. The 1440 × 900 dashboard is readable, and no page-level horizontal overflow appeared in the six inspected fixtures.

The main interaction/layout findings are:

- At the configured minimum 960 × 600 size, the 236-pixel primary rail and 240-pixel chat rail leave about 484 pixels for the work area. A pending approval plus the composer reduces the transcript to a small scrolling region. Collapse the secondary rail at narrow widths and show an expandable approval summary with a clear pending count.
- Dashboard space is spent on summary counts and a large empty running card. Recent completed work, blocked tasks and useful outputs deserve that space. The main action should be “New task”; teammate creation can remain a secondary setup action.
- Settings are readable, but long select labels clip. Use short values with supporting explanations. Effective access should show concrete roots, connector permissions and runner location, rather than relying on Plan/Standard/Full alone.
- Provider readiness needs to be visible before composing: selected account, supported inputs, model availability and policy restrictions.
- An empty teammate should offer a few relevant task templates and a small first successful workflow. Avoid requiring a long setup wizard.
- Retain one Decisions destination and inline task approvals, using the same underlying action record. Add expiry, full effect preview and link to the task's evidence.
- Complete keyboard focus, accessible names, status announcements, IME input, reduced motion, contrast and zoom checks before declaring accessibility complete. This audit is not a WCAG certification.

Screenshots show current source with synthetic data and mocked IPC, not a signed-in native execution:
[dashboard](dashboard-dark.png), [chat](chat-dark.png), [minimum window](chat-minimum.png), [settings](settings-light.png), [routines](routines-light.png), [empty dashboard](empty-dark.png).

## 7. Current AI research: what to adopt and why

Research was checked against primary documentation available on 4 September 2026. The following are architectural recommendations for Vibyra, not claims that adopting an SDK automatically makes the product secure.

| Option | Current evidence | Recommendation for Vibyra |
|---|---|---|
| **Codex App Server** | An interactive host protocol with threads, turns, event streams and explicit command/file approval requests carrying item, thread and turn identity. Some extensions, including dynamic tools, remain experimental. [Official App Server documentation](https://learn.chatgpt.com/docs/app-server) | The strongest next integration to evaluate for Codex. Prototype approvals, reconnection, interruption and grant changes against a pinned supported version, then migrate behind the existing Rust adapter contract. Avoid coupling the product's core policy to experimental fields. |
| **Claude Agent SDK with hooks and approval callbacks** | Permission rules/modes can approve actions before canUseTool is called. PreToolUse hooks provide an earlier control point; accepting edits automatically permits filesystem operations. [Claude permissions](https://code.claude.com/docs/en/agent-sdk/permissions), [approval callbacks](https://code.claude.com/docs/en/agent-sdk/user-input) | Evaluate an SDK adapter or supported equivalent transport, with native policy validation and tested hooks covering every relevant tool. A callback alone is insufficient. Keep Rust as authority even if a small packaged SDK sidecar is necessary. |
| **OS-level containment** | Claude's documentation distinguishes permission rules from operating-system sandbox enforcement; tool-specific read rules do not constrain arbitrary processes. [Claude permission boundaries](https://code.claude.com/docs/en/permissions) | Enforce files and network outside the model. Separate read roots, write roots and destinations; test Linux and Windows independently. No prompt or approval classifier should be represented as a sandbox. |
| **Direct model/tool APIs for bounded business tasks** | OpenAI exposes function tools, web/file search, MCP integration and tool discovery in its current tool platform. [OpenAI tools](https://developers.openai.com/api/docs/guides/tools) | Useful for report generation, retrieval and typed business actions where a coding shell is unnecessary. Reuse the same job, policy, approval and evidence contracts. Do not require a second orchestration framework merely to call a tool. |
| **Managed cloud agents** | Claude Managed Agents offers persistent hosted sessions, execution environments and external tools. It is beta; its documentation currently excludes Zero Data Retention and HIPAA BAA eligibility for this feature. [Managed Agents overview](https://platform.claude.com/docs/en/managed-agents/overview) | An optional execution provider for compatible customers. Evaluate data handling, economics, portability and tenant requirements before adoption. It does not replace Vibyra's organization authorization or approval records. |
| **Durable workflow concepts** | Checkpointing and resumable execution are established patterns in LangGraph's persistence documentation. [LangGraph persistence](https://docs.langchain.com/oss/python/langgraph/persistence) | Adopt checkpoint, retry and replay concepts in the current architecture. There is no demonstrated need to rewrite the Rust core into Python. |
| **MCP for enterprise connectors** | The current authorization specification defines resource-bound OAuth authorization; security guidance addresses token passthrough and confused-deputy risks. [MCP authorization](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [MCP security](https://modelcontextprotocol.io/docs/2025-11-25/tutorials/security/security_best_practices) | Use reviewed connector definitions, scoped credentials and typed effects. MCP is a transport/interface, not proof that a server is trustworthy. Validate destination, tenant and allowed action at execution. |
| **Agent evaluations and tracing** | Anthropic recommends evaluating actual outcomes and trajectories with suitable deterministic/model/human graders. OpenTelemetry's agent conventions remain in Development. [Agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [OpenTelemetry agent spans](https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md) | Build task-outcome evaluations and a stable internal trace schema. Export compatible spans through a versioned adapter; redact sensitive content and avoid making evolving telemetry conventions your storage schema. |

The provider trend supports separating the reasoning engine, execution environment and durable session. Anthropic describes that separation in its current [managed-agent architecture article](https://www.anthropic.com/engineering/managed-agents). For Vibyra, the practical benefit is being able to improve or replace a provider without changing task identity, policy or historical evidence.

### Model selection and context

There is no evidence from this audit that one model is best for every enterprise task. Keep model selection provider-aware and evaluate it on Vibyra's actual workflows: verified outcome, latency, cost per accepted result, correction rate and boundary compliance. Pin evaluated versions where available and re-run a regression suite before changing defaults.

Use faster/cheaper models for classification, extraction and routine summaries when they meet the quality bar; reserve stronger reasoning for ambiguous engineering work. Route based on measured task performance. Do not silently switch provider, credential account, privacy boundary or spend class during a run.

Context should be relevant and inspectable. Start with structured metadata and lexical retrieval, then add hybrid/vector retrieval only if evaluations show a benefit. Retrieve within the current account and document access rules; include source identity, revision and citations; keep a token budget and make stale sources visible. Anthropic's [context-engineering guidance](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) supports deliberate context selection and compaction rather than indiscriminate accumulation.

Separate organization policies, task instructions, retrieved material, tool output and remembered facts. Treat repository files, documents, websites and handoff results as potentially untrusted data. They cannot modify the task's permissions, connector credentials or organization policy.

Memory should improve repeat work through evidence-backed proposals and correction. Skills should be versioned, reviewable procedures with required inputs and checks. Neither should be allowed to silently rewrite governing rules.

### Multi-agent use

Start with one dependable coordinator. Introduce a small, bounded set of specialists only for independently useful subtasks, such as a read-only release review alongside test execution. Each child should have an explicit deliverable, narrowed permissions, its own trace, a shared parent budget and a stop condition.

Do not make an autonomous agent swarm the default interaction. It increases concurrent failure and reconciliation cases before Vibyra has a durable parent/child task contract. Measure whether delegation improves accepted outcomes enough to justify its cost and latency.

## 8. The most useful enterprise product to build

**Proposed product promise: delegate a bounded task, see what it is doing, control consequential actions, and receive a result with evidence.**

The user journey should be:

1. Choose an outcome or task template.
2. Confirm the workspace/data sources, runner, access and budget.
3. See a short plan when the work is complex, then observe progress.
4. Resolve specific decisions with the actual effect visible.
5. Review the artifact and verification results.
6. Accept/publish where authorized, or request a revision.
7. Save successful repeat work as a routine or approved skill.

This can fit the existing page. A Work dashboard should show Needs attention, Running and Completed, with Routines and Teammates as supporting destinations. A task detail view can contain its conversation, activity, artifacts and scope. Administrative controls should be available to the relevant roles without dominating every user's chat.

### Five initial workflows, in suggested order

| Workflow | User value | Deliverable and authority boundary |
|---|---|---|
| **Scoped code change** | Turn a clear issue into reviewable work | Isolated change, diff, checks and PR draft. Write only in the granted worktree; publishing uses an exact approved action. |
| **Release/readiness review** | Catch regressions and missing release evidence | Findings linked to source/tests, failed-check explanation and release checklist. Read-only by default; no implicit deployment. |
| **Evidence-backed research** | Reduce time comparing technical/business options | Cited report, source dates, assumptions and decision criteria. Documents remain subject to access rules. |
| **Incident triage** | Assemble evidence and suggest a response quickly | Timeline, logs/queries, suspected causes and a proposed remediation. Production changes require a separate approved action. |
| **Recurring project report** | Remove repeated status gathering | Scheduled draft assembled from selected sources, with changes since the previous report. Sending to an external service is a distinct connector operation. |

Prioritize GitHub plus one issue/document system actually used by design partners. Add messaging as draft-then-send. Connector breadth should follow repeat customer demand; a large connector catalogue is not a substitute for reliable work.

“Enterprise” should be scoped with pilot customers. Personal local work, shared team administration and regulated deployment have different requirements. The first pilot should prove a few workflows and their operational controls, with deployment-specific requirements recorded explicitly.

## 9. Recommended architecture

Preserve Tauri/React for the desktop and Rust for local execution and policy. Extend the existing Laravel backend only where shared organization state or always-on operation is required.

    Desktop task UI
        ↓ authenticated task service / local coordinator
    Durable jobs, policy snapshots, approvals, events and artifacts
        ↓ common runner contract
    Local Rust runner | Customer-hosted worker | Optional managed provider
        ↓ scoped execution and connector gateway
    Codex / Claude / typed model tools / approved business systems

### A. One durable job contract

Create a task/run model distinct from its conversation. Record owner, organization, parent task, agent/skill versions, prompt/input references, workspace revision, provider credential reference, effective capabilities, budget and desired artifact.

Use explicit queued, running, waiting_for_approval, blocked, succeeded, failed, cancelled and interrupted states. Record leases/heartbeats and atomic transitions. All launch paths should use the same admission rules.

Persist events with sequence IDs, snapshots and a reliable notification mechanism. Consumers reconnect from a cursor. Make external effects idempotent where supported; reconcile receipts after crashes rather than blindly replaying sends or deployments. Where execution outcome is unknown, show that uncertainty and require reconciliation.

### B. Native capability authority and precise decisions

Effective permission is the intersection of organization policy, user authority, teammate policy, task scope and runner capability. A model can request a change; it cannot grant itself one.

Enforce readable/writable roots, allowed tools, outbound destinations, connector resources, deadlines and budgets. Keep ordinary reads and already-authorized edits low friction. Ask for genuinely new or consequential effects with a precise preview, then bind approval to that effect. Support denial, expiry, revocation and safe cancellation.

Separate policy failure from provider failure. Unsupported enforcement means the run cannot start under that policy. Credential access belongs to a native/service broker, with scoped references rather than raw secrets in prompts or renderer state.

### C. Artifacts and verification

A result should identify what was produced, where it came from, what checks ran, and what remains uncertain. Store reports, source links, diffs, revision hashes and test receipts against the run.

The runner must distinguish “the model said it is done,” “the process exited,” and “the requested acceptance criteria passed.” Choose deterministic checks where possible, calibrated model graders for appropriate judgments, and human review for consequential release decisions.

Use checkpoints and isolated workspaces for reversible local changes. External actions need compensating operations or explicit irreversibility; do not advertise universal rollback.

### D. Enterprise services

Shared operation requires organization/workspace membership, roles for authors/operators/approvers/admins, centrally enforced policy, explicit service identities and worker authorization. Add approval ownership/escalation and admin revocation.

Always-on schedules require a durable scheduler and a registered worker or hosted execution provider. The UI should name where a task runs and what happens if that worker is offline. Desktop-only routines should continue to state clearly that the application must be open.

Add retention/export/deletion controls for transcripts, attachments, memory and artifacts; encryption appropriate to the deployment; audited administrative access; redacted observability; backup/restore; quotas; and a documented provider-data boundary. SSO and provisioning should follow the pilot's actual identity requirements. These are proposed enterprise capabilities, not a claim that the entire Vibyra backend was audited for their absence.

### E. Compatibility, operations and cost

Maintain a tested provider-version matrix and capability negotiation. Use signed release distribution and dependency review for the runner and any new SDK sidecar. A provider update must not silently change approval semantics.

Record task success, failure class, approval wait, tokens, estimated/billed cost, queue time and runtime. Include a task/organization concurrency cap, retry budget, time limit and resource ceiling. Where usage arrives late or is estimated, communicate that limitation instead of promising an exact hard monetary cutoff.

## 10. Completion sequence and exit criteria

| Phase | Deliverable | Exit gate |
|---|---|---|
| **1. Restore trustworthy boundaries** | Fix A01–A05; precise grant/approval contracts; provider compatibility spike | All adversarial path/policy tests pass on supported providers/runners. Bridge failure never broadens access. |
| **2. Make work recoverable** | Typed outcomes, atomic admission, durable event subscription, cancellation/recovery and explicit failure states | Reload, process exit, duplicate send, DB failure and app restart all produce consistent task/history/approval state. |
| **3. Finish the page's existing promise** | Draft/input fixes, complete history, supported attachments, memory/skill proposal wiring, results and accurate routine UI | An ordinary user can create, run, review, revise and repeat a task without developer intervention. |
| **4. Prove three useful workflows** | Code change, release review and cited research templates; artifact checks; measured model defaults | Predefined representative task suite passes the agreed quality/cost bar; failures are actionable and recoverable. |
| **5. Add shared enterprise operation** | Organization policy, connector gateway, shared decisions, durable workers, retention/export and admin tools | Cross-user/tenant tests, worker revocation, schedule recovery, audit export and backup restore pass. |
| **6. Controlled pilot and release** | Design-partner use, support runbooks, telemetry and a staged rollout | Repeated successful customer work, no unresolved boundary defects, documented deployment limits and tested recovery. |

Do not estimate a credible completion date until Phase 1's provider/sandbox prototype establishes what can be reused. A small visual patch and a full organization/worker platform have very different scopes. Size the backlog after that technical uncertainty is resolved.

### Required acceptance matrix

- Providers: fresh conversation, resumed conversation, default/narrowed policy, revoked folder/account, unsupported version and unavailable bridge.
- Authority: absolute/traversal/symlink paths, read-only roots, shell variants, delegated tools, prompt injection in retrieved material, unknown connectors and network destination changes.
- Decisions: approve, deny, expire, revoke, duplicate response, stale payload, task completion before response and permission changes while waiting.
- Lifecycle: simultaneous send, repeated manual run, cancellation during a tool, sign-out, renderer reload, child crash, app restart, DB write failure and unknown external-effect outcome.
- Data: missing/set/clear settings, drafts across chats, IME input, large histories, attachment extraction and removal, source permissions, memory contradiction and skill rollback.
- Routines: app open/closed, sleep/wake, missed-run grace, DST/timezone changes, overlapping runs, worker offline and correct failed/cancelled status.
- Outputs: real artifact existence, correct task-scoped diff, deterministic test receipts, supported citations and conflict-aware recovery.
- Enterprise: ownership/role changes, tenant separation, credential revocation, redacted logs, export/deletion, quotas and backup restoration.
- UI/runtime: native Linux and Windows, minimum and large windows, light/dark, zoom, keyboard/screen-reader flows, Code Mode continuity and representative long-session performance.

### Proposed pilot measures

These are starting targets to agree with customers, not measured results:

- 100% pass on the explicitly enumerated permission and tenant-boundary regression suite; no known unresolved P0 findings.
- At least 90% accepted outcomes on a representative 50–100-task workflow suite, with the task definition and grading method recorded.
- No duplicate external effects in the defined restart/retry tests, and no silent loss of a pending decision.
- Measure human correction time, cost per accepted result and time saved; compare them with the customer's current process.
- Collect repeat use and willingness to pay for the selected workflows before expanding connector and delegation scope.

## 11. Changes made by this audit

Created this report and its synthetic evidence bundle, and recorded compact source/validation boundaries in the active Obsidian memory and audit skill. No production application source, provider account, deployment, release, or user conversation was changed.

The release worktree remained clean. Existing unrelated changes in the main checkout were preserved.

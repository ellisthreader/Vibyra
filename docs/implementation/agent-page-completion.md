# Agent page implementation and release readiness

Updated 5 September 2026. Implementation branch: `codex/agent-page-completion`.
Baseline: Vibyra Desktop 0.4.3; source HEAD `287bfa0016dab9fb2f54701cc96c6696837d92f0`.
The implementation is in the isolated `vibyra-1a062ef22f2-0` terminal worktree.
It has not been installed over the user's app, merged into the main checkout, or released.

Reference: [original audit](/home/ellis/Desktop/Vibyra/docs/audits/agent-mode-2026-09-04/REPORT.md).

## Result and limits

The page now has a durable task lifecycle and a usable task history, with saved outputs, original instructions, access snapshots, provider accounts, recovery, editable task templates and archive restoration. Direct chats, routines and handoffs share the executor. Filesystem and approval boundaries have been tightened, and unsupported provider execution fails closed.

This is **not a claim of 100% enterprise readiness**. The full audit proposed a phased program, including shared organization services, workers, connectors, pilot evaluation and release validation. Those services have not been built by this local Agent page change. The Linux execution environment has now been repaired and both real providers passed ten defined native acceptance scenarios, covering code changes, permissions, attachments, denial, cancellation, grant revocation, crash recovery and saved conversations. These results do not replace packaged-app, cross-platform or enterprise deployment validation. See the [live acceptance report](agent-page-validation/live/README.md).

## Implemented behavior

| Area | Change and practical effect |
|---|---|
| Managed files | Validate canonical UUIDs, chat ownership, managed directory structure and symlinks before copying or deleting. Bound attachment copies and propagate cleanup/persistence failures. Active task admission is serialized with destructive chat/profile operations. |
| Task authority | Intersect requested access with the teammate ceiling; preserve read-only grants; resolve current revocations while handling decisions; cancel work when access is revoked or a teammate is archived. |
| Provider execution | Claude uses forced sandbox/permission settings and the required local approval bridge. Codex uses App Server with a fresh named permission profile on both new and resumed threads, verifies the returned active profile and approval policy, disables uncontrolled MCP/app tools, and rejects permission/network widening. |
| Approvals | Bind decisions to the full request and context digest, require the displayed fingerprint for approval, include tool-call identity, and recheck current authority after approval. Fix known effectful commands previously classified as reads. |
| Durable tasks | Store an immutable run specification, account/chat/agent ownership, start/end timestamps and typed succeeded/failed/cancelled/interrupted outcomes. Enforce one active run per chat and three per local account world. Recover interrupted tasks without replaying external effects. |
| Recovery | Persist events with sequence IDs; emit task-change notifications; reconcile after renderer reload or a lost channel; reload cached conversations; page backwards through long transcripts. |
| Task history | Show active work and recent tasks, filter/search the loaded history, open the chat, stop active work, inspect original context and saved outputs, and copy the full task record. Fetch full context on demand to reduce recurring IPC traffic. |
| Outputs | Save responses, partial responses, tool execution records, Codex file-change diffs and resolved provider settings against the task. Label live working-copy diffs accurately. A provider's completion is distinct from acceptance of its result. |
| Attachments | Enforce count/size/aggregate limits and supported signatures, keep copies inside the owning chat, include an input manifest and content digests, send Claude images/PDF content and Codex image/file references, and avoid resending already delivered images after successful turns. |
| Learning | Expose bounded memory/skill proposal tools; keep model-authored learning pending human review; share the three-proposal limit with legacy REMEMBER extraction; record source task information. |
| Handoffs | Validate the sender and source chat, store the parent task and expected output, keep recipient authority separate, and return typed child outcomes as saved parent/child receipts. Recheck handoff permission before waking the recipient. |
| Routines | Share admission and execution checks, honor pause/enabled policies, record failed and cancelled outcomes correctly, and retain the explicit desktop-open scheduling limitation. |
| Input and lifecycle | Keep text/access/account drafts per chat; respect IME composition; clear only an admitted draft; preserve data after failed reads/deletes; retain retry access/account; support explicit clearing of optional model/effort settings; restore archived teammates and chats. |
| Starting a task | Release review, scoped code change and evidence comparison templates create editable drafts with conservative access defaults. The provider-readiness panel supports rechecking after CLI updates. |
| Design | Use the existing graphite/cobalt tokens and shared controls, with minimum-window layouts, task status labels, actionable errors and scroll-preserving history loading. |

## Audit closure map

“Implemented” describes code in this branch. The live Linux acceptance checks below now provide provider evidence; remaining platform and enterprise release gates still apply.

| Finding | Status |
|---|---|
| A01 | Implemented ownership/path/symlink protections and guarded cleanup; adversarial regression coverage added. |
| A02–A05 | Implemented classifier, effective-policy, bridge and provider containment changes. Actual Linux command probes passed ten filesystem/network/environment assertions per provider; native denial, cancellation and grant revocation also passed. Other hosts remain unverified. |
| A06–A09 | Implemented durable outcomes, admission, event recovery and task persistence error handling. Memory, skill, routine, decision and attachment list failures preserve existing data; search and skill-history failures are visible. A few older settings/dialog paths still retain legacy handling. |
| A10 | Immutable context/request/account/provider snapshot and precise approvals implemented. The resolved Codex model is also saved when reported. A default Claude model is not independently resolved, and workspace revision snapshots are not automatic. |
| A11 | Input delivery and limits implemented. Real Claude native PDF/image handling and Codex image/PDF extraction passed with a compressed PDF and visual marker fixture. There is no new standalone PDF extraction service; Codex document reading depends on available sandbox tools. |
| A12 | Model-authored learning is review-only, including the legacy Automatic preference. |
| A13 | Proposal tools and user-triggered handoff parent/result receipts implemented. Autonomous recursive delegation and automatically verified child results are not implemented. |
| A14 | Explicit chat account selection, stored credential reference, compatibility floor, deadline and observed tool-count cancellation implemented. No hard monetary quota, configurable organization budget or managed worker is provided. |
| A15 | Run-scoped outputs/diffs/tool records implemented. Deterministic workflow acceptance checks, isolated change workspaces and universal rollback are not supplied automatically. |
| A16 | Complete conversation pagination and cursor recovery implemented; browser coverage includes 1,200 events. The task-list UI currently exposes active/recent work capped at 100 rows, and chat lists retain their existing 300-row cap. Older task records remain in SQLite but lack task-list pagination. |
| A17–A18 | Per-chat drafts, IME handling, admission-aware clearing, retry settings and nullable model/effort updates implemented. Unsent drafts remain session-local. |
| A19 | Teammate/chat restoration and selected-chat deletion behavior implemented. Full destructive-action undo is not implemented. |
| A20 | Future relative times and the schedule grace-period explanation corrected. |

## Verification

Validation evidence is under [agent-page-validation](agent-page-validation/).
Final native workspace tests, build, Clippy, formatting and line/whitespace checks passed after the live execution fixes. The earlier frontend/browser evidence below covers the unchanged frontend source. Logs are retained in the validation folder and its live subdirectory.

- Frontend regression suite: 767 tests passed, no failures or skips on the latest tested frontend.
- Browser interactions: 19 checks passed, including drafts/access across chats, IME, failed/accepted sends, failed delete/reload, teammate/chat archive/restore, task outputs/filtering/templates, all 1,200 history events with scroll preservation, and background task appearance/completion without opening its chat.
- Visual capture: twelve real-component browser states at 1440×900 and 960×600, covering dark/light dashboard, history, task details, chat, settings, routines empty and active-background-task states; no browser exceptions. These are simulated IPC fixtures, not packaged Tauri or live-provider proof.
- Production frontend build: passed, with existing bundle-size/plugin timing notices.
- Rust: 582 tests passed after the execution fixes (332 core unit, 2 core integration, 246 desktop and 2 updater-signing). Two tests are ignored in the normal suite: the existing display-dependent clipboard test and the opt-in real-provider acceptance runner, which was separately executed for the live scenarios.
- Clippy with warnings denied, Rust formatting, frontend dead-code checks and whitespace checks passed. No first-party desktop source file exceeds the repository’s 200-line validation limit.

Visual examples: [dashboard](agent-page-validation/dashboard-dark.png), [background task](agent-page-validation/active-dark.png), [task detail](agent-page-validation/task-detail-dark.png), [minimum-size chat](agent-page-validation/chat-minimum.png).

## Provider evidence and remaining release gates

The live versions on 5 September were **Codex CLI 0.153.4** and **Claude Code 2.1.261**, using the signed-in default accounts with `gpt-5.6-terra` and `haiku`. Current source compatibility floors remain Codex 0.153.2 and Claude 2.1.261; only the installed versions above received this live acceptance pass.

The host's Bubblewrap/AppArmor setup and missing `socat` dependency have been resolved. The global Ubuntu user-namespace restriction remains enabled. The final provider-compatible bwrap profile permits nested sandbox setup; the actual command sandboxes deny the tested out-of-grant reads/writes, symlink escapes, protected metadata writes and network access. Profile details, backups and exact probes are in [the live report](agent-page-validation/live/README.md) and [environment snapshot](agent-page-validation/live/environment.json).

The live tasks exposed and fixed Codex configuration/protocol incompatibilities, startup/runtime database problems, missing sandbox access to the provider executable, rejected file-edit approval handling, and Claude filesystem mount conflicts on Ubuntu. Both engines now complete the real bounded code-change task, pass its unchanged test and save the required result. Both correctly read the supplied image and compressed PDF. Native approval denial, waiting/running cancellation, Plan mode and actual grant removal pass. Killing the native runner at an approval wait leaves no observed provider descendants after ten seconds; reopening records interruption, invalidates orphan approvals and preserves saved artifacts. New processes also resume saved provider conversations successfully.

See [Codex acceptance checks](agent-page-validation/live/codex/acceptance-checks.json), [Claude acceptance checks](agent-page-validation/live/claude/acceptance-checks.json), and [reproduction/evidence details](agent-page-validation/live/README.md). These are actual native executor/provider/sandbox/storage checks with synthetic local files. Earlier browser tests use simulated IPC. A signed packaged-window acceptance pass has not been performed, and the installed app has not been replaced.

Before a release:

1. Repeat the now-passing Linux native acceptance matrix in the signed packaged app and on every supported platform/account configuration, including managed enterprise policies, non-default provider accounts and network-loss behavior.
2. Extend the passing bounded code-change/document tasks to realistic release-review and research workflows with predefined acceptance criteria. Verify output quality, exact diffs, command receipts, latency and independently reconciled billing against a pilot workload.
3. Complete paginated historical task browsing, remaining legacy error paths, host/platform coverage, and deployment-specific retention/backup behavior. Tool-count cancellation follows reported tool activity; it is not a pre-execution monetary or total resource guarantee.
4. Define and build the shared enterprise phase against real tenant/workspace requirements: central authorization, connector gateway, worker registration/revocation, always-on schedules, shared decision ownership, retention/export/admin controls and identity integration. This branch implements local execution foundations, not those services.
5. Review the changes, validate signed packaged builds and run the controlled pilot/release phase from the audit.

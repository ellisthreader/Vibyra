# Agent Mode Audit Boundaries

Use this focused note before auditing Agent Mode. For implementation history,
search `Agent Mode As Built.md`; it is a deep reference, not a completion claim.

## Source authority

- Resolve the live `/web-api/releases` version and its source worktree before
  trusting the main checkout's package version. SaaS is retired.
- On 2026-09-04, the feed advertised 0.4.3. Source was in terminal worktree
  `vibyra-1a062ef22f2-0`, shipped commit `4abe89647205ce9bfb2e94c892b50112a3939f41`.
  HEAD `287bfa0016dab9fb2f54701cc96c6696837d92f0` differed only in release notes.
  Refresh this mapping for future releases.

## Contracts confirmed in 0.4.3

- Agent Mode uses native account-scoped SQLite and structured CLI turns beside
  Code Mode's PTYs. Legacy Laravel `/agents/*` routes are not its task backend.
- Claude has an MCP approval bridge; Codex's exec adapter does not use it.
  Provider permission names and UI copy do not establish equivalent authority.
- Audit probes reproduced unsafe chat-ID-to-filesystem cleanup, effectful shell
  commands classified as reads, read-only roots mapped to Codex writable roots,
  permissive bridge-down fallback, and broken null clearing of model/effort.
- Source review found per-turn permission mismatch, routine failure reported as
  success, incomplete event reattachment/background updates, and dropped context
  provenance. These findings were reported, not fixed by the audit.
- Current React fixture checks reproduced composer draft/access carryover and
  IME Enter submission. Fixtures do not establish signed-in native execution.

## Validation routing

- Use `.agents/skills/VibyraOptimse/SKILL.md` for Agent Mode audit evidence and
  permission boundaries. Exercise fresh/resumed sessions and every launch path.
- Green frontend/core tests do not establish provider integration or enterprise
  readiness. Live-engine tests are opt-in; record whether they actually ran.
- The 0.4.3 audit passed frontend tests (761), Rust 1.88 locked core tests (317),
  TypeScript and the canonical desktop line gate. No packaged provider journey
  was claimed. Existing user work and production source were preserved.
- Detailed findings, source links, synthetic evidence and proposed completion
  gates: `docs/audits/agent-mode-2026-09-04/REPORT.md` at the repository root.

## Teammate dialog audit, 2026-09-07

- Installed AppImage hash matched published 0.6.1. Audited source is
  `6485f8c920acaf81964fbb3e81f9a7e6421cb72c` in worktree `release-0.6.0`;
  this older safe-mode worktree does not contain that feature implementation.
- `WorkspaceApp` mounts Agent Mode inside `.app > .shell`. `EditorDialog`
  invokes `useModalFocus`, which marks that ancestor inert. Browser fixtures
  reproduce blocked teammate, routine and skill dialogs; Escape still closes.
- Follow-on fixtures reproduce stale engine selection after capability loading,
  duplicate create requests after a successful write but failed roster refresh,
  repeated routine/skill saves while pending, skill checkboxes retaining failed
  assignments, and memory drafts cleared on failed saves. Start at
  `NewAgentDialog`, `agentRosterStore`, `RoutineEditor`, `SkillEditor`,
  `AgentSkillsTab`, `AgentMemoryCard` and `agentWorkStore`.
- These are audit findings, not fixes. Chromium fixtures used mocked IPC;
  no signed-in packaged provider journey was exercised. TypeScript and the
  desktop line gate passed. See the Agent Mode evidence checklist in
  `.agents/skills/VibyraOptimse/SKILL.md` for dialog and failure-state checks.

## Teammate save reliability implementation, 2026-09-07

- Candidate branch `fix/teammate-reliability` is based on the 0.6.1 release
  worktree, not the older safe-mode task checkout. Installed software is unchanged.
- `EditorDialog` portals outside the workspace. `useModalFocus` owns reference
  counted inert holds and a topmost modal stack; rerenders retain caret/focus.
- `agentWrite` owns in-flight saves and a minimal account-scoped reload journal
  containing only request UUID and payload hash. Success updates stores from the
  returned record; a list-read failure cannot repeat a committed write. Closing
  a form does not cancel an admitted native save or reopen a different screen.
  After a visible timeout, retain the receipt through late success until the
  original form reconciles it; clearing it early makes retry create a duplicate.
- Schema 5 stores account/token receipts transactionally with writes. Tokens
  conflict across changed payloads, operations and target teammates. Receipts
  retain entity IDs, return current data, and never resurrect deleted content.
  A rolled-back profile write may leave one empty reserved home reused by retry;
  do not remove it after releasing the DB lock, which could race a later success.
- Capability selection, pending saves, confirmed skill assignment and memory
  draft retention have browser regressions in `npm run test:teammate-ui` (Linux
  CI). Scratch migration/concurrency/reopen tests live in `agentdb/request_*`.
- Native WebKit fixtures and real-provider core journeys are distinct from
  signed-in packaged desktop acceptance. See the dated reliability report and
  `.agents/skills/VibyraOptimse/SKILL.md` for repeatable checks and delivery limits.

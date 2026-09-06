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

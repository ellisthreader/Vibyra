# AI Team Orchestration Plan

Goal: turn Team mode from parallel terminals with role-shaped prompts into a
truthful, recoverable, evidence-driven engineering workflow.

## Product Decision

Do not market or display automatic coordination until Vibyra can sequence
roles, relay artifacts, enforce capabilities, and preserve authoritative team
state. Prompt improvements are Phase 1 hardening, not completion of the Team
feature.

Dynamic role assignment and AI planning are specified separately in
`Desktop/AI Team Dynamic Planner Implementation Plan.md`. That planner is
untrusted decomposition data layered on top of this orchestration contract; it
cannot grant capabilities, author trusted role prompts, or bypass sequencing.
Implement authoritative Team state and transactional launch before allowing an
AI-generated plan to create terminals.

## Target Execution

1. Capture project ID, workspace mode, and authoritative base revision.
2. Run Coordinator alone in read-only mode.
3. Validate and persist the Coordinator plan artifact.
4. Start Builder with that artifact in the canonical writable workspace.
5. Capture Builder's exact result revision or immutable diff.
6. Start Verifier and Reviewer concurrently against the Builder result.
7. Receive their independent artifacts through an authenticated local
   submission channel.
8. Present results to the user. Never merge automatically.

For a two-role Team, run Builder then Reviewer. For three roles, use
Coordinator, Builder, Reviewer. For four roles, add Verifier after Builder.

## Phase 1: Prompt Compiler

Implementation status, June 10, 2026: foundation shipped in
`desktop/lib/terminalTeamPromptRoles.mjs`. The bridge owns the role contract,
separates untrusted assignment data, hashes the policy, and delivers it only
through verified provider channels. Contract V2 adds role-specific workflows,
forbidden actions, evidence standards, stopping rules, and a truthful parallel
execution warning. Bounded result markers exist, but artifact schema parsing
and validation remain open.

- Replace string concatenation with a prompt compiler.
- Define typed role, assignment, artifact, and provider-adapter schemas.
- Separate trusted role policy from untrusted goal data.
- Add provider-specific delivery:
  - Codex developer instructions;
  - Claude Code appended system instructions;
  - Vibyra Agent developer instructions.
- Keep Gemini and other runtimes disabled until they expose a verified
  higher-priority role channel.
- Add explicit acceptance criteria, blockers, stopping rules, and handoffs.
- Preserve repository-native instruction loading.

Exit criteria:

- the injection corpus demonstrates measured role adherence and malformed
  output rejection;
- runtime enforcement, not prompting, guarantees injected content cannot
  change capabilities;
- each provider receives equivalent role semantics;
- prompts remain concise enough to avoid drowning project context;
- role outputs pass schema validation.

## Phase 2: Runtime Enforcement

Implementation status, June 10, 2026: foundation shipped. Builder is the sole
writer; Coordinator, Verifier, and Reviewer launch read-only. Codex, Claude,
and Vibyra Agent have tested adapters. Unsupported Team runtimes fail closed in
both setup and bridge validation. Network/MCP-specific capability controls and
atomic whole-team launch rollback remain open.

- Add per-role capability profiles.
- Builder receives the only writable profile.
- Coordinator and Reviewer receive read-only filesystem and shell policy.
- Verifier receives read-only filesystem plus allowlisted non-destructive checks.
- Apply controls to provider tools, shell, editor, network, and MCP surfaces.
- Require an explicit tested capability declaration for each provider's
  higher-priority role instruction channel.
- Fail launch when the requested provider cannot enforce the role profile.
- Remove prompt-only tests that infer permissions from wording.

Exit criteria:

- support roles cannot mutate through any available path;
- destructive and external actions require the configured approval boundary;
- credentials remain unavailable to generated commands;
- partial team launch cannot leave a misleading active team.

## Phase 3: Authoritative Local Team State

Persist atomically in desktop bridge or detached-worker session storage:

```text
team
goal
base revision
role definitions
phase
dependencies
terminal IDs
artifacts
delivery state
failure state
```

- Send team metadata in PTY creation requests.
- Return it during session recovery.
- Make team creation transactional or explicitly report partial failure.
- Stop using renderer localStorage as the authority for team identity.
- Add expected-phase and generation checks to every transition.
- Make artifact submission idempotent and reject stale-generation replay.
- Define cancellation, timeout, retry, and restart behavior.
- Builder failure or cancellation blocks downstream launch until explicit retry.

Exit criteria:

- renderer and bridge restarts recover the same phase and artifacts;
- failed Builder launch blocks downstream roles;
- stale terminals cannot attach to a newer team generation.

## Phase 4: Artifact Relay And Revision Visibility

- Define validated artifacts for plan, implementation, verification, and review.
- Add an authenticated local artifact submission route or tool bound to team,
  role, generation, and terminal identity.
- Enforce schema validation, size limits, idempotency keys, and artifact hashes.
- Never advance a phase because a provider became idle or exited.
- Inject dependency artifacts into later assignments.
- Ensure Verifier and Reviewer inspect Builder's exact result.
- Freeze Builder output as a managed local commit or immutable patch/tree
  snapshot, recording any dirty state.
- Give downstream roles read-only views created from that exact object.
- If separate worktrees remain, create downstream worktrees from Builder's
  result revision rather than the original base.
- Reject downstream artifacts whose inspected revision does not match.

Exit criteria:

- Builder cannot start before a valid plan when Coordinator exists;
- support roles cannot start before Builder handoff;
- all downstream reports name the exact inspected revision;
- no automatic merge is performed.

## Phase 5: Truthful UI

Use local bridge-observed states only:

- Starting
- Prompt delivered
- Working
- Idle
- Waiting for dependency
- Stopped
- Delivery failed
- Reported result
- Blocked

Do not display Complete, Passed, Approved, merge state, percentages, or
conflict-free claims unless a validated artifact proves that exact state.
`Prompt delivered` is transport state only. `Idle` is provider state only.
`Reported result` and `Blocked` require validated artifacts.

The Team bar should show:

- shared goal;
- current phase;
- each role's observed state;
- result availability;
- blockers requiring the user.

## Evaluation Plan

### Prompt adherence

- role stays in scope;
- exactly one writer;
- no duplicated work;
- correct blocker behavior;
- no unsupported completion claims;
- concise, schema-valid handoffs.

### Injection corpus

Test goals, files, issues, and web content containing:

- "ignore previous instructions";
- fake role and system headings;
- XML or Markdown terminators;
- requests to change permissions;
- commands that read credentials or send data externally;
- claims that another role approved work;
- oversized and malformed content.

### Functional scenarios

- focused bug fix;
- cross-layer feature;
- refactor with behavior preservation;
- failing test caused by environment;
- no-change-needed investigation;
- ambiguous requirement;
- security-sensitive change;
- Builder launch failure;
- malicious or malformed Coordinator and Builder artifacts;
- artifact tampering, duplicate submission, and stale generation replay;
- bridge crash during a phase transition;
- terminal capacity exhaustion and partial creation rollback;
- Builder cancellation and explicit retry;
- immutable snapshot mismatch;
- verification commands that mutate prohibited paths;
- renderer or bridge restart mid-phase.

### Provider matrix

Run the same scenario set through:

- native Codex;
- native Claude Code;
- native Gemini CLI;
- Vibyra Agent with at least two API-only model families.

Score task fidelity, role fidelity, evidence accuracy, mutation violations,
schema validity, latency, token use, and user intervention count.

### Required automated checks

- schema rejects duplicate roles, multiple writers, invalid dependencies, and
  missing revisions;
- support roles cannot write files or invoke mutating tools;
- downstream roles receive the required artifact and exact revision;
- invented commands, files, and pass claims fail validation;
- recovery restores phase, dependencies, and artifacts;
- UI labels map only to authoritative events.

## Rollout

1. Shipped: trusted prompt compiler and capability-gated provider adapters.
2. Run offline golden-task evaluations across providers.
3. Shipped foundation: filesystem/shell capability enforcement for supported
   providers; continue with network and MCP coverage.
4. Add authoritative state and artifact relay.
5. Enable sequencing for internal users.
6. Compare against current parallel terminals on task success, safety, latency,
   and intervention rate.
7. Expand only after the provider matrix meets the same acceptance threshold.

## Non-Goals

- automatic merging;
- recursive agent spawning;
- agents editing the same files;
- hidden reviewer approval;
- fabricated progress percentages;
- replacing native CLI identities or project instruction mechanisms.

# AI Team Dynamic Planner Implementation Plan

Status: reviewed implementation plan, June 10, 2026.

## Core Implementation Status

As of June 11, 2026, the bridge-owned planning core exists in
`desktop/lib/terminalTeamPlanner.mjs` with process-local immutable storage in
`desktop/lib/terminalTeamPlanStore.mjs`.

The public facade stays small. Planner internals are split by authority:

- `terminalTeamPlannerInput.mjs`: intent normalization and deterministic
  topology selection;
- `terminalTeamProposalValidation.mjs`: proposal schema and semantic checks;
- `terminalTeamProposalScope.mjs`: response bounds, path safety, scope overlap,
  and validation-intent checks;
- `terminalTeamPlannerAssignments.mjs`: deterministic/AI assignment shaping,
  dependencies, IDs, and hashes;
- `terminalTeamPlannerShared.mjs`: bounded values, canonical hashing, aliases,
  and planner errors.

Keep these bridge source modules below the desktop 200-line standard. Route and
PTY integrations should continue importing only the public
`terminalTeamPlanner.mjs` facade.

- `planTerminalTeam(input, { proposal })` issues unique `planId` and `teamId`
  values, selects deterministic topology, strictly validates an optional AI
  proposal, and falls back wholesale to deterministic assignments.
- `teamPlanById(planId)` retrieves a defensive immutable copy.
- `terminalTeamAssignmentForPlan(planId, roleKey, teamId)` resolves the
  authoritative goal and assignment for PTY integration and rejects a
  mismatched Team identifier.
- Plans and assignments have canonical SHA-256 content hashes. Assignment
  hashes include the authoritative goal.
- AI output cannot add roles, dependencies, permissions, capabilities, tools,
  commands, or trusted instructions. Unknown fields, unsafe paths, support-role
  write scope, topology mismatch, overlapping scope, and orphaned criteria
  invalidate the entire proposal.
- Execution remains truthfully `parallel-v1`. Route integration, PTY binding,
  backend planner dispatch, and durable restart persistence are not part of
  this core patch.

## Objective

Turn one user goal into the smallest useful Team with clear assignments,
validated ownership, truthful dependencies, and a safe launch path.

The planner improves decomposition. It does not become a security authority.
Vibyra-owned code remains solely responsible for roles, capabilities,
permissions, trusted prompts, runtime selection, launch policy, and lifecycle
transitions.

## Review Basis

This plan reconciles six independent reviews covering:

- module and route architecture;
- schema, authorization, and ownership security;
- planner prompt and output contracts;
- model choice, billing, and local inference;
- UX, persistence, recovery, and cancellation;
- evaluations, release gates, and rollback.

Absolute model accuracy cannot be guaranteed. The implementation target is
deterministic safety invariants, schema-valid output after fallback, zero
permission escalation, and measured planning quality above the fixed baseline.

## Product Decision

Use a hybrid planner:

1. Deterministic code validates the request and chooses all security policy.
2. Deterministic templates immediately handle simple or failed planning cases.
3. GPT-5.4 mini is the default AI planner for useful task decomposition.
4. GPT-5.4 nano is limited to optional narrow classification or extraction
   after it passes evaluation; it is not the primary Team planner.
5. Ollama is an explicit `Private local planning` option, never a silent
   cloud-to-local or local-to-cloud fallback.
6. High-risk or unusually complex requests may require a stronger approved
   cloud model or user clarification rather than repeated mini retries.

Do not reuse the generic chat endpoint or Auto model router. Team planning
needs a dedicated schema, billing label, timeout, validation path, and
deterministic fallback.

## User Experience

### Main setup

Keep the existing Team setup in one clean panel:

- Goal
- Project
- Model: `Automatic` by default
- Safe mode
- `Plan team`

Supporting copy:

> Vibyra will choose the smallest useful team.

Do not add a planning dashboard, wizard, raw prompt editor, planner model
picker, or provider implementation rows to the main form.

### Advanced options

Advanced options may contain:

- Roles: `Automatic`, `2`, `3`, or `4`
- Planning: `Vibyra cloud` or `Private local`
- Execution: `Coordinated` or `Parallel compatibility`
- Existing model, reasoning, access, and payment controls
- A spending ceiling only after estimates are backed by measured usage

Cloud planning should disclose that it uses a small amount of Vibyra credits
and sends the goal plus filtered, bounded project context through Vibyra's
configured cloud AI provider.
Private local planning should disclose that quality depends on the installed
local model and hardware.

### Planning interaction

Selecting `Plan team` updates the existing panel in place:

1. Show `Planning team...` and a Cancel action.
2. Preserve layout height where practical; do not remount or flash the setup.
3. Show the resulting roles as concise rows:
   - role name;
   - one-line assignment;
   - owned scope when relevant.
4. Continue automatically when the plan is valid, compatible, and within
   limits.
5. Ask at most one concise question when a missing decision would make the
   plan unsafe or materially wrong.

Only pause for confirmation when:

- Safe mode cannot be prepared;
- the requested execution mode is only available as parallel compatibility;
- deterministic routing policy must change a user-selected model or role count;
- a verified spending ceiling would be exceeded;
- root-wide write ownership is required.

### Truthful states

Use only authoritative bridge states:

- Planning team
- Waiting for confirmation
- Preparing workspaces
- Starting Coordinator
- Building
- Checking changes
- Results available
- Blocked
- Cancelling
- Cancelled
- Interrupted
- Launch failed

Provider idle or process exit is not completion.

## Role Policy

The fixed role library remains:

- Coordinator: read-only planning and codebase mapping
- Builder: the only source-code writer
- Verifier: independent checks against Builder output
- Reviewer: read-only correctness, security, and consistency review

Deterministic Vibyra policy selects the topology. The AI specializes
assignments for the already-selected roles; it cannot choose, invent, remove,
or modify roles or capabilities.

Topology rules:

| Team size | Allowed topology |
| --- | --- |
| 2 | Builder, Reviewer |
| 3 | Builder, Reviewer, plus Coordinator or Verifier |
| 4 | Coordinator, Builder, Verifier, Reviewer |

Deterministic topology policy chooses Coordinator for ambiguity, cross-layer
work, unclear ownership, or dependency discovery. It chooses Verifier for a
focused implementation with substantial test, migration, security, billing,
concurrency, or runtime risk.

Every plan has exactly one Builder and exactly one Reviewer.

## Trust Boundary

Planner output is untrusted assignment data.

The planner may propose:

- role-specific objectives;
- deliverables and non-goals;
- inspect and write scope hints;
- acceptance criteria;
- validation intents;
- risks and assumptions;
- one unresolved user question.

The planner must never control:

- system, developer, or trusted role instructions;
- roles outside the fixed library;
- capabilities, permissions, approvals, or sandbox mode;
- tools, shell policy, network, MCP, or credentials;
- provider, runtime, billing model, or terminal identity;
- lifecycle phase transitions;
- artifact authorization;
- automatic merge or deployment.

Unknown planner properties reject the entire AI proposal.

## Planner Output Contract

Use strict structured output with `additionalProperties: false` recursively.
The model returns only:

```json
{
  "schema_version": "vibyra.team-plan.v1",
  "goal_summary": "string",
  "assumptions": ["string"],
  "non_goals": ["string"],
  "assignments": [
    {
      "role_key": "coordinator|builder|verifier|reviewer",
      "objective": "string",
      "deliverables": ["string"],
      "assumptions": ["string"],
      "non_goals": ["string"],
      "focus_areas": ["string"],
      "inspect_scope": [
        { "kind": "file|directory", "path": "relative/path" }
      ],
      "write_scope": [
        { "kind": "file|directory", "path": "relative/path" }
      ],
      "acceptance_criteria_keys": ["criterion-key"],
      "validation_intents": [
        {
          "kind": "inspect|reproduce|test|lint|typecheck|build",
          "target": "string"
        }
      ],
      "risks": ["string"],
      "completion_evidence": ["string"]
    }
  ],
  "acceptance_criteria": [
    {
      "key": "criterion-key",
      "statement": "string",
      "evidence_required": "repository_evidence|diff|command_result|runtime_observation|review_finding"
    }
  ],
  "open_questions": ["string"]
}
```

Initial bounds:

- 64 KiB total response;
- depth at most 8;
- no more than 4 assignments;
- no more than 24 scope entries per assignment;
- no more than 12 plan-level criteria;
- no more than 12 deliverables, assumptions, non-goals, focus areas, risks,
  completion-evidence items, or validation intents per assignment;
- at most one open question;
- no narrative field above 1,200 characters;
- no raw shell command fields.

Role keys and criterion keys are bounded model-local references. The bridge
validates uniqueness and referential integrity, then issues durable assignment
and criterion IDs. All durable IDs, hashes, model metadata, cost, project
identity, base revision, generation, and timestamps are server-owned envelope
fields, not model output.

The parser rejects duplicate JSON keys, trailing non-whitespace bytes, invalid
Unicode, excessive depth, and oversized token or byte counts before ordinary
schema decoding. Goals, repository text, prior artifacts, and retrieved context
are filtered for sensitive paths/content and placed in delimited untrusted-data
sections that cannot alter schema or policy.

## Semantic Validation

After JSON Schema validation, apply deterministic checks:

1. Roles exactly match an allowed topology with no duplicates.
2. Exactly one Builder exists and only Builder has write scope.
3. Server-derived dependencies follow the fixed topology: Coordinator has no
   dependency; Builder follows Coordinator when present; Verifier and Reviewer
   follow Builder.
4. Derived dependencies are unique, known, acyclic, and phase-valid.
5. Criterion keys are unique; every reference resolves; every criterion is
   assigned; duplicate and orphaned references are rejected.
6. Paths are Unicode-normalized, platform-case-aware, repository-relative
   POSIX paths.
7. Reject absolute paths, traversal, NUL, invalid Unicode, encoded traversal, `.git`,
   credentials, `.env`, provider homes, and managed-agent directories.
8. Existing paths pass realpath containment checks.
9. Prospective paths validate their nearest existing parent and are checked
    again immediately before use to reduce symlink race risk.
10. Ancestor/descendant overlap and symlink replacement are rejected.
11. Root-wide ownership requires explicit user approval.
12. Planner text cannot alter the trusted role contract.
13. Trusted policy bytes and hash are identical for the same role, contract
    version, and orchestration mode regardless of planner output.
14. The original server-preserved goal remains authoritative.
15. Base revision, dirty-state fingerprint, and role contract version remain
    current at launch.
16. The final Builder diff contains no canonical path outside its lease.

Do not silently remove unsafe fields and accept the remainder. Reject the AI
proposal and use the deterministic plan.

## Planner Routing

### Deterministic preflight

Local code derives bounded categorical signals:

- requested role count;
- project and Git availability;
- task breadth;
- cross-layer indicators;
- security, migration, billing, concurrency, and runtime risk;
- whether the user requested investigation only;
- whether clarification is mandatory.

When confidence is high, skip an AI classifier.

### GPT-5.4 mini

Use GPT-5.4 mini for the actual cloud Team plan:

- strict JSON Schema structured output;
- low reasoning by default;
- bounded project context;
- approximately 1,200 to 2,000 maximum completion tokens;
- at most two total provider dispatches, reserved and disclosed as the
  worst-case charge;
- malformed or schema-invalid output falls back immediately without prose
  parsing or model repair.

The backend must meter every billable attempt through the existing reservation
and settlement services.

### GPT-5.4 nano

Nano may later classify only in a company-funded experiment:

- `simple`, `moderate`, or `complex`;
- recommended Team size;
- Coordinator versus Verifier for a three-role Team;
- tightly bounded concern extraction.

Do not call nano in the user-billed production path when deterministic routing
is confident because a separate classifier can add another one-credit minimum
charge. Do not promote nano to full planning unless it passes the same
security gates and remains within two quality points of mini in blinded
evaluation.

### Ollama

Private local planning is explicit and opt-in:

- pin a tested local model, initially `qwen3:4b-instruct`;
- require a loopback Ollama endpoint for the `Private local` label; label a
  remote self-hosted endpoint separately;
- use Ollama JSON-schema `format`;
- set a bounded `num_predict`;
- use the same semantic validator as cloud plans;
- allow one validation retry;
- collect prompt/evaluation token counts, duration, and tokens per second;
- exclude Ollama cloud-tagged models from private mode.

Invalid or unavailable local planning falls back to deterministic local
planning, not cloud.

## Backend And Desktop Architecture

### Backend

Add a dedicated authenticated endpoint:

```text
POST /api/chat/team-plan
```

Suggested modules:

```text
backend/app/Http/Controllers/Concerns/TeamPlanEndpoint.php
backend/app/Services/AI/TeamAssignmentPlanner.php
backend/app/Services/AI/TeamPlanSchema.php
```

Reuse the billing reservation and settlement design from
`ChatResearchPlan.php`, but replace its permissive prose extraction with strict
structured output and semantic validation.

Use a dedicated billing operation such as `team-plan`, with:

- preferred and selected model;
- attempt count;
- token usage including reasoning and cached tokens;
- reserved, actual, and refunded credits;
- provider USD cost;
- outcome and validation error categories.

Do not log raw goals or repository content in analytics.

### Desktop bridge

Add focused modules:

```text
desktop/lib/terminalTeamPlanner.mjs
desktop/lib/terminalTeamPlannerClient.mjs
desktop/lib/terminalTeamPlanSchema.mjs
desktop/lib/terminalTeamPlanStore.mjs
desktop/lib/terminalTeamStore.mjs
desktop/lib/terminalTeamOrchestrator.mjs
desktop/lib/terminalTeamRoutes.mjs
```

Keep `ptyTerminals.mjs` as the terminal primitive. It should execute a stored,
validated assignment, not perform planning.

Desktop routes:

```text
POST /desktop/terminal-teams/plan
DELETE /desktop/terminal-teams/planning/:operationId
POST /desktop/terminal-teams
GET  /desktop/terminal-teams
GET  /desktop/terminal-teams/:teamId
GET  /desktop/terminal-teams/plans/:planId
POST /desktop/terminal-teams/:teamId/decision
POST /desktop/terminal-teams/:teamId/artifacts
POST /desktop/terminal-teams/:teamId/cancel
POST /desktop/terminal-teams/:teamId/retry
GET  /desktop/terminal-teams/:teamId/events
```

The renderer submits intent and receives a bridge-issued plan. Launch requests
use only `planId` and an idempotency key. The bridge retrieves assignments and
revalidates all policy.

The validated assignment compiler receives the authoritative goal, objective,
deliverables, assumptions, non-goals, focus areas, inspect/write scopes,
criteria, validation intents, server-derived dependencies, base revision,
snapshot ID, dependency artifacts, capability-profile reference, result-schema
version, and approval boundary. None of these fields may modify
`compileTrustedRoleInstructions()`.

The decision route accepts one bounded answer or confirmation and checks the
expected generation. The artifact route is worker-only and binds its grant to
Team, generation, role, terminal, assignment, phase, expected revision, and
idempotency key. The renderer never receives artifact-submission authority.
The events route may use an authenticated Team stream or bounded polling;
terminal-specific sockets are not sufficient.

### Authoritative Team record

Persist a Team separately from terminal sessions:

```text
teamId, schemaVersion, generation, orchestrationMode
goal, projectId, repositoryRoot, baseRevision, dirtyStateFingerprint, workspaceMode
planId, plan, planHash, plannerMode, plannerModel
roleContractVersion, routingPolicyVersion
phase, status, members, terminalIds
artifacts, snapshotRevision, operationJournal
reservedCost, actualCost
failure, cancelRequestedAt, createdAt, updatedAt
```

Each terminal additionally stores `assignmentId`, canonical `assignmentHash`,
planner schema version, planner status, and fallback reason. Deterministic
fallback creates the selected fixed topology from bridge-owned templates and
records `timeout`, `transport`, `quota`, `invalid_schema`, `invalid_scope`, or
`unsupported_output` without attempting partial repair.

Every mutation includes `expectedGeneration`. Planning, launching, artifact
submission, cancellation, and retry use idempotency keys.

Reusing an idempotency key with different goal, project, generation, plan, or
launch options returns a conflict.

Plans cache only by account, project/repository identity, goal hash, base
revision, dirty-state fingerprint or immutable starting snapshot, topology
constraint, orchestration mode, planner mode/model, planner schema version,
bounded-context digest, role contract version, and routing policy version.
Never rerun planning during session restoration.

## Launch And Orchestration

Do not make AI plans authoritative over the current renderer-driven series of
independent PTY POSTs.

Transactional launch:

1. Persist Team intent.
2. Reserve terminal capacity and any verified spending ceiling.
3. Resolve and persist a concrete Team-compatible execution model/runtime when
   the user selected `Automatic`.
4. Validate project, base revision, dirty-state fingerprint, runtime adapters,
   and role profiles.
5. Prepare only the current eligible phase workspace.
6. Persist a provisioning operation.
7. Spawn only the current eligible phase through a defined worker handshake.
8. Commit the phase transition.

Failure stops new workers, revokes scoped tokens, removes prepared worktrees,
releases reservations, and persists one recoverable Team failure.

Reserved Team slots count against the global 12-terminal limit and block
concurrent Solo, legacy Team, and direct PTY creation until committed or
released. Reviewer and Verifier workspaces are created only after the immutable
Builder snapshot exists.

Target coordinated sequence:

```text
Coordinator -> Builder -> Verifier
                       -> Reviewer
```

Verifier and Reviewer may run concurrently only after an immutable Builder
snapshot exists. Current parallel Teams remain `parallel-v1`; new coordinated
Teams use `dynamic-v1`. Never silently convert or fall back between them.

Allowed transitions are an explicit versioned table:

```text
planning_requested -> planning
planning -> plan_ready | awaiting_confirmation | failed | cancelled
plan_ready -> provisioning
awaiting_confirmation -> provisioning | cancelled
provisioning -> coordinating | building | active_parallel | failed
coordinating -> building | blocked | failed
building -> validating | reviewing | blocked | interrupted | failed
validating -> reviewing | reported | blocked | failed
reviewing -> reported | blocked | failed
* -> cancelling -> cancelled
interrupted -> retrying -> previous_valid_phase
```

Every transition compares generation and expected phase. Provider idle or exit
cannot advance the table.

## Authorization And Workspace Requirements

Before coordinated Team launch:

- authenticate desktop control routes with a real capability, not loopback or
  missing `Origin`;
- authenticate the PTY WebSocket;
- require a Git project and authoritative base revision;
- require managed worktrees for coordinated mode;
- disallow shared-folder fallback;
- disallow Full access for dynamic Team V1;
- give Builder one validated ownership lease;
- block conflicting Vibyra Team, Solo terminal, and editor writes against that
  lease;
- give support roles read-only snapshots;
- give Verifier a disposable overlay only when checks produce outputs;
- reject recovered workers with stale Team role contracts.

These are prerequisites, not optional planner refinements.

Dynamic V1 increments the Team role contract and replaces the current
parallel-independence instruction with mode-specific coordinated instructions.
It also versions the three-role topology policy before allowing Verifier in a
three-role Team.

## Failure And Recovery

- Timeout, malformed output, quota failure, authentication failure, or unsafe
  scope returns a deterministic plan that passes the same schema, semantic,
  path, ownership, revision, and capability validation.
- A stale or modified plan returns `409 PLAN_STALE`.
- A missing persisted plan returns `404 PLAN_NOT_FOUND`.
- Repeated launch requests return the same Team for the same idempotency key.
- Duplicate role launch is rejected.
- Model or project changes after planning require explicit replanning.
- Restart reconnects workers but does not re-execute Builder work.
- An uncertain Builder becomes `Interrupted`.
- Every role or provisioning failure has an explicit retry scope. Builder retry
  increments generation and invalidates downstream artifacts; support-role
  retry preserves only the immutable Builder snapshot and valid prerequisites.
- Cancelling planning creates no terminals.
- Cancelling provisioning rolls back prepared resources.
- Cancelling active work stops workers, revokes tokens and ownership leases,
  releases reservations, cleans disposable overlays, blocks downstream work,
  and preserves only validated immutable artifacts and snapshots. Partial
  Builder state is marked interrupted.
- Closing a required terminal routes through Team cancellation or role retry.
- A late planner response cannot commit after cancellation; the planner uses an
  abort signal and checks operation generation and status before persistence.
- Each provisioning journal step defines deterministic resume-or-compensate
  behavior after a bridge crash.
- Legacy recovered terminals are explicitly classified as immutable
  `parallel-v1`; unrelated terminals are never grouped heuristically.

The UI distinguishes `Planned with standard template`, local planner
unavailable, cloud authorization or quota failure, reservation failure,
refund, and unavailable estimate. A planning ceiling must not imply that
worker execution cost is also bounded.

## Evaluation

Create a versioned corpus of at least 60 representative golden tasks plus at
least 1,000 adversarial cases.

Task categories:

- focused one-file fix;
- cross-layer feature;
- validation-heavy change;
- ambiguous request;
- no-change investigation;
- security or permission-sensitive work;
- documentation-only task;
- regression-prone refactor;
- malicious permission or role override;
- fake JSON, XML, Markdown, or system-message boundaries.

Graders:

- strict schema and invariant grader;
- concern coverage grader;
- semantic duplication grader;
- security and injection grader;
- blinded pairwise comparison against deterministic planning;
- human audit of high-risk disagreements and at least 10% of golden cases.

Weighted quality score:

- decomposition: 25;
- role fit: 20;
- non-duplication: 15;
- acceptance criteria: 15;
- verification quality: 10;
- ambiguity handling: 10;
- clarity: 5.

Release gates:

- deterministic fallback schema and invariant tests pass 100%;
- zero permission, role, or capability escalation;
- zero unsupported sequencing or completion claims;
- zero security violations across the adversarial corpus;
- GPT-5.4 mini average quality at least 90/100 across at least three runs per
  golden task, with no category below 80 and bounded confidence intervals;
- mini wins or ties the deterministic baseline on at least 90% of applicable
  golden tasks;
- first-pass schema acceptance at least 99.5%;
- cloud fallback rate below 2%;
- cloud p95 latency at most 4 seconds, hard fallback at 6 seconds;
- mini p95 total provider cost across all attempts at most $0.012 per plan
  under the eval token budget;
- nano classification macro-F1 at least 0.95 with zero unsafe
  under-classification before any production use;
- Ollama quality at least 85/100, first-pass schema acceptance at least 99.5%,
  zero security violations, and warm p95 latency at most 5 seconds on the
  pinned model digest and supported GTX 1080 8GB / 16GB RAM profile.

Add commands:

```text
npm run desktop:team-planner:dataset
npm run test:desktop-team-planner
npm run eval:desktop-team-planner:live
```

The credential-free planner suite joins `test:desktop-ai`. Live model
evaluation remains separate from ordinary CI.

Before shadow mode, the generated corpus must match its checked-in version and
all credential-free tests must pass. Promotion thresholds use a documented
rolling window, minimum sample count, consecutive-breach rule, and recovery
condition. A starting policy is at least 1,000 shadow plans, seven days of
dwell time, zero safety incidents, and all latency, fallback, schema, quality,
and cost gates passing.

## Rollout

Feature modes are bridge-owned:

```text
off
shadow
preview
enabled
```

Provider modes are separate:

```text
deterministic
mini
nano-classifier
ollama
```

Rollout sequence:

1. Correct the Team UI/design contract and add deterministic plan schemas.
2. Add authenticated Team routes, plan storage, generation, and idempotency.
3. Bind PTY creation to stored plans and remove renderer-authored assignments.
4. Add atomic Team provisioning and rollback.
5. Add authoritative phases, artifacts, and immutable Builder snapshots.
6. Ship deterministic coordinated planning internally.
7. Run GPT-5.4 mini in disclosed, company-funded shadow mode.
8. Enable plan preview for internal users.
9. Roll out application at `1%`, `10%`, `50%`, then `100%`.
10. Evaluate nano classification and private Ollama independently.

Automatically disable AI plan application on:

- any security invariant violation;
- schema failure above 0.5%;
- fallback rate above 2%;
- sustained p95 latency above 4 seconds; 6 seconds remains the per-request hard
  timeout;
- a billing settlement mismatch;
- stale-contract recovery.

The deterministic path remains permanently available as the kill switch and
fallback.

Each percentage stage requires a minimum seven-day dwell and the configured
minimum sample count, zero security incidents, all candidate-specific gates,
and no unresolved severity-one or severity-two incident. A failed stage rolls
back to deterministic application, not to the previous AI percentage.

## Implementation Work Packages

### Package 1: Contracts

- Add Team plan types and JSON Schema.
- Export deterministic topology policy from the trusted role library.
- Version `ROLE_ORDER` so three-role Coordinator and Verifier variants are
  explicitly supported.
- Increment `TERMINAL_TEAM_ROLE_CONTRACT_VERSION` for coordinated mode and
  disallow Full access in `dynamic-v1`.
- Add canonical JSON hashing.
- Add path, dependency, and ownership validators.
- Add deterministic assignment templates.

### Package 2: Authority

- Add authenticated desktop Team routes.
- Add atomic Team and plan stores.
- Add generation and idempotency checks.
- Bind PTY launch to `planId`.
- Resolve role, topology, goal, and assignment exclusively from `planId`;
  reject conflicting renderer metadata.
- Add Team role contract checks to persistent worker compatibility.

### Package 3: Transactional launch

- Add aggregate Team creation.
- Reserve capacity and prepare worktrees before spawn.
- Roll back partial launch.
- Add cancel, retry, and restart behavior.

### Package 4: Coordinated execution

- Add validated role artifacts.
- Add immutable Builder snapshots.
- Sequence phases from artifacts, never idle state.
- Add disposable Verifier overlays.

### Package 5: AI planner

- Add the dedicated backend endpoint and billing operation.
- Add GPT-5.4 mini structured output.
- Add bounded dispatch policy and deterministic fallback without prose repair.
- Add privacy-safe planner metrics.

### Package 6: UX

- Change launch to `Plan team`.
- Add stable in-place planning and preview states.
- Add Automatic roles and private local planning under Advanced.
- Add truthful Team lifecycle states and compact blockers.
- Avoid setup remounts and honor reduced motion.

### Package 7: Evaluation and release

- Add golden and adversarial datasets.
- Add deterministic, replay, and live-model runners.
- Add release dashboards and automatic kill conditions.
- Complete shadow, preview, and percentage rollout.

## Definition Of Done

The feature is complete only when:

- the renderer cannot author an authoritative Team assignment;
- every launched terminal references the same persisted plan hash;
- exactly one writer is enforced by runtime policy;
- invalid model output always becomes a safe deterministic plan;
- Team creation is atomic or visibly recoverable;
- downstream roles inspect the exact Builder result;
- restart, retry, and cancellation preserve authoritative state;
- cloud planning is metered and disclosed;
- local planning never silently sends data to cloud;
- UI states are based on bridge evidence;
- each planner passes its candidate-specific gate matrix: cloud planning gates
  for mini, classifier gates for nano, local hardware/privacy gates for
  Ollama, and invariant/fallback gates for deterministic planning.

## Official Model References

- [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano)
- [OpenAI pricing](https://developers.openai.com/api/docs/pricing)
- [Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)

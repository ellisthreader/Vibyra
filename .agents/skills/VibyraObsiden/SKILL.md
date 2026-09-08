---
name: vibyra-obsidian
description: Keep Vibyra Obsidian memory accurate before, during, and after repo work, and route Ellis-specific personal questions through the vault's personalisation hub. Use for code, architecture, workflows, permissions, debugging, durable decisions, or personal real-world guidance that depends on stored context.
metadata:
  short-description: Maintain Vibyra Obsidian memory
---

# VibyraObsiden

Use this skill to treat Obsidian memory as part of delivery. Whenever repo work
touches Vibyra code, architecture, workflows, debugging, routes, permissions,
state, or product decisions, actively consult Obsidian before broad source
exploration. Do not wait for the user to ask whether memory was updated when
the work produced durable knowledge.

## Start Of Task

Before broad repo exploration, follow the repo memory protocol:

1. Read `Vibyra/_ai/Memory Protocol.md`.
2. Read `Vibyra/_ai/Context Map.md`.
3. Read `Vibyra/_ai/Project Context.md`.
4. Read exactly one relevant domain index:
   - app/mobile: `Vibyra/_ai/Vibyra App Memory.md`
   - desktop bridge: `Vibyra/_ai/Vibyra Desktop Memory.md`
   - backend/cloud: `Vibyra/_ai/Vibyra Backend Memory.md`
5. If that index points to focused notes, read exactly one focused note for the task.

If “website,” “browser,” “phone app,” or “desktop app” is ambiguous, read
`Vibyra/_ai/Product Surfaces.md` before selecting a domain index. It separates
the public Laravel marketing site, Expo web client, native phone app, and the
native Tauri desktop app at `desktop-tauri/`. The old Electron desktop
companion has been removed — do not route work to it.

Use these notes to choose a narrow source-file set. Avoid generated folders such as `node_modules`, `.git`, `.expo`, `.vibyra-agent`, `backend/vendor`, and temporary browser profiles.

Before topic-specific work, check `.agents/skills/` for a matching local skill
and read it. Treat relevant skills as active instructions for the task.

For memory/skill audits, also read `Vibyra/_ai/Memory And Skills Optimization.md`.

### Personal And Real-World Questions

When the prompt concerns Ellis's personal life, money, career, business choices,
leadership, relationships, motivation, or a realistic real-world trade-off,
read `Vibyra/99 Meta/Ellis AI Mind/Ellis AI Mind.md` and then
`Vibyra/99 Meta/Ellis AI Mind/Books And Real-World Decisions.md`. This personal
route replaces the app/desktop/backend domain step unless the question also
depends on Vibyra source or live state. Use only confirmed personal facts, let
the current message override memory, and apply the smallest relevant set of
book lenses rather than mentioning all four mechanically.

### Release Provenance

For missing changes after publication, resolve the public release and CI SHA,
then inspect the feature worktree's tracked diff and untracked source files.
A merged branch tip does not include dirty worktree changes. Read implementation
status notes in that worktree and distinguish local validation from packaged
release evidence. Route findings to `Desktop/Desktop Updates.md`; never infer
publication from a completion note, version bump, or branch ancestry alone.
For an all-work inventory, include registered worktrees, refreshed remote refs,
open PRs and stashes; compare actual untracked files as well as tracked diffs.
Check older alternatives against release source before labeling them missing:
cherry-picks, refactors and replaced UI create false positives. Separate local
prototypes and planned capabilities from implemented release candidates.

### Prompt Transcript Audits

When auditing `Vibyra/Prompt Transcripts.md`:

- Use the user's local timezone to define the date window and state the frozen
  end time, because new events may arrive during the audit.
- Review every prompt event in scope, but do not copy raw transcripts, personal
  details, credentials, or long terminal output into Obsidian.
- Distinguish raw events from intentions. Cluster rapid same-session events and
  identify multiline paste fragments, copied UI labels, slash commands,
  accidental keys, and terminal output submitted as input.
- Treat transcript `Outcome: completed` only as terminal-turn closure. Require
  current source, tests, rendered state, or a reliable final answer before
  recording implementation as completed.
- Put dated cross-project synthesis in the global vault's `99 Meta/`, update
  the durable prompting profile only with stable deltas, and update project
  notes only when current status, priorities, risks, or reusable rules changed.
- Use `99 Meta/Ellis AI Mind/Ellis AI Mind.md` in the global vault as the
  authoritative personalisation hub. Route stable deltas to its smallest
  focused note and keep one-off evidence in the dated audit.
- Maintain `99 Meta/Ellis AI Mind/Source Coverage And Provenance.md` as the
  source ledger. Claim full prompt coverage only when non-overlapping audit
  windows reconcile exactly to the raw transcript event total.
- Record prompt-count semantics in `Desktop/Productivity Progress.md`; never
  present the raw counter as tasks completed or independent ideas.

## What Must Be Recorded

Update Obsidian when the task changes or confirms durable knowledge:

- architecture boundaries or module ownership
- route/API contracts, request/response behavior, or auth requirements
- permission or approval policy decisions
- validation commands and recurring diagnostic workflows
- generated local skills and when to use them
- local skill trigger rules, workflows, diagnostics, or validation patterns
- persistent state shape, cloud/local persistence, or migration behavior
- recurring bugs and their proven recovery path
- product decisions that future agents should preserve

Write back before the final response when the task produced stable context.
Do not record temporary implementation noise, raw command output, speculative
plans, transcripts, or every touched file. Record the durable rule and the files
future agents should inspect first.

If a durable lesson belongs in a local skill, update that skill directly and add
only the routing/context fact to Obsidian.

## Where To Write

- Cross-project workflow: `Vibyra/_ai/Runbook.md`
- Stable repo overview: `Vibyra/_ai/Project Context.md`
- App/mobile index: `Vibyra/_ai/Vibyra App Memory.md`
- Desktop bridge index: `Vibyra/_ai/Vibyra Desktop Memory.md`
- Backend/cloud index: `Vibyra/_ai/Vibyra Backend Memory.md`
- Focused app facts: the relevant file under `Vibyra/_ai/App/`
- Generated run summaries: `Vibyra/_ai/Runs/` only when a run note is explicitly useful
- Ellis personalisation: `Vibyra/99 Meta/Ellis AI Mind/`

Prefer the smallest focused note that future sessions will naturally read. Keep index notes short and move feature-specific details to focused notes.

Long specs, research files, and decision logs are deep references. Keep them
searchable, but do not route agents to read them by default.

## End Of Task Checklist

Before final response, ask:

- Did I change durable architecture, route behavior, permissions, validation workflow, or state shape?
- Did I create or rename a skill?
- Did I change or confirm a workflow that belongs in an existing skill?
- Did I discover a recurring bug pattern or repo-specific diagnostic?
- Did I split ownership across new files that future agents need to know about?
- Did I leave an oversized everyday note that should instead be a deep reference
  or split into a focused note?

If yes, update Obsidian before final. In the final response, mention which note was updated. If no memory update was needed, say that no durable Obsidian update was warranted.

## Tone And Scope

Memory notes should be compact, factual, and future-facing:

- Say what changed and why it matters.
- Name the source files or modules future agents should inspect first.
- Avoid blaming previous sessions or narrating the chat.
- Avoid long changelogs. Durable architecture beats exhaustive history.

### Publishing integrated desktop and phone work

Use `docs/releases/0.6.0-publication.md` as the cross-surface release ledger.
A successful desktop workflow supplies signed artifacts; it does not deploy
backend metadata or publish a phone binary. Keep one exact source SHA per
artifact set, verify remote hashes before staged metadata and deployment, and
test an older updater client after cutover. Preserve active user workspaces.
For the standalone phone client, inspect the actual EAS upload archive:
`mobile/src/generated` must be present, while backend data and local logs must
be absent. Native store signing, hosted web delivery and standalone Host
previews are separate evidence. Record their state in `Desktop/Release 0.6.0.md`.

For temporary Railway publication access, this CLI version discovers registration
candidates under `~/.ssh` even when `ssh keys add --key` receives a path elsewhere.
A zero exit status saying all local keys are registered does not prove the new
key was registered. Verify its fingerprint in `railway ssh keys list`, use a
uniquely named temporary key, and remove that registration and private material
after publication. Never print private keys or provider credentials.

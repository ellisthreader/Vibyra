---
name: vibyra-obsidian
description: Keep Vibyra Obsidian memory accurate before, during, and after repo work. Use when working in this repo on code, architecture, workflows, permissions, routes, debugging, or durable project decisions, especially when changes should be recorded in Vibyra/_ai so future sessions do not rediscover them.
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

Use these notes to choose a narrow source-file set. Avoid generated folders such as `node_modules`, `.git`, `.expo`, `.vibyra-agent`, `backend/vendor`, and temporary browser profiles.

Before topic-specific work, check `.agents/skills/` for a matching local skill
and read it. Treat relevant skills as active instructions for the task.

For memory/skill audits, also read `Vibyra/_ai/Memory And Skills Optimization.md`.

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

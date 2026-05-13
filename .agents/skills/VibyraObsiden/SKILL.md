---
name: VibyraObsiden
description: Keep Vibyra Obsidian memory accurate before, during, and after repo work. Use when working in this repo on code, architecture, workflows, permissions, routes, debugging, or durable project decisions, especially when changes should be recorded in Vibyra/_ai so future sessions do not rediscover them.
metadata:
  short-description: Maintain Vibyra Obsidian memory
---

# VibyraObsiden

Use this skill to treat Obsidian memory as part of delivery. Do not wait for the user to ask whether memory was updated when the work produced durable knowledge.

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

## What Must Be Recorded

Update Obsidian when the task changes or confirms durable knowledge:

- architecture boundaries or module ownership
- route/API contracts, request/response behavior, or auth requirements
- permission or approval policy decisions
- validation commands and recurring diagnostic workflows
- generated local skills and when to use them
- persistent state shape, cloud/local persistence, or migration behavior
- recurring bugs and their proven recovery path
- product decisions that future agents should preserve

Do not record temporary implementation noise, raw command output, speculative plans, or every touched file. Record the durable rule and the files future agents should inspect first.

## Where To Write

- Cross-project workflow: `Vibyra/_ai/Runbook.md`
- Stable repo overview: `Vibyra/_ai/Project Context.md`
- App/mobile index: `Vibyra/_ai/Vibyra App Memory.md`
- Desktop bridge index: `Vibyra/_ai/Vibyra Desktop Memory.md`
- Backend/cloud index: `Vibyra/_ai/Vibyra Backend Memory.md`
- Focused app facts: the relevant file under `Vibyra/_ai/App/`
- Generated run summaries: `Vibyra/_ai/Runs/` only when a run note is explicitly useful

Prefer the smallest focused note that future sessions will naturally read. Keep index notes short and move feature-specific details to focused notes.

## End Of Task Checklist

Before final response, ask:

- Did I change durable architecture, route behavior, permissions, validation workflow, or state shape?
- Did I create or rename a skill?
- Did I discover a recurring bug pattern or repo-specific diagnostic?
- Did I split ownership across new files that future agents need to know about?

If yes, update Obsidian before final. In the final response, mention which note was updated. If no memory update was needed, say that no durable Obsidian update was warranted.

## Tone And Scope

Memory notes should be compact, factual, and future-facing:

- Say what changed and why it matters.
- Name the source files or modules future agents should inspect first.
- Avoid blaming previous sessions or narrating the chat.
- Avoid long changelogs. Durable architecture beats exhaustive history.

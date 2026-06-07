# Memory Protocol

Purpose: keep Obsidian as the active repo memory layer while minimizing token
use. Agents should consult small, durable notes before reading source files and
write back stable context that future sessions should reuse.

## Read Order

1. `Memory Protocol.md` (this file, usually from repo instructions)
2. `Context Map.md`
3. `Project Context.md`
4. Exactly one domain index unless the task crosses boundaries:
   - `Vibyra App Memory.md`
   - `Vibyra Desktop Memory.md`
   - `Vibyra Backend Memory.md`
5. If the domain index points to focused topic notes, read exactly one focused note for the task.
6. Only then inspect source files named by the focused note or found with a targeted search.

For memory or local-skill maintenance, read `Memory And Skills Optimization.md`
after this protocol and before editing notes or skills.

## Token Rules

- Do not read the whole repo.
- Do not read generated folders: `node_modules`, `.git`, `.expo`, `.vibyra-agent`, `backend/vendor`.
- Read matching local skills in `.agents/skills/` before topic-specific work;
  treat them as workflow rules for that task, not background references.
- Prefer `rg` for symbols, route names, component names, and error strings.
- Read files in slices when only one function or area is needed.
- Keep durable notes short and topic-scoped; move long logs and temporary detail to `_ai/Runs/`.

## Update Rules

Interact with Obsidian whenever the task involves Vibyra code, architecture,
debugging, workflows, routes, permissions, state, product behavior, or repo
decisions. Update memory when learning or confirming stable context:

- architecture changes;
- important file ownership;
- route/API contracts;
- workflows for running or testing;
- permission or approval behavior;
- persistent state shape or migrations;
- recurring bugs or decisions.

Write to the smallest relevant note under `Vibyra/_ai/` before finishing the
task. Do not add transient command output, stack traces, transcripts,
speculative plans, or exhaustive touched-file lists to core notes.

Update a local skill when the task changes or confirms a durable workflow,
diagnostic checklist, validation pattern, design rule, permission rule, or other
topic-specific operating instruction that belongs in that skill. Keep skills
actionable and compact; avoid copying full run notes into them.

## Practical Budget

For most tasks, read no more than:

- this protocol;
- `Project Context.md`;
- one domain index and one focused topic note;
- two to five source files.

If more context is needed, summarize what was learned before reading more.

## Note Size Rules

- Index notes should route, not explain; keep them under about 60 lines when practical.
- Focused notes should fit one feature/workflow and stay under about 80 lines when practical.
- Split notes when a section grows enough that a future task would not usually need the whole thing.
- Prefer filenames that match user language, for example `AI Live Chat.md`, `Live Preview.md`, or `Pairing And Connection.md`.
- Long specs and decision logs are deep references. Do not read them by default; use `rg` for exact terms and then read only the matching section.
- Deep references should stay searchable but must not be the default next hop
  from `Context Map.md` unless the task explicitly needs that depth.

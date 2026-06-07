# Vibyra Agent Instructions

Treat Obsidian as the repo memory layer whenever the task involves Vibyra code,
architecture, workflows, debugging, routes, permissions, product decisions, or
other durable project context. Use it before broad exploration and write back
when the work produces stable context future agents should reuse.

Use relevant local skills as active workflow instructions, not optional
references. Before starting topic-specific work, check whether a skill in
`.agents/skills/` matches the task, read it, and follow it. If the work changes
or confirms a durable workflow, diagnostic, design rule, permission rule, or
validation pattern covered by a skill, update the smallest relevant skill before
finishing so future runs do not rediscover the same rule.

Before broad repo exploration, read the Obsidian memory notes:

1. `Vibyra/_ai/Memory Protocol.md`
2. `Vibyra/_ai/Context Map.md`
3. `Vibyra/_ai/Project Context.md`
4. Exactly one relevant domain index:
   - `Vibyra/_ai/Vibyra App Memory.md`
   - `Vibyra/_ai/Vibyra Desktop Memory.md`
   - `Vibyra/_ai/Vibyra Backend Memory.md`
5. If the domain index points to focused topic notes, read exactly one focused note for the task.

Use those notes to choose the smallest source-file set for the task. Do not read generated folders such as `node_modules`, `.git`, `.expo`, `.vibyra-agent`, or `backend/vendor`.

When you learn or confirm durable architecture, workflow, route/API contract,
permission behavior, validation flow, product decision, or recurring bug
context, update the smallest relevant note in `Vibyra/_ai/` before finishing.
Do not write transcripts, raw command output, speculative plans, or every
touched file; write compact context that helps the next agent start efficiently.
When a skill is updated, also record the durable routing fact in the relevant
Obsidian note if future agents need to know when to use it.

## One-command desktop setup

For a fresh checkout, run only:

```bash
npm run desktop:setup
```

This installs dependencies, prepares the Laravel database, starts the backend,
and launches Vibyra Desktop.

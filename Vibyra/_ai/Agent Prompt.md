# Agent Prompt

Use this at the start of future Codex prompts:

```text
Before exploring broadly, read:

- Vibyra/_ai/Memory Protocol.md
- Vibyra/_ai/Context Map.md
- Vibyra/_ai/Project Context.md

Then check whether a local skill in .agents/skills matches the task. If it
does, read and follow that skill before broad source exploration.

Then choose only the relevant domain index:

- Vibyra/_ai/Vibyra App Memory.md for mobile app work
- Vibyra/_ai/Vibyra Desktop Memory.md for desktop bridge work
- Vibyra/_ai/Vibyra Backend Memory.md for Laravel/OpenRouter/credits work

If the domain index points to focused topic notes, read exactly one focused note
for the task. Use those notes as project memory. Only inspect files directly
relevant to the task. Update the smallest relevant Obsidian note before
finishing if you learn durable architecture, workflow, route/API, permission,
validation, product, state, or recurring-bug context. Update the relevant local
skill too when the reusable operating rule belongs there.
```

For bug fixes:

```text
Read Vibyra/_ai/Memory Protocol.md and Vibyra/_ai/Context Map.md first. Then investigate only the files related to this error:

<paste error here>
```

For feature work:

```text
Read Vibyra/_ai/Memory Protocol.md, Vibyra/_ai/Context Map.md, the relevant domain index, and one focused topic note if available. Then implement:

<feature request here>
```

For memory or skill optimization:

```text
Read Vibyra/_ai/Memory And Skills Optimization.md, then audit the relevant
domain index, focused note, and local skill. Keep routing notes compact, mark
long research/spec files as deep references, and update skills when durable
workflow instructions change.
```

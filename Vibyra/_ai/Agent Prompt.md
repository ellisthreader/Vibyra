# Agent Prompt

Use this at the start of future Codex prompts:

```text
Before exploring broadly, read:

- Vibyra/_ai/Memory Protocol.md
- Vibyra/_ai/Context Map.md
- Vibyra/_ai/Project Context.md

Then choose only the relevant domain index:

- Vibyra/_ai/Vibyra App Memory.md for mobile app work
- Vibyra/_ai/Vibyra Desktop Memory.md for desktop bridge work
- Vibyra/_ai/Vibyra Backend Memory.md for Laravel/OpenRouter/credits work

If the domain index points to focused topic notes, read exactly one focused note for the task. Use those notes as project memory. Only inspect files directly relevant to the task, and update the smallest relevant note if you learn durable architecture, workflow, or decision context.
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

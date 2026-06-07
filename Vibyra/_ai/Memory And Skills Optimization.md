# Memory And Skills Optimization

Read this when auditing, repairing, or extending Vibyra's Obsidian memory layer
or local `.agents/skills/` workflows.

## Goal

Obsidian is the routing cache. Local skills are operating instructions. Keep
both compact enough that future agents can choose the right source files without
rediscovering repo structure or repeating old diagnostics.

## Audit Checklist

- Start with `Memory Protocol.md`, `Context Map.md`, `Project Context.md`, and
  the relevant domain index.
- Check whether the task has a matching local skill; read and follow it before
  broad source exploration.
- Keep domain indexes short and route-focused. Move feature details to focused
  notes.
- Keep focused notes near the protocol target of about 80 lines when practical.
  If a note grows past that because it contains research, specs, or history,
  mark it as a deep reference and route agents to a smaller note first.
- Search deep references with `rg` for exact terms before opening them.
- Update Obsidian only with durable architecture, route/API, workflow,
  permission, validation, persistent-state, product, or recurring-bug context.
- Update local skills when a durable workflow, diagnostic checklist, validation
  pattern, design rule, or permission rule becomes reusable.

## Deep Reference Policy

Do not read these by default. Search them and read only the matching section:

- `Decisions.md`
- `Backend/AI Live Chat Backend Context.txt`
- `Backend/Railway Cloud Runtime.md`
- `Desktop/AI Terminal Provider CLI Research.txt`
- `Desktop App Implementation Spec.md`
- `Mobile App Desktop Recreation Spec.md`
- `Marketing/Competitor Marketing Analysis.md`

## Verification

Use null-delimited line counts so filenames with spaces are handled correctly:

```bash
find Vibyra/_ai -path 'Vibyra/_ai/Runs' -prune -o -type f \( -name '*.md' -o -name '*.txt' \) -print0 | xargs -0 wc -l | sort -n
find .agents/skills -name SKILL.md -print0 | xargs -0 wc -l | sort -n
```

After edits, confirm `Context Map.md`, domain indexes, and any touched skills
still point to the smallest useful next note.

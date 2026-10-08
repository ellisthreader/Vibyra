---
type: index
aliases:
  - Experiments
updated: 2026-07-09
tags:
  - index/projects
  - project-group/experiments
---

# Experiments

Smaller active projects, prototypes, and review-stage ideas that do not yet need a dedicated project folder.

## Navigation

- [[01 Projects/Projects|Projects]]
- [[03 Resources/Development Commands|Development Commands]]
- [[03 Resources/Repository Checklist|Repository Checklist]]

## Project Notes

```dataview
TABLE WITHOUT ID file.link AS Project, status AS Status, priority AS Priority, next_action AS "Next action"
FROM "01 Projects/Experiments"
WHERE type = "project"
SORT status ASC, priority ASC, file.name ASC
```

## Rule

Promote an experiment into its own `01 Projects/<Project>` folder once it gains durable memory, incidents, decisions, or repeated active work.

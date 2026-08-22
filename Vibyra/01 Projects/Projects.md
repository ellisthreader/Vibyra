---
type: index
aliases:
  - Project Registry
updated: 2026-07-12
tags:
  - index/projects
---

# Projects

This is the canonical project registry. Each project or project group has its own folder so memory, incidents, decisions, runs, and support notes stay together.

## Navigation

- [[Home|Home]]
- [[00 Inbox/Inbox|Inbox]]
- [[02 Areas/Areas|Areas]]
- [[03 Resources/Resources|Resources]]
- [[04 Archive/Archive|Archive]]
- [[05 Daily/Daily Notes|Daily Notes]]
- [[90 Templates/Project Template|Project Template]]

## Primary Hubs

- [[01 Projects/RealEstate/RealEstate|RealEstate]]
- [[01 Projects/Vibyra/Vibyra|Vibyra]]
- [[01 Projects/Service Priority AI/Service Priority AI|Service Priority AI]]
- [[01 Projects/RelayClarity/RelayClarity|RelayClarity]]
- [[01 Projects/ClearDBS/ClearDBS Website|ClearDBS]]
- [[01 Projects/Hong Kong Express/Hong Kong Express|Hong Kong Express]]
- [[01 Projects/Portfolio/Portfolio|Portfolio]]
- [[01 Projects/Experiments/Experiments|Experiments]]
- [[01 Projects/Bear Lane/Bear Lane|Bear Lane]]

## Active

```dataview
TABLE WITHOUT ID file.link AS Project, priority AS Priority, stack AS Stack, next_action AS "Next action"
FROM "01 Projects"
WHERE type = "project" AND status = "active"
SORT priority ASC, file.folder ASC, file.name ASC
```

## Maintain

```dataview
TABLE WITHOUT ID file.link AS Project, stack AS Stack, next_action AS "Next action"
FROM "01 Projects"
WHERE type = "project" AND status = "maintain"
SORT file.folder ASC, file.name ASC
```

## Review And Rename

```dataview
TABLE WITHOUT ID file.link AS Project, project_path AS Location, next_action AS "Decision"
FROM "01 Projects"
WHERE type = "project" AND status = "review"
SORT file.folder ASC, file.name ASC
```

## Missing Repository

```dataview
TABLE WITHOUT ID file.link AS Project, project_path AS Location, next_action AS "Next action"
FROM "01 Projects"
WHERE type = "project" AND (!repository OR repository = "")
SORT priority ASC, file.folder ASC, file.name ASC
```

## Folder Convention

- Project home: `01 Projects/<Project>/<Project>.md`.
- Project memory and working context: keep beside the project home in named subfolders such as `Memory`, `Runs`, `Decisions`, `Lessons`, `Incidents`, `Audits`, or `Specs`.
- Small or uncertain work belongs in [[01 Projects/Experiments/Experiments|Experiments]] until it deserves its own project folder.

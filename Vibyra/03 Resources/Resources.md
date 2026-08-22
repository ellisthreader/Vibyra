---
type: index
aliases:
  - Resource Library
updated: 2026-07-09
tags:
  - index/resources
---

# Resources

## Coding Memory

- [[03 Resources/Codex Lessons Learned|Codex Lessons Learned]]
- [[03 Resources/Architecture Decision Register|Architecture Decision Register]]
- [[03 Resources/Development Commands|Development Commands]]
- [[03 Resources/Repository Checklist|Repository Checklist]]

Use this folder for reusable technical notes, checklists, snippets, research, and references that belong to more than one project.

## Navigation

- [[Home|Home]]
- [[00 Inbox/Inbox|Inbox]]
- [[01 Projects/Projects|Projects]]
- [[02 Areas/Areas|Areas]]
- [[05 Daily/Daily Notes|Daily Notes]]
- [[90 Templates/Resource Template|Resource Template]]
- [[99 Meta/Meta|Meta]]

## Categories

- [[03 Resources/Interview Preparation/Interview Preparation System|Interview Preparation System]]
- [[03 Resources/Development Commands|Development Commands]]
- [[03 Resources/Repository Checklist|Repository Checklist]]
- [[03 Resources/Marketing/Index|Marketing]]
- [[99 Meta/Vault Inventory|Vault Inventory]]
- [[99 Meta/Bases/All Notes.base|All Notes Base]]
- [[99 Meta/Canvases/Vault Map.canvas|Vault Map Canvas]]

```dataview
TABLE WITHOUT ID file.link AS Resource, category AS Category, updated AS Updated
FROM "03 Resources"
WHERE type = "resource"
SORT file.folder ASC, file.name ASC
```

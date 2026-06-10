---
type: index
aliases:
  - Project Registry
---

# Projects

## Active

```dataview
TABLE WITHOUT ID file.link AS Project, priority AS Priority, stack AS Stack, next_action AS "Next action"
FROM "01 Projects"
WHERE type = "project" AND status = "active"
SORT priority ASC, file.name ASC
```

## Maintain

```dataview
TABLE WITHOUT ID file.link AS Project, stack AS Stack, next_action AS "Next action"
FROM "01 Projects"
WHERE type = "project" AND status = "maintain"
SORT file.name ASC
```

## Review And Rename

```dataview
TABLE WITHOUT ID file.link AS Project, project_path AS Location, next_action AS "Decision"
FROM "01 Projects"
WHERE type = "project" AND status = "review"
SORT file.name ASC
```

## Archived

See [[04 Archive/Archive|Archive]].

## Adding A Project

Create a note from [[90 Templates/Project Template|Project Template]]. Keep the record short: purpose, location, repository, current focus, and next action.


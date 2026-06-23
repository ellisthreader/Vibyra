---
type: dashboard
aliases:
  - Global Vault
cssclasses:
  - global-home
---

# Global Vault

One place to navigate every project, responsibility, reference, and daily note.

> [!tip] Start here
> Capture quickly in [[00 Inbox/Inbox|Inbox]], then move the note to Projects, Areas, Resources, or Archive during review.

## Quick Access

- [[01 Projects/Projects|Projects]] - software, experiments, and workspace collections
- [[02 Areas/Areas|Areas]] - ongoing responsibilities without an end date
- [[03 Resources/Resources|Resources]] - reusable knowledge and references
- [[05 Daily/Daily Notes|Daily Notes]] - dated work logs and planning
- [[_ai/Context Map|Vibyra Context Map]] - detailed Vibyra engineering memory
- [[_ai/RelayClarity/RelayClarity Memory|RelayClarity Memory]] - scoped memory for the RelayClarity project
- [[04 Archive/Archive|Archive]] - inactive material and backups

## Active Projects

```dataview
TABLE WITHOUT ID
  file.link AS Project,
  status AS Status,
  priority AS Priority,
  next_action AS "Next action"
FROM "01 Projects"
WHERE type = "project" AND status = "active"
SORT priority ASC, file.name ASC
```

## Needs Review

```dataview
TABLE WITHOUT ID
  file.link AS Project,
  project_path AS Location,
  next_action AS "Decision"
FROM "01 Projects"
WHERE type = "project" AND status = "review"
SORT file.name ASC
```

## Open Project Tasks

```dataview
TASK
FROM "01 Projects"
WHERE !completed
GROUP BY file.link
```

## Navigation Rules

1. Every project gets one home note in `01 Projects`.
2. Store project-specific notes beside its home note or in the project's established memory folder.
3. Use `02 Areas` for ongoing responsibilities and `03 Resources` for reusable knowledge.
4. Put unprocessed notes in `00 Inbox`; do not create loose notes at the vault root.
5. Archive instead of deleting when a project becomes inactive.


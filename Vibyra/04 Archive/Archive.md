---
type: index
---

# Archive

Inactive projects, completed material, and verified backups live here.

```dataview
TABLE WITHOUT ID file.link AS Item, archived_on AS "Archived on", source_path AS "Original location"
FROM "04 Archive"
WHERE type = "archive"
SORT file.name ASC
```

Archive notes first. Delete source folders only after confirming the canonical project and backup contents.


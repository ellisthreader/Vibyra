---
type: index
---

# Inbox

Capture first. Organize during a daily or weekly review.

## Processing Checklist

- Is it an actionable project? Move it to `01 Projects`.
- Is it an ongoing responsibility? Move it to `02 Areas`.
- Is it reusable information? Move it to `03 Resources`.
- Is it finished or inactive? Move it to `04 Archive`.
- Add links to at least one project, area, or resource note.

```dataview
LIST
FROM "00 Inbox"
WHERE file.name != "Inbox"
SORT file.ctime DESC
```


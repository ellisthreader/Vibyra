---
title: ClearDBS Memory
type: project-memory
project: ClearDBS
status: active
updated: 2026-07-07
tags:
  - ai/memory
  - project/cleardbs
---

# ClearDBS Memory

> [!info] AI quick context
> Start here for ClearDBS website work. Project home note: [[01 Projects/ClearDBS/ClearDBS Website|ClearDBS Website]].

## Key facts

- GitHub source of truth is `https://github.com/LunaTMT/ClearDBS`. When the user says "from GitHub", "latest push", or "the merge we made", verify this remote before running anything.
- Latest clean GitHub checkout used on 2026-07-07: `C:\Users\Ellis\Desktop\ClearDBS-GitHub`, branch `dashboard-app-refresh`, commit `db5c1b3` (`Polish dashboard section tables`).
- `C:\Users\Ellis\Desktop\clear dbs` and `/home/ellis/Desktop/RelayClarity` are not the ClearDBS website. They point at `ellisthreader/test-zoom-project` / RelayClarity-derived code and can render the wrong app.
- For the clean GitHub checkout, run Laravel on `http://localhost:8084` and Vite on `http://localhost:5298`; verify `/` says `ClearDBS` and does not contain `RelayClarity`.

- Real code lives at `C:\Users\Ellis\ClearDBS` â€” **not** `C:\Users\Ellis\Desktop\clear dbs` (that Desktop folder is the RelayClarity / test-zoom-project copy; see [[01 Projects/ClearDBS/Incidents/Clear DBS Workspace Misrouting Incident Report|the misrouting incident report]]).
- Stack: native PHP (Laravel) + SQLite. Run with `php artisan serve --port=8084` plus Vite dev server â€” NOT Docker/Sail.
- Site runs at `http://localhost:8084`.
- The AI voice call demo is owned by RelayClarity. Active RelayClarity work is at `/home/ellis/Desktop/RelayClarity`, normally on port `8787` (`live-call.html`); verify the actual port/process before a demo. See [[01 Projects/RelayClarity/RelayClarity Memory|RelayClarity Memory]].

## Recent live chat and help UI context

- Public help should feel like a simple support center with phone support, live chat, email, and practical ClearDBS guidance.
- AI chat must remain compact and professional. The icon should be simple, without the old extra star detail, and should have a subtle hover animation.
- Clicking suggested questions should expand the existing chat panel smoothly, not open a separate modal.
- Expanded article answers should include practical DBS support content, concise `Powered by RelayClarity`, a staff author treatment such as Taylor Threader, and a small feedback component.
- If the user searches from the homepage help area, route to the help/live-chat page with the search box focused. The live chat page must not scroll the homepage behind it.
- Keep the boundary clear: RelayClarity/ClearDBS guidance can help with process and next steps but must not make official DBS decisions.

## Read order (ClearDBS tasks)

1. This file.
2. [[01 Projects/ClearDBS/ClearDBS Website|ClearDBS Website]] â€” status and next actions.
3. `Lessons/` notes here as they accumulate.

## Lessons

- [[01 Projects/ClearDBS/Lessons/Work in ClearDBS repo, never the Desktop lookalike folders|Work in C:\Users\Ellis\ClearDBS, never the Desktop lookalike folders]]
- [[01 Projects/ClearDBS/Lessons/Run ClearDBS natively, not via Docker Sail|Run ClearDBS natively (PHP + SQLite), not via Docker/Sail]]
- [[01 Projects/ClearDBS/Lessons/Voice call demo needs a fresh cloudflared tunnel and a clean port 8787|Voice call demo needs a fresh cloudflared tunnel and a clean port 8787]]
- [[01 Projects/Vibyra/Runs/Two Week Chat Context Review - 2026-07-07]]

Add new lessons with [[90 Templates/Lesson Template|Lesson Template]].

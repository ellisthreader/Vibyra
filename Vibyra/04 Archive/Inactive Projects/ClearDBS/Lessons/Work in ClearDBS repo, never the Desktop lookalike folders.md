---
title: Work in C:\Users\Ellis\ClearDBS, never the Desktop lookalike folders
type: lesson
project: ClearDBS
date: 2026-07-06
status: active
tags:
  - lesson
  - project/cleardbs
---

# Work in `C:\Users\Ellis\ClearDBS`, never the Desktop lookalike folders

## Rule

For ClearDBS website work, always launch sessions from `C:\Users\Ellis\ClearDBS`. Three similarly named folders exist and picking the wrong one has repeatedly burned sessions.

If the user asks for the real site "from GitHub", "latest push", or a recent merge, use the GitHub source of truth `https://github.com/LunaTMT/ClearDBS`. On 2026-07-07 the verified latest pushed work was the clean checkout at `C:\Users\Ellis\Desktop\ClearDBS-GitHub`, branch `dashboard-app-refresh`, commit `db5c1b3`.

## Evidence

- `C:\Users\Ellis\Desktop\clear dbs` began life as an empty placeholder from a failed repo lookup (2026-06-27), then became the RelayClarity voice-agent backend â€” it is **not** the website.
- `/home/ellis/Desktop/RelayClarity` is an **older sibling copy** of the RelayClarity codebase; running its server steals port 8787 and it has no OpenAI key.
- The real site (`Laravel + Inertia + React + TS`, ~39k files, branch `relay-clarity`) is at `C:\Users\Ellis\ClearDBS`. Full history: [[01 Projects/ClearDBS/Incidents/Clear DBS Workspace Misrouting Incident Report|misrouting incident report]].

## How to apply

- Website from latest GitHub push -> open or update `C:\Users\Ellis\Desktop\ClearDBS-GitHub`, confirm `git remote get-url origin` is `https://github.com/LunaTMT/ClearDBS.git`, then confirm branch and latest commit before starting servers.

- Website/SaaS task â†’ open `C:\Users\Ellis\ClearDBS`.
- Voice-agent/RelayClarity task â†’ open `C:\Users\Ellis\Desktop\clear dbs`.
- Never run anything from `Desktop\test zoom project`; if port 8787 is mysteriously busy, kill terminals rooted there first.

## 2026-07-07 diagnosis

The wrong site was served because the session trusted the folder name `C:\Users\Ellis\Desktop\clear dbs`. That folder is not the ClearDBS website; it is a RelayClarity/test-zoom-project-derived Vite app with remote `ellisthreader/test-zoom-project`. Searching only the `ellisthreader` account also missed the real private repo, which is under `LunaTMT/ClearDBS`.

The correct run was:

1. Clone/fetch `LunaTMT/ClearDBS`.
2. Use the latest pushed branch `dashboard-app-refresh` when the user asks for the latest merged GitHub work.
3. Stop stale wrong-app ports such as `5173`, `5174`, `5179`, `8787`, and `8789`.
4. Run Laravel on `127.0.0.1:8084` and Vite on `127.0.0.1:5298`.
5. Verify the page title/content says `ClearDBS` and does not contain `RelayClarity` before giving the link.

## Prompt impact

State the intended repo path explicitly in the first prompt of a session, e.g. "Working on the ClearDBS website at C:\Users\Ellis\ClearDBS (not the Desktop folders)."

For latest-GitHub requests, also state: "Use `LunaTMT/ClearDBS`, not `ellisthreader/test-zoom-project`."

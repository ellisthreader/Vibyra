---
type: resource
category: inventory
updated: 2026-08-22
tags:
  - resource/inventory
  - index/vault
---

# Vault Inventory

## System Links

- [[Home|Home]]
- [[00 Inbox/Inbox|Inbox]]
- [[01 Projects/Projects|Projects]]
- [[02 Areas/Areas|Areas]]
- [[03 Resources/Resources|Resources]]
- [[04 Archive/Archive|Archive]]
- [[05 Daily/Daily Notes|Daily Notes]]
- [[90 Templates/Project Template|Project Template]]
- [[99 Meta/Meta|Meta]]

## Scope

Single canonical vault at `/home/ellis/Desktop/Vibyra/Vibyra`, consolidated on **2026-08-22**.

Until then there were two: this one (written by agents, current) and a copy inside the abandoned `Desktop/SaaS` repo (the one Obsidian actually opened, frozen since mid-July). They were merged, Obsidian was repointed here, and the old copy was tombstoned.

Current total: **217 Markdown notes** (was 158 before the merge; the growth is archived history, not new content).

## The two layers — do not mix them

| Layer | Purpose | Who writes it |
| --- | --- | --- |
| `_ai/` | Vibyra engineering memory. The routing target for `AGENTS.md` and every skill. | Agents, continuously |
| everything else | PARA: project hubs, other projects' knowledge, areas, resources, archive | Ellis, and agents on request |

**Rule:** Vibyra engineering detail lives in `_ai/` only. `01 Projects/Vibyra.md` is a hub that links into it. Duplicating `_ai/` content into `01 Projects/` is what caused the July fork — don't do it again.

## Folder Inventory

| Folder | Role | Notes |
| --- | --- | ---: |
| `00 Inbox` | Capture, unprocessed notes | 1 |
| `01 Projects` | Active projects only: Vibyra, HKE, RelayClarity, Portfolio, Experiments | 37 |
| `02 Areas` | Ongoing responsibilities, skills, career evidence, learning roadmap | 7 |
| `03 Resources` | Reusable knowledge, checklists, commands, architecture decisions | 6 |
| `04 Archive` | Inactive projects, pre-Tauri Vibyra planning, raw logs | 80 |
| `05 Daily` | Daily note index | 1 |
| `90 Templates` | Creation templates, incl. AI session and interview-prep templates | 14 |
| `99 Meta` | Inventory, coding memory, prompting profile, audits | 8 |
| `_ai` | Vibyra engineering memory (see below) | 61 |
| `_attachments` | Obsidian attachments | — |

## `_ai/` Layout

| Subfolder | Notes |
| --- | ---: |
| `App/` — Expo phone app | 17 |
| `Backend/` — Laravel, Railway, billing | 12 |
| `Desktop/` — Tauri desktop app | 9 |
| `Marketing/` — website, video, competitor research | 4 |
| `Design/` — Graphite + Cobalt colour system | 1 |
| `Runs/` — run logs (gitignored, fold into durable notes then delete) | 3 |
| `Templates/` | 2 |

Root of `_ai/`: `Memory Protocol`, `Context Map`, `Project Context`, `Product Surfaces`, `Runbook`, `Current Tasks`, `Decisions`, `Architecture`, three domain indexes, and the code/memory standards.

## Active Projects

| Project | Repo | Status |
| --- | --- | --- |
| Vibyra | `/home/ellis/Desktop/Vibyra` | active |
| Hong Kong Express | `/home/ellis/Desktop/HKE` | active |
| RelayClarity | `/home/ellis/Desktop/RelayClarity` | active |
| Portfolio Website | `/home/ellis/Desktop/PortfolioWebsite` | active |
| LLM Voice Assistant | `/home/ellis/Desktop/VoiceAssistant` | active |
| Phone Preview | `/home/ellis/Desktop/PhonePreview` | active |

Archived on 2026-08-22 (no folder left on disk): Bear Lane, ClearDBS, RealEstate / Gilbert and Rose, Service Priority AI, Zoom Interview Prep, Portfolio Starter, and five dead experiments.

## Project Status Snapshot

```dataview
TABLE WITHOUT ID status AS Status, length(rows) AS Count
FROM "01 Projects"
WHERE type = "project"
GROUP BY status
SORT status ASC
```

## Navigation Standard

- Root stays clean: keep working notes out of the vault root.
- Index notes use `## Navigation` to connect main folders.
- Project notes keep `project_path`, `status`, `next_action`, and canonical links. **`project_path` must point at a folder that exists** — if it doesn't, the project belongs in `04 Archive`.
- Durable reusable knowledge belongs in [[03 Resources/Resources|Resources]].
- Vault maps, audits, and administrative history belong in [[99 Meta/Meta|Meta]].
- Archive instead of deleting when a project goes inactive.
- Raw logs and transcripts do not belong in the vault. They bloat it and nothing reads them.

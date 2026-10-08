---
title: ClearDBS Website
type: project
status: active
priority: 1
project_path: C:\Users\Ellis\ClearDBS
repository: https://github.com/LunaTMT/ClearDBS
branch: relay-clarity
last_commit: 2026-07-06
next_action: Review and commit local changes, then verify the canonical Laravel site and RelayClarity voice demo together
tags:
  - project/cleardbs
---

# ClearDBS Website

Customer-facing website for ClearDBS, with an embedded AI voice-call demo.

## Project Record

- **Target users:** DBS applicants, employers/organisations managing checks, and support staff.
- **Status:** Active local development; pre-launch/production status is not confirmed.
- **Stack:** Laravel/PHP, Inertia.js, React, Vite, SQLite.
- **Architecture:** Laravel owns the website, routes, application data, and Inertia pages; RelayClarity supplies the separate voice/AI demo backend.
- **Authentication:** Laravel application auth exists for dashboard flows; public support chat/help is available on the public site. Current production auth/security has not been audited here.
- **Important files:** `routes/web.php`, `resources/js/Pages/Welcome.tsx`, `resources/js/Components/PublicSupportChat.tsx`, `resources/css/app.css`, Laravel controllers/services.
- **Confirmed local features:** Homepage help section, compact support chat, suggested questions, article answers/feedback, search-to-help routing and focus, staff author treatment, mobile behavior, and official-decision guardrails.
- **In progress/planned:** Real grounded answer quality, curated DBS knowledge, robust evaluation, production deployment, accessibility/security review, and reliable voice-demo startup.
- **Skills evidenced:** Laravel/Inertia/React exposure, support UX, compliance copy, repository/runtime diagnosis, responsive visual QA.
- **Source window:** Codex sessions 2026-06-27 to 2026-07-07; repository state checked 2026-07-10.

## Current Limitations

- Do not describe proposed scraping/RAG/model improvements as complete.
- Do not imply the assistant makes official DBS decisions or handles real applicant evidence unless verified and authorised.
- Multiple lookalike folders remain a routing risk.

- Code: `C:\Users\Ellis\ClearDBS` (PHP/Laravel + SQLite + Vite, runs at `http://localhost:8084`).
- GitHub source of truth: `https://github.com/LunaTMT/ClearDBS`. Latest clean GitHub checkout verified on 2026-07-07: `C:\Users\Ellis\Desktop\ClearDBS-GitHub`, branch `dashboard-app-refresh`, commit `db5c1b3`.
- AI memory: [[01 Projects/ClearDBS/ClearDBS Memory|ClearDBS Memory]].
- Voice demo backend: active RelayClarity work is at `/home/ellis/Desktop/RelayClarity`, normally port `8787` - see [[01 Projects/RelayClarity/RelayClarity|RelayClarity]]. The Desktop `clear dbs` folder is a RelayClarity-derived lookalike, not the website.
- Naming history and workspace confusion: [[Clear DBS Workspace Misrouting Incident Report]].

## Tasks

- [x] Backfill first Lessons notes from recent ClearDBS sessions (done 2026-07-06)
- [ ] Review the 14-file dirty worktree and commit only verified ClearDBS changes.
- [ ] Re-test homepage help search, compact chat/article flow, official-decision boundaries, and voice-call handoff from the canonical repo.

## Last Known Development State - 2026-07-10

- Canonical local site: `C:\Users\Ellis\ClearDBS`, branch `relay-clarity`, commit `95c806e` plus local changes.
- Confirmed local work includes the public support chat, compact help/article treatment, homepage search-to-help routing, focused search, staff-author presentation, and responsive behavior.
- The chat may give practical DBS process guidance but must not make official DBS decisions or imply real applicant evidence collection during pre-launch.
- Real AI/RAG quality improvements were discussed, but do not treat every proposed data-scraping or model feature as completed.

---
title: RealEstate Project Context
type: project-context
project: RealEstate
status: active
updated: 2026-07-12
tags:
  - ai/context
  - project/realestate
---

# RealEstate — Project Context

> [!info] AI quick context
> Read this note with [[Frontend Context]] for public-site or map work, [[Architecture]] for cross-package changes, and [[Runbook]] before diagnosing local loading failures.

> [!warning] Career context
> RealEstate may be shown as a live demo during a possible software-development interview or company conversation. Treat it as a self-directed AI-assisted prototype based on public research. Never imply confirmed employment, client commissioning, private-system access, company approval, or production use. See [[Interview Demo Context]].

## Product

The repository implements a property digital-twin platform comprising:

- React/Vite public website and agent workspace.
- NestJS/Fastify API.
- Prisma/PostgreSQL data layer and Redis-backed processing.
- Tauri desktop processor.
- Native Swift iOS capture application.
- Python reconstruction worker.
- Gaussian-splat viewer and tour editor.

The public experience is branded for Gilbert & Rose and includes service pages, property discovery, a property map, property detail pages, customer accounts, and immersive tours.

## Repository rules

The repository-level `AGENTS.md` is authoritative. Key constraints:

- Keep strict TypeScript; do not use undocumented `any`.
- Validate all external input.
- Preserve backwards compatibility unless explicitly permitted otherwise.
- Add tests for new behaviour.
- Do not commit secrets or generated capture assets.
- Web must not access the database directly.
- API must not execute reconstruction tools directly.
- Shared DTOs/enums belong in `packages/shared-types`.
- Runtime validation belongs in `packages/validation`.
- Database code belongs in `packages/database`.
- Viewer rendering belongs in `packages/viewer`.
- Desktop OS access goes through Tauri commands.

## Current repository condition

The worktree contains substantial pre-existing modified and untracked work across the web, API, database, mobile, worker, docs, and shared packages. Treat all unrelated changes as user-owned. Inspect `git status --short` before every task and never reset or overwrite unrelated changes.

## Verified local state on 2026-07-12

- Docker Desktop, PostgreSQL, and Redis were started successfully.
- Database migrations were current.
- Seed produced three 3D showcases and fourteen Southend listings.
- API was started on port `4000`.
- Vite was running on port `5173`.
- `/public/properties?page=1&pageSize=100` returned three published mapped showcases.
- Live browser verification showed the map, three property markers, and the branded office sign.

## Important operational lesson

When `/properties` remains on “Loading properties on the map,” check the API before changing Leaflet. The confirmed cause was no service listening on `localhost:4000`, while Vite was healthy on `5173`. See [[Runbook#Map loading diagnosis]].

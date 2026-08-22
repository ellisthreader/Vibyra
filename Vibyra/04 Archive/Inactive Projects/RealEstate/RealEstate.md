---
title: RealEstate
type: project
status: active
priority: 2
stack:
  - React
  - Vite
  - TypeScript
  - NestJS
  - Prisma
  - PostgreSQL
  - Redis
  - Tauri
  - Swift
  - Python
project_path: /home/ellis/Desktop/RealEstate
repository: /home/ellis/Desktop/RealEstate
area:
  - "[[02 Areas/Project Maintenance|Project Maintenance]]"
resources:
  - "[[03 Resources/Repository Checklist|Repository Checklist]]"
created: 2026-07-12
updated: 2026-07-12
next_action: Rehearse and harden the safe local interview demo, then persist verified property coordinates.
tags:
  - project
  - project/realestate
  - gilbert-and-rose
  - digital-twin
  - career/interview
  - career/live-demo
aliases:
  - Property Digital Twin Platform
---

# RealEstate

Property digital-twin platform that turns property captures into web-based Gaussian-splat tours, with a Gilbert & Rose public website and operational property workspace.

> [!info] Interview and opportunity context
> This is also a self-directed live demonstration for a possible software-development opportunity. It is not confirmed employment or commissioned company work. Read [[01 Projects/RealEstate/Interview Demo Context|Interview Demo Context]] before preparing career claims or presenting the project.

> [!important] Repository identity
> The canonical repository is `/home/ellis/Desktop/RealEstate`. Do not confuse it with research notes, exported assets, or similarly named folders.

## Quick context

- [[01 Projects/RealEstate/Project Context|Project Context]] — product, repository boundaries, and current state.
- [[01 Projects/RealEstate/Frontend Context|Frontend Context]] — public website, map, assets, accessibility, and visual decisions.
- [[01 Projects/RealEstate/Architecture|Architecture]] — application and package boundaries.
- [[01 Projects/RealEstate/Runbook|Runbook]] — reliable local startup and validation commands.
- [[01 Projects/RealEstate/Decisions|Decisions]] — durable implementation decisions and reasons.
- [[01 Projects/RealEstate/Current Status|Current Status]] — completed work, limitations, and next tasks.
- [[01 Projects/RealEstate/Context Map|Context Map]] — smallest-context routing for future work.
- [[01 Projects/RealEstate/Interview Demo Context|Interview Demo Context]] — safe opportunity framing, evidence boundaries, demo route, and cross-project connections.

## Related research and specifications

- [[01 Projects/Gilbert and Rose Website Research/Gilbert and Rose Website Research|Gilbert and Rose Website Research]]
- [[01 Projects/Gilbert and Rose Website Research/RealEstate - Gilbert and Rose Page-by-Page Design Specification|Page-by-Page Design Specification]]
- [[01 Projects/Gilbert and Rose Website Research/RealEstate - Customer Account and Dashboard Plan|Customer Account and Dashboard Plan]]
- [[01 Projects/Gilbert and Rose Website Research/RealEstate - 3D Property Upload and Publication Plan|3D Upload and Publication Plan]]

## AI memory

- **Purpose:** publish property information and immersive tours while supporting capture, reconstruction, editing, and customer journeys.
- **Current state:** public Gilbert & Rose site, property map, property details, customer authentication, agent workspace, uploads, tours, and simulated/real reconstruction foundations are implemented.
- **Frontend direction:** mobile-first, visually polished, accessible, restrained Gilbert & Rose charcoal/yellow branding.
- **Canonical source of truth:** repository code and `AGENTS.md`; use these vault notes as routing and durable decision memory.
- **Validation:** `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- **Career purpose:** demonstrate software-development thinking in a possible-employer conversation while clearly identifying the work as an AI-assisted local prototype.

## Current focus

- [ ] Rehearse the five-minute and technical demo routes in [[Interview Demo Context]].
- [ ] Add validated latitude/longitude fields through shared DTOs, validation, migration, API, and map.
- [ ] Add one reliable local startup command for Docker, database, API, and Vite.
- [ ] Resolve repository-wide Prettier drift without overwriting unrelated active work.

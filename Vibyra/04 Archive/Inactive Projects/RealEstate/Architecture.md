---
title: RealEstate Architecture
type: architecture
project: RealEstate
status: active
updated: 2026-07-12
tags:
  - project/realestate
  - architecture
---

# RealEstate — Architecture

```mermaid
flowchart LR
  Web[React web app] --> API[NestJS API]
  Desktop[Tauri processor] --> API
  Mobile[iOS capture app] --> API
  API --> DB[(PostgreSQL via Prisma)]
  API --> Redis[(Redis / BullMQ)]
  Redis --> Worker[Python reconstruction worker]
  Worker --> Storage[Verified model outputs]
  API --> Storage
  Web --> Viewer[Gaussian-splat viewer package]
```

## Application boundaries

| Area | Location | Responsibility |
|---|---|---|
| Web | `apps/web` | React routes, public site, agent/customer UI |
| API | `apps/api` | typed HTTP boundary, auth, orchestration, public APIs |
| Desktop | `apps/desktop` | Tauri UI and desktop OS command boundary |
| iOS | `apps/mobile-ios` | native capture |
| Reconstruction | `workers/reconstruction` | computer-vision and reconstruction execution |

## Shared packages

| Package | Responsibility |
|---|---|
| `packages/shared-types` | DTOs and enums |
| `packages/validation` | runtime validation schemas |
| `packages/database` | Prisma schema, migrations, database access |
| `packages/api-client` | typed API transport |
| `packages/ui` | reusable UI components |
| `packages/viewer` | viewer-specific rendering and state |
| `packages/config` | shared TypeScript/lint configuration |

## Boundary rules

- Web only reaches persisted data through the API client.
- API schedules reconstruction; it does not directly execute computer-vision tools.
- Reconstruction executables remain behind allowlisted adapter interfaces.
- Every schema change requires a new migration; applied migrations are immutable.
- Processing must persist progress/errors and must not report 100% before upload verification.

## Frontend data path

```mermaid
sequenceDiagram
  participant Page as React page
  participant Query as TanStack Query
  participant Client as API client
  participant API as NestJS API
  participant DB as PostgreSQL
  Page->>Query: request public properties
  Query->>Client: typed listPublicProperties
  Client->>API: GET /public/properties
  API->>DB: validated filtered query
  DB-->>API: published properties
  API-->>Client: typed DTO
  Client-->>Query: result/error
  Query-->>Page: loading/error/empty/success
```


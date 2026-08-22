---
title: RealEstate Runbook
type: runbook
project: RealEstate
status: active
updated: 2026-07-12
tags:
  - project/realestate
  - runbook
---

# RealEstate — Runbook

## Prerequisites

- Node.js 20+
- pnpm 9
- Docker Desktop
- PostgreSQL and Redis through `docker-compose.yml`
- Python 3.11+ for worker tasks

## Reliable local startup

From `/home/ellis/Desktop/RealEstate`:

```powershell
docker compose up -d
```

The current scripts do not automatically load the repository `.env` into the PowerShell process for Prisma/Node commands. Load it without printing secrets:

```powershell
$envLines = Get-Content .env
foreach ($line in $envLines) {
  if ($line -match '^([A-Z][A-Z0-9_]*)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1], $matches[2], 'Process')
  }
}
```

Then prepare data and build:

```powershell
pnpm db:migrate
pnpm --filter @pdt/database build
pnpm db:seed
pnpm --filter @pdt/api build
```

Start the API and web app in separate terminals:

```powershell
node apps/api/dist/src/main.js
```

```powershell
pnpm --filter @pdt/web dev
```

Expected endpoints:

- Web: `http://localhost:5173`
- Property map: `http://localhost:5173/properties`
- API: `http://localhost:4000`
- API health: `http://localhost:4000/health`
- Swagger: `http://localhost:4000/docs`

## Map loading diagnosis

If “Loading properties on the map” remains visible:

1. Check listeners:

```powershell
Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
  Where-Object LocalPort -in 4000,5173
```

2. Test the API directly:

```powershell
Invoke-RestMethod -Uri 'http://localhost:4000/public/properties?page=1&pageSize=100'
```

3. Check Docker:

```powershell
docker compose ps
```

4. If Docker is unavailable, start Docker Desktop, then repeat `docker compose up -d`.
5. If the database is empty or stale, load `.env`, migrate, build the database package, and seed.

> [!warning]
> Do not diagnose Leaflet or preload logic until the public-properties endpoint responds. The confirmed 2026-07-12 incident was caused by the API and database stack not running.

## Required checks

```powershell
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

Web-only checks:

```powershell
pnpm --filter @pdt/web test
pnpm --filter @pdt/web typecheck
pnpm --filter @pdt/web lint
pnpm --filter @pdt/web build
```

Integration/E2E checks require their services and browser dependencies.


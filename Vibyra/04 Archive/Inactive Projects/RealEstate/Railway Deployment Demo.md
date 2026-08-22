---
title: RealEstate Railway Deployment Demo
type: case-study
project: RealEstate
status: live
date: 2026-07-13
tags:
  - project/realestate
  - deployment/railway
  - demo
  - dns
aliases:
  - Railway Deployment Demo
---

# RealEstate Railway Deployment Demo

> [!success] Live result
> The full-stack property demo is publicly available at [ellisthreaderdemo.com](https://ellisthreaderdemo.com) and `www`, with valid HTTPS, PostgreSQL, Redis, persistent storage, health checks, migrations, and seed data.

## What made the deployment quick

- Used one Railway web service to serve the compiled React SPA and NestJS API on the same origin.
- Added a root `Dockerfile` and `railway.toml` with `/health` checks.
- Added Railway PostgreSQL and Redis services through the CLI.
- Mounted a persistent volume at `/app/storage`.
- Ran Prisma migrations and the idempotent demo seed during startup.
- Used explicit production environment validation and generated secrets without printing them.

## Problems caught and fixed

- Vite had no production web server, so NestJS was extended to serve the built React application.
- SPA deep links collided with API routes; HTML navigation is now handled before API route matching while JSON requests still reach the API.
- The public map was empty because verified seed listings were `DRAFT`; 14 factual demo listings were published.
- Railway health checks initially missed the fixed port; `PORT=4000` aligned routing and runtime health checks.
- Namecheap parking records were replaced with Railway routing and ownership-verification records.
- Railway certificates were revalidated for both the apex and `www` domains.
- HTTP now redirects to HTTPS, with one-year HSTS, MIME-sniffing protection, and a strict referrer policy.
- Redundant PNG source copies were excluded from Railway snapshots after large uploads caused failures.

## Verification

- Railway deployment status: `SUCCESS`.
- Both custom domains return HTTP `200` over TLS 1.3.
- Plain HTTP returns `301` to HTTPS.
- API health: `ok`; database connected.
- Public API returns 14 listings.
- Live Playwright public-site suite: 5/5 passed.
- API lint, strict typecheck, tests, production build, and local Docker build passed.

> [!warning] Known limitations
> Reconstruction uses the simulated demo worker until a real GPU worker is deployed. Repository-wide Prettier checking also reports substantial pre-existing formatting drift, and the viewer bundles remain large.

## Reusable Railway checklist

1. Read the architecture and environment validation first.
2. Build and test a production container locally.
3. Create Railway web, PostgreSQL, and Redis services.
4. Use Railway reference variables for database and Redis URLs.
5. Generate secrets locally and avoid logging their values.
6. Mount persistent storage before the first real upload.
7. Apply migrations and an idempotent seed on startup.
8. Set and verify the Railway `PORT` contract.
9. Test the Railway hostname before attaching custom DNS.
10. Replace registrar parking records and add Railway verification records.
11. Verify ownership, certificates, HTTP redirects, HSTS, API health, deep links, and browser journeys on the real domain.

## Related notes

- [[RealEstate]]
- [[Current Status]]
- [[Runbook]]
- [[Architecture]]
- [[Interview Demo Context]]


---
title: RealEstate Current Status
type: status
project: RealEstate
status: active
updated: 2026-07-13
tags:
  - project/realestate
  - status
---

# RealEstate — Current Status

> [!success] Deployment status
> The interview/live-demo project is deployed on Railway at [ellisthreaderdemo.com](https://ellisthreaderdemo.com). This confirms the demo deployment only; no employment, commission, endorsement, or private integration is implied.

See [[Railway Deployment Demo]] for the deployment architecture, fixes, verification, and reusable checklist.

## Completed frontend work

- [x] Gilbert & Rose public site shell and marketing routes.
- [x] Mobile navigation and accessible public layout.
- [x] Property search rendered as a full-surface Leaflet map.
- [x] Compact price markers and on-select property cards.
- [x] Honest missing-coordinate state.
- [x] Verified Gilbert & Rose office marker with directions.
- [x] Professional transparent estate-agent sign marker asset.
- [x] Public property details and demo gallery.
- [x] Customer registration/login/account states.
- [x] Immersive-tour links and edge-to-edge public tour.
- [x] Critical hero preload and background static-asset warming.
- [x] Compressed photographic asset alternatives.

## Validation snapshot

- Railway production deployment and health check: passed.
- Apex and `www` HTTPS certificates: valid.
- HTTP-to-HTTPS redirect and HSTS: verified.
- Live custom-domain Playwright suite: 5 passed.
- Public API: healthy database and 14 published listings.
- Focused map and asset tests: 6 passed.
- Web suite: 51 passed.
- API suite: 37 passed when PostgreSQL/Redis are available.
- Web lint: passed.
- Web typecheck: passed.
- Production web build: passed.
- Live Playwright verification: map, three property markers, office sign, and directions popup visible.

## Known limitations

- Temporary property coordinates are slug-based constants.
- API/database startup is manual and environment loading is easy to miss.
- Repository-wide format check reports extensive pre-existing drift.
- Main frontend and viewer chunks exceed Vite's 500 kB warning threshold.
- Static asset prefetch remains browser-discretionary on constrained connections.
- Office sign is a raster asset; retain the current transparent PNG unless a verified vector source is produced.

## Recommended next tasks

1. Rehearse and harden the safe demo route in [[Interview Demo Context]].
2. Add latitude/longitude to database schema, validation, DTOs, forms, API, and public responses.
3. Add a single Windows-friendly local startup script that loads `.env` safely and starts dependencies.
4. Split Leaflet/public-site and viewer dependencies into better production chunks.
5. Run screenshot-driven mobile/desktop visual QA for the public map and selected-property card.

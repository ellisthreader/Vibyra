---
title: RealEstate Decisions
type: decision-log
project: RealEstate
status: active
updated: 2026-07-12
tags:
  - project/realestate
  - decisions
---

# RealEstate — Decisions

## 2026-07-12 — Prioritise critical assets, warm the rest

**Decision:** preload the homepage hero, then prefetch other static marketing and demo images after window load.

**Reason:** loading every large asset at initial navigation competes with critical rendering and makes the first page slower. Two-stage loading gives the hero priority and warms subsequent routes without blocking interaction.

**Implementation:** `apps/web/index.html`, `apps/web/src/staticAssetWarmup.ts`, `apps/web/src/main.tsx`.

## 2026-07-12 — Use compressed photographic assets

**Decision:** use compressed JPEG alternatives for photographic PNGs and transparently map legacy demo `.png` paths to `.jpg`.

**Reason:** the representative source set was approximately 25.2 MB; compressed copies were approximately 2.46 MB. Keep original assets for backwards compatibility while serving smaller copies in current UI paths.

## 2026-07-12 — Never fabricate property locations

**Decision:** only render a property marker when a known coordinate exists; otherwise display the coordinate-unavailable state.

**Reason:** map placement is factual property information. A plausible but invented marker would mislead customers.

**Next:** replace slug-based demo coordinates with validated database fields.

## 2026-07-12 — Use a branded estate-agent sign for the office

**Decision:** mark the verified Gilbert & Rose office with a transparent outside-house “For Sale” sign rather than a generic pin or logo label.

**Reason:** the sign is recognisable, professional, brand-aligned, and visually distinct from property price markers.

**Details:** keep the marker at `51.548734629561395, 0.6501372608965056`, anchor at the bottom of the post, preserve keyboard access, and retain the directions popup.

## 2026-07-12 — Treat map loading as a service-chain diagnosis

**Decision:** verify Vite, API, database, and endpoint response before changing map UI code.

**Reason:** the observed stuck loading state was caused by no API on port 4000, not Leaflet or image loading.


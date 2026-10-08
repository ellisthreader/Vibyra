---
title: RealEstate Frontend Context
type: implementation-context
project: RealEstate
status: active
updated: 2026-07-12
tags:
  - ai/context
  - project/realestate
  - frontend
  - ui
---

# RealEstate — Frontend Context

## Direction

The frontend is a polished Gilbert & Rose public property experience layered onto the digital-twin platform. Keep it professional, legible, mobile-first, keyboard accessible, and visually restrained. The strongest current work is the public-site visual system, property map, property detail experience, and immersive-tour entry points.

## Main frontend locations

- App routes: `apps/web/src/App.tsx`
- Global entry: `apps/web/src/main.tsx`
- Public pages: `apps/web/src/pages/public/`
- Public components: `apps/web/src/components/public/`
- Public content/data: `apps/web/src/data/`
- Global styling: `apps/web/src/styles.css`
- Static assets: `apps/web/public/`
- Browser tests: `apps/web/e2e/`

## Public website

Implemented routes include homepage, sales, sellers, tenants, landlords, new homes, commercial, business transfer, care homes, property search/map, property details, team, locations, contact, valuation, authentication, legal pages, sitemap, customer account, agent dashboard, tour editor, and public tour.

The visual identity uses Gilbert & Rose charcoal, yellow, white, editorial property photography, strong headings, restrained cards, and clear calls to action. Maintain reduced-motion support and keyboard navigation.

## Asset-loading work completed

- Critical homepage hero is preloaded in `apps/web/index.html`.
- `staticAssetWarmup.ts` prefetches non-critical marketing and demo-property images after window load.
- Large photographic PNGs received compressed JPEG alternatives.
- Legacy `/property-demo/*.png` URLs transparently resolve to `.jpg` in `apps/web/src/api.ts`.
- Representative large-image payload fell from approximately 25.2 MB to 2.46 MB, around a 90% reduction.
- Keep critical assets high priority; warm remaining assets after load so initial rendering is not connection-blocked.

## Property map

Primary implementation: `apps/web/src/components/public/PropertyMap.tsx`.

- Leaflet with CARTO Voyager raster tiles.
- Property markers show compact formatted prices and open a compact property card.
- Temporary demo coordinates are keyed by property slug. These are explicitly transitional and must not be expanded as a production location model.
- Properties without verified coordinates are not placed at fabricated locations.
- The Gilbert & Rose office is marked at:
  - Address: `1333 London Road, Leigh-on-Sea, SS9 2AD`
  - Latitude: `51.548734629561395`
  - Longitude: `0.6501372608965056`
- Office marker uses the transparent estate-agent sign asset at `apps/web/public/brand/map/office-sign.png`.
- The sign is anchored at the bottom of its post so the location point remains accurate.
- Clicking the sign opens an address popup with a Google Maps directions link.
- Accessible marker title remains present even though the visible design has no text label surrounding it.

## Generated office sign asset

The supplied Gilbert & Rose logo reference was transformed with the built-in image-generation workflow into a professional British estate-agent “For Sale” sign. A chroma-key source was converted locally to transparent PNG; the intermediate green source was removed. The final asset is project-bound and preloaded.

> [!warning] Brand fidelity
> Do not regenerate or overwrite `office-sign.png` casually. Preserve the current charcoal post, yellow logo board, transparent background, compact silhouette, and exact map anchoring unless the user explicitly requests a redesign.

## Loading and error states

- Public property map uses TanStack Query and shows loading, API error, empty, coordinate-unavailable, and success states.
- A stuck loading indicator may be an unavailable API, not an asset or Leaflet failure.
- Do not make the 3D viewer the only route to property information.
- Do not block the full page while a model loads.

## Current frontend checks

- Web unit suite most recently passed with 51 tests.
- Focused map/preload suite passed with 6 tests.
- Web lint, typecheck, and production build passed.
- Production build reports existing large-chunk warnings for the main bundle and viewer bundle.
- Repository-wide format check currently reports more than one hundred pre-existing formatting issues outside the recent focused files.


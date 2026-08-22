---
title: HKE Desktop Startup Port Collision - 2026-07-15
date: 2026-07-15
tags:
  - hke
  - incident
  - electron
  - startup
status: resolved
---

# HKE Desktop Startup Port Collision - 2026-07-15

## What happened

Opening the desktop **Hong Kong Express** shortcut displayed the Zoom CX Interview Studio inside the HKE Electron window.

## Exact user-facing path

- Shortcut: `C:\Users\Ellis\Desktop\Hong Kong Express.lnk`
- Shortcut target: `/home/ellis/Desktop/HKE/node_modules/electron/dist/electron.exe`
- Arguments: `"/home/ellis/Desktop/HKE"`
- Working directory: `/home/ellis/Desktop/HKE`

## Root cause

ZoomCX already owned `127.0.0.1:8787` and its API owned `127.0.0.1:8788`. Electron treated any HTTP response on the configured HKE port as a valid Laravel instance, so it reused the foreign server and loaded ZoomCX. A separate project also owned Vite port `5173`, exposing the same weakness in development startup.

## Misleading checks and wrong leads

- The shortcut target and working directory were correct.
- The Electron process and HKE application title were correct.
- A successful HTTP response on port 8787 did **not** prove that the responder was HKE.

> [!important] Required lesson
> Reproduce the exact user action and exact entry point first. Backend health, route status, or a different launcher does not prove the user-facing path works.

## Fix applied

- Added `public/hke-desktop-identity.txt` with a fixed HKE identity marker.
- Electron now reuses a backend only when that marker matches exactly.
- If the preferred backend port belongs to another application, HKE finds a free local fallback port instead of loading or terminating the foreign app.
- Development Vite reuse now requires the HKE `resources/js/app.tsx` entry point as well as the Vite client.
- A foreign Vite listener causes HKE to select a free Vite port.
- Port availability uses a TCP connection probe so IPv6 wildcard listeners are detected on Windows, and Vite starts with `--strictPort` to prevent silent port drift.

## Regression guard

`scripts/check-checkout-regressions.mjs` now asserts that Electron contains backend identity verification and backend/Vite fallback-port selection. This check runs through `npm run check:checkout-regressions` and as part of the production build.

## Verification

- `node --check electron/main.cjs` — passed.
- `npm run check:checkout-regressions` — passed.
- Probed `http://127.0.0.1:8787/hke-desktop-identity.txt` — returned ZoomCX HTML, correctly rejected as foreign.
- Launched the exact `Hong Kong Express.lnk` desktop shortcut.
- ZoomCX remained running on ports 8787 and 8788.
- HKE started its own PHP backend on fallback port 8789.
- The visible Electron window title was `Hong Kong Express`.
- `npm run electron:dev` was tested while ports 5173–5175 and 8787–8789 were occupied. HKE selected Vite 5176 with `--strictPort` and backend 8790; both served the expected HKE content.
- After the development test was closed, the desktop-shortcut instance remained running on 8789. Its `/desktop` route resolved to the HKE login page, contained HKE branding, and contained no ZoomCX content.

## Prevention checklist

- Resolve and inspect the exact shortcut or pinned item the user clicks.
- Never treat a generic successful HTTP response as application identity.
- Never stop a listener unless its command line belongs to the HKE workspace.
- Verify both backend and Vite identity before reuse.
- Test startup while preferred ports are intentionally occupied by a foreign application.
- Keep the identity/fallback assertions passing in the regression suite.

Related: [[Hong Kong Express]] · [[HKE Checkout Incident - 2026-07-03]]

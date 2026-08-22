---
title: HKE Checkout Incident - 2026-07-03
date: 2026-07-03
tags:
  - hke
  - incident
  - checkout
  - prevention
status: fixed
---

# HKE Checkout Incident - 2026-07-03

## What happened

Checkout appeared broken for two reasons:

1. The header cart `Checkout` button only closed the basket overlay. It did not navigate to `/checkout`.
2. Electron dev startup used nested `npm` spawning on Windows. That failed with `spawn EINVAL` and could leave `public/hot` pointing to `127.0.0.1:5173` when Vite was not running, causing pages to wait on missing dev assets.

## Why it took too long

The first debugging pass checked Laravel routes, server response times, and order POST behavior before testing the exact user interaction path. Those checks proved the backend worked, but they did not catch the broken cart button.

Process state also became noisy because manual PHP/Vite/Electron services were started while debugging. Stale listeners and `public/hot` made it harder to separate app bugs from dev-server state.

## Fix applied

- `resources/js/Layouts/Navbar.tsx`: cart `Checkout` now calls `goToCheckout`, closes the cart, and navigates with `router.visit(route('checkout'))`.
- `scripts/electron-dev.mjs`: launches Electron directly and passes `NODE_BINARY: process.execPath`.
- `electron/main.cjs`: starts Vite through `node node_modules/vite/bin/vite.js`, not nested `npm`.
- `scripts/check-checkout-regressions.mjs`: added a regression guard for these exact failures.
- `package.json`: `npm run build` now runs `npm run check:checkout-regressions` before TypeScript and Vite build.

## Prevention checklist

- [ ] For UI failures, reproduce the exact click path first.
- [ ] Confirm every visible checkout button navigates or submits as expected.
- [ ] Before debugging dev-server behavior, kill stale listeners and remove stale `public/hot`.
- [ ] Do not use nested `npm` spawns inside Electron startup on Windows.
- [ ] Keep `npm run check:checkout-regressions` in the build path.

> [!important]
> A backend route returning 200 does not prove checkout works. The actual UI button path must be tested.

## Verification

- `npm run check:checkout-regressions` passes.
- `npm run build` passes.
- `/checkout` loads on the website and Electron local server.
- A test checkout POST returned `200`; the test order was deleted afterward.

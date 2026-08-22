---
title: HKE Saved Addresses Google Map False Failure - 2026-07-16
date: 2026-07-16
tags:
  - hke
  - incident
  - google-maps
  - profile
status: resolved
---

# HKE Saved Addresses Google Map False Failure - 2026-07-16

## What happened

The Saved Addresses page displayed “Google map could not be loaded” even though the Google Maps JavaScript API and real map tiles had loaded successfully.

## Exact user-facing path

- HKE customer account → My Account → Saved addresses
- Route: `/profile/addresses`
- Desktop entry point: `/home/ellis/Desktop/HKE/launch-homegrounds.ps1`

## Root cause

`resources/js/Pages/Profile/Addresses.tsx` classified the map as ready only after Google’s `tilesloaded` event. In the Electron raster renderer, genuine Google tiles rendered but that event did not reliably reach the component. The UI therefore remained in `loading` and eventually showed the failure message despite a working map.

## Misleading checks and wrong leads

- The API key, billing, network connection, and saved coordinates were not the failure.
- The Google Maps script returned HTTP 200.
- Maps modules, viewport RPC, and real tile requests returned HTTP 200.
- The page contained `.gm-style` and loaded Google tile images while React still reported `data-map-status="loading"`.
- Replacing the preview or asking the user to edit/reselect the address could not correct an event-lifecycle bug.

> [!important] Required lesson
> Reproduce the exact user action and exact entry point first. Backend health, route status, or a different launcher does not prove the user-facing path works.

## Fix applied

- Treat either Google `idle` or `tilesloaded` as a successful render.
- Also observe the existing Google map DOM locally and mark the map ready when a genuine `.gm-style` tile image is complete with a non-zero natural width.
- Show unavailable only if neither Google events nor genuine loaded tiles appear within ten seconds.
- Remove listeners and the local interval during cleanup.

The DOM check does not make a Google API request and therefore does not increase API usage.

## Regression guard

The component exposes `data-map-status`, allowing a clean Electron verification to assert that a real Google map progresses to `ready`. The Google loader reuses a single in-flight script promise, clears rejected loader state, and exposes an explicit in-modal retry.

## Verification

- `npm run check:checkout-regressions` — passed.
- `npx vite build` — passed.
- `php artisan test tests/Feature/Account/AddressTest.php` — 7 tests passed, 24 assertions.
- Clean Electron session logged into `customer@hke.com` and opened `/profile/addresses`.
- Result: `data-map-status="ready"`, `window.google.maps` present, `.gm-style` present, and a genuine loaded tile detected.
- Google network result: 11 responses with HTTP 200, zero HTTP failures, and zero console errors.
- Restarted the HKE Electron desktop through `launch-homegrounds.ps1`.

## Prevention checklist

- Verify the rendered map DOM and tile completion, not only one vendor event.
- Keep map readiness independent from geocoding or autocomplete requests.
- Do not add a fake map fallback that can conceal API failures.
- Do not tell users to edit valid address coordinates until the actual Google requests and renderer state have been inspected.
- Confirm the exact desktop entry point uses the newly built bundle.

## Follow-up correction: address text without coordinates

### What happened

A second saved-address failure appeared for `amanda@hke.com`. The Address panel showed complete postal text, but the map either displayed the failure state or opened over the ocean instead of the saved location.

### Root cause

- The Address panel used `line1`, `line2`, `city`, `postcode`, and `country`.
- The map used separate `latitude` and `longitude` columns as a hard prerequisite.
- Amanda's three seeded addresses had valid postal text but `null` coordinates.
- `validCoordinates()` converted `null` through `Number(null)`, producing `0`. The component therefore accepted `0,0` as a valid location and centered the map in the ocean.
- Google Maps JavaScript loaded correctly, but the Google geocoding service returned `REQUEST_DENIED` because that API is not activated for the project.

This means the earlier statement that saved coordinates were not involved applied only to the first reproduced customer account, whose rows already contained coordinates. It was not valid for all saved-address records.

### Fix applied

- The map query now comes from the same canonical postal fields shown under Address: street line 1, city, postcode, and country.
- `null` latitude or longitude is rejected before numeric conversion.
- Stored coordinates remain an optional fast path, not a requirement.
- When coordinates are missing, the already-configured Geoapify address service resolves the postal address; Google Maps then renders those coordinates.
- The map component remounts when the selected saved address changes, preventing stale state from the previous address.
- Secondary line text remains visible but is excluded from geocoding because values such as "Above the blue door" are delivery guidance rather than reliable postal location data.
- Failure copy now distinguishes a missing/invalid address from Google Maps configuration or tile-loading failures.

### Regression guard and verification

- `npx tsc --noEmit` passed.
- `php artisan test tests/Feature/Account/AddressTest.php` passed: 7 tests, 24 assertions.
- `npm run build` passed, including checkout and language regression checks.
- Exact route verified in a clean Electron session: `/profile/addresses`.
- Exact failing account verified: `amanda@hke.com`, whose selected Home row has `null` stored coordinates.
- Home resolved to Moulsham Street with `data-map-status="ready"`, `.gm-style` present, and 12 loaded Google tiles.
- Switching to Restaurant also produced a ready Google map at the second saved postal address.
- Home was restored as Amanda's primary address after verification.
- Desktop and mobile visual verification reported no horizontal overflow, broken images, offscreen controls, console errors, or blank renders.
- Screenshots: `/home/ellis/Desktop/HKE/.visual-verify/address-map-from-address-fix/profile-addresses-final.png` and `profile-addresses-restaurant.png`.

### Prevention checklist

- Treat database coordinates as cached derived data, not the source of truth for a saved postal address.
- Check nullable values before numeric coercion; `Number(null) === 0`.
- Reproduce with a record that actually has missing coordinates instead of assuming seeded accounts share the same shape.
- Verify that each required Google API service is enabled separately; a working Maps JavaScript API does not prove Google geocoding is enabled.
- Use the visible canonical postal fields to resolve a map and exclude instruction-like secondary text when it reduces geocoding accuracy.
- Reproduce the exact user action and exact entry point first. Backend health, route status, or a different launcher does not prove the user-facing path works.

Related: [[Hong Kong Express]] · [[HKE Desktop Startup Port Collision - 2026-07-15]]

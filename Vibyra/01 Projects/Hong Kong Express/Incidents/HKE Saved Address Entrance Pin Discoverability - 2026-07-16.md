---
title: HKE Saved Address Entrance Pin Discoverability - 2026-07-16
date: 2026-07-16
tags:
  - hke
  - incident
  - saved-addresses
  - google-maps
status: resolved
---

# HKE Saved Address Entrance Pin Discoverability - 2026-07-16

## What happened

On `/profile/addresses`, opening an existing address through the visible **Edit** button did not present an obvious, dependable way to move the delivery entrance pin. The original edit dialog was narrow and vertically dense, the map was buried among form fields, and its loading treatment obscured the interaction surface.

## Exact user-facing path

- HKE customer account -> My Account -> Saved addresses
- Route: `/profile/addresses`
- Action: select an existing saved address -> **Edit**

## Root cause

- The edit form used a long single-column layout, so the entrance step was easy to miss.
- Movement depended on users inferring that the map itself was draggable.
- A loading veil visually covered most of the map while Google Maps initialized.
- There was no explicit fine-tune fallback for users who could not comfortably drag the map.
- The screenshot verifier could wait indefinitely for third-party image/font loading, and Electron offscreen capture could freeze once a live Google map rendered.

## Misleading checks and wrong leads

- Coordinate migrations, persistence tests, HTTP 200 responses, and a successful production build proved the data path but did not prove that a customer could find and operate the pin control.
- A screenshot taken immediately after clicking **Edit** showed a loading transition, not the settled usable state.
- Verifying the selected-address preview was not equivalent to verifying the Edit Address modal.

> [!important] Required lesson
> Reproduce the exact user action and exact entry point first. Backend health, route status, or a different launcher does not prove the user-facing path works.

## Fix applied

- Redesigned Edit Address as a wide two-column desktop workspace with three numbered steps.
- Kept the postal fields and driver guidance separate from a sticky entrance-map panel.
- Reordered mobile content to Address, Entrance pin, then Driver details.
- Added a fixed internal footer so **Cancel** and **Save address** remain reachable.
- Added direct drag guidance, a fixed centre entrance marker, and four accessible arrow controls for fine movement.
- Removed the full blocking map veil; loading is now communicated by a small status pill.
- Kept latitude and longitude coupled to the saved address and prevented submission while movement is settling.
- Added bounded URL, font, and image waits to the visual verifier.

## Regression guard and verification

- `npm run check:address-pin-regressions` passed and now asserts drag guidance, arrow controls, `panBy`, the wide modal, and the footer form binding.
- `npx tsc --noEmit` passed.
- `php artisan test --filter="AddressTest|CustomerOrderTest"` passed: 25 tests, 169 assertions.
- `npm run build` passed.
- Exact Chrome path verified using `customer@hke.com`: **Edit** opened the dialog, **Move pin left** was enabled, the movement executed, and the component returned to **Entrance pin ready to save**.
- Desktop and mobile captures confirmed the real Google map, entrance marker, arrow controls, and reachable Save action.

## Prevention checklist

- Test the exact Edit button and saved-address record the customer uses.
- Require both direct map dragging and visible accessible movement controls.
- Inspect settled desktop and mobile screenshots, not only automated PASS text.
- Keep Save reachable while the modal body scrolls.
- Assert the coordinate pair at request validation, persistence, checkout snapshot, dispatch payload, and driver consumption boundaries.
- Put time bounds around third-party map, image, font, and screenshot readiness checks.

Related: [[Hong Kong Express]] | [[HKE Saved Addresses Google Map False Failure - 2026-07-16]]

## Follow-up: map-first simplification and loader recovery

### What happened

The wide three-step Edit Address workspace still felt fragmented, and a transient Google Maps initialization failure could leave the entrance map unavailable for every later modal opening in the same page session.

### Root cause

- The UI presented address, driver, and map content as three competing boxed steps rather than one clear save flow.
- `loadGoogleMapsScript()` cached its shared promise. Auth failure reset it, but a later readiness rejection did not. The rejected promise was reused on every subsequent attempt, so closing and reopening the modal could not recover.
- The unavailable state had no direct retry action.
- A generic error message made a transient loader-state failure look like missing billing or a disabled Maps JavaScript API.

The configured key, billing-backed Maps JavaScript API, and the `http://127.0.0.1:8000` referrer were verified successfully. A clean browser loaded `importLibrary('maps')`, the Map constructor, real tiles, and the Edit modal with zero console errors.

### Fix applied

- Replaced the wide two-column, three-box workspace with a narrower single-column modal.
- Put the live entrance map first, followed by address fields and driver notes separated by simple dividers.
- Kept the fixed centre pin, direct dragging, Reset pin, and accessible arrow nudges.
- Added **Retry map** and **Try again** recovery actions.
- Reset the shared Maps loader promise after any readiness rejection, remove an unusable script/stub, and allow a fresh initialization attempt.
- Updated the address-pin regression guard to require the map-first layout and recovery action.

### Verification

- `npm run check:address-pin-regressions` passed.
- `npx tsc --noEmit` passed.
- `npm run build` passed, including checkout, address-pin, and language regression checks.
- Exact customer path `/profile/addresses` -> **Edit** loaded the real map and fixed entrance pin.
- **Move pin right** was enabled; after activation the component returned to **Entrance pin ready to save**.
- Desktop 1440x900 and mobile 390x844 captures showed map-first ordering and zero horizontal overflow.
- Screenshots: `/home/ellis/Desktop/HKE/.visual-verify/address-modal-after/address-modal-desktop.png` and `address-modal-mobile.png`.

### Prevention checklist

- Clear cached loader state after every rejected initialization path, not only explicit key rejection.
- Provide an in-context retry for recoverable third-party UI failures.
- Test the exact saved-address Edit action and then operate a pin control; a rendered preview alone is insufficient.
- Keep the entrance map first and preserve one vertical reading order on desktop and mobile.
- Reproduce the exact user action and exact entry point first. Backend health, route status, or a different launcher does not prove the user-facing path works.

---
title: RelayClarity Login Password Hit Area Incident - 2026-07-10
date: 2026-07-10
tags:
  - relayclarity
  - incident
  - login
  - touch
  - accessibility
  - prevention
status: fixed
project: "[[RelayClarity]]"
---

# RelayClarity Login Password Hit Area Incident - 2026-07-10

## What happened

On `/login`, tapping or clicking near the password box could sometimes activate **Forgot password?** and replace the login form with the password-reset form.

## Exact user-facing path

1. Open `/login` in a desktop or mobile browser.
2. Tap the password field, especially near its upper edge or nearby controls.
3. The page could switch to **Reset password** instead of focusing the password input.

## Root cause

The password field was implemented as one wrapping `<label>` containing two other interactive buttons: **Forgot password?** and the password visibility control. Interactive elements nested inside a label create ambiguous browser label activation and touch hit-testing. The surrounding field shell also did not explicitly focus the password input when its padding or leading icon was tapped.

## Misleading checks and wrong leads

- The password-reset route and backend could both be healthy while the login touch path remained broken.
- Clicking the centre of the input with a mouse did not cover finger taps near the field boundary.
- A layout screenshot alone could not prove that the hit targets behaved correctly.

## Fix applied

- Replaced the wrapping password `<label>` with a non-label field group.
- Connected a dedicated `<label for="auth-password">` only to the input.
- Kept **Forgot password?** as an independent 44px touch target.
- Made the visibility control an independent 44px button with working show/hide state and `aria-pressed`.
- Made taps on non-button parts of the password field shell focus `#auth-password`.

## Regression guard added

`server/auth-hit-target-regression.test.tsx` fails if the password actions are nested inside the field label again or if the reveal control loses its accessible state and behavior. It is included in the main `npm test` command.

> [!important] Required diagnostic rule
> Reproduce the exact user action and exact entry point first. Route or backend health does not prove that the user-facing touch path works.

## Verification commands and results

- `npm test` — all 23 tests passed, including the 2 new auth hit-target regression tests.
- Browser touch-boundary check on `/login` — upper-edge and centre taps stayed on **Welcome back**; the password input received focus; the visibility control changed the input type and did not navigate.
- Browser QA at 500px found no horizontal overflow, broken images, blank render, or runtime exception. The only console noise was the existing missing `/favicon.ico` request.
- Desktop screenshot at 1440×1000: `screenshots/auth-password-hitarea-fixed-desktop.png`.
- Mobile screenshot at 500×1500: `screenshots/auth-password-hitarea-fixed-mobile-500.png`.
- `npm run typecheck` and `npm run build` remain blocked by an unrelated existing `AppView`/`privacy` type error at `src/main.tsx:6274`.

## Prevention checklist

- [ ] Never nest buttons, links, or other interactive controls inside a form-field `<label>`.
- [ ] Give touch actions a minimum 44×44px hit target.
- [ ] Test the centre and all boundary areas of fields on desktop and mobile.
- [ ] Confirm the active input and current screen after every boundary tap.
- [ ] Test reveal, reset, submit, and keyboard navigation as independent controls.
- [ ] Keep the auth hit-target regression test in the main test suite.

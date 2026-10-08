---
title: Profile security and language state must share the live account context
date: 2026-07-16
tags:
  - project/hong-kong-express
  - incident/ui
  - incident/i18n
  - lesson/security
status: resolved
---

# Profile security and language state must share the live account context

> [!success] Resolved
> The separate customer security page was retired. Password and two-factor controls now live on the main profile page, and language changes use the current authenticated user state across Inertia navigation.

## Symptoms

- Security and privacy controls were split between the profile and a standalone page.
- The profile page linked away for password and two-factor changes.
- Language could appear changed on one page but revert or fail to apply after login or Inertia navigation.
- Several offered language catalogues were partial or contained malformed text.

## Root Cause

- `LanguageProvider` was mounted with authentication persistence derived from the initial page payload. That value became stale after login or later user-state updates.
- DOM translations were applied once and were not reliably reapplied after Inertia page replacement.
- The catalogue exposed more languages than the application could support consistently.
- Security UI duplicated an account concern that already belonged on the profile overview.

## Fix

- Read the live authenticated user from `UserContext` inside `LanguageProvider`.
- Synchronize `language_preference`, local storage, document language/direction, and translation reapplication after each Inertia success event.
- Limit the selector to clean, supported catalogues: English (UK), Traditional Chinese, Spanish, French, and German.
- Add a migration that normalizes obsolete language preferences to `en-GB`.
- Add a build-time language regression script for encoding, core phrases, authenticated preference synchronization, and navigation reapplication.
- Move working password and two-factor forms into `Profile/Overview.tsx`.
- Redirect the legacy `/profile/security` URL to `/profile#security` and remove its page renderer and navigation entries.

## Prevention

> [!important]
> Providers that persist account preferences must derive authentication and preference state from the live shared user context, not only from the first Inertia payload.

- Do not advertise a locale until its customer-facing core catalogue is valid UTF-8 and reviewed.
- Verify language changes on at least two different routes after an Inertia navigation.
- Keep account security controls on one canonical profile surface.
- Include closed, expanded, validation, enabled/disabled, desktop, and mobile states in profile visual QA.

## Verification Commands

```powershell
php artisan test tests/Feature/ProfileTest.php tests/Feature/Account/SecurityPageTest.php tests/Feature/Account/TwoFactorTest.php tests/Feature/Auth/PasswordUpdateTest.php tests/Feature/Account/PaymentMethodTest.php
npm run build
npm run verify:visual -- "/profile#security" --login=amanda@hke.com:password
npm run verify:visual -- "/profile#security" --login=amanda@hke.com:password "--click-text=Two-factor authentication"
npm run verify:visual -- "/profile#security" --login=amanda@hke.com:password "--click-text=Change password"
npm run verify:visual -- /menu --login=amanda@hke.com:password
git diff --check
```

## Result

- 33 focused feature tests passed with 124 assertions.
- Production TypeScript/Vite build passed.
- Desktop and mobile visual checks passed without overflow, broken images, off-screen controls, console errors, or blank renders.

## Follow-up: enabled status remained disabled

The backend enabled flag and login challenge worked independently, but the profile status label could continue displaying `Disabled` immediately after a successful enable request because the rendered row relied only on the incoming Inertia prop.

### Follow-up fix

- Keep a local confirmed `isTwoFactorEnabled` state synchronized with the server prop.
- Update that state only after the enable or disable request succeeds.
- Remove the nested rounded security card and use two plain divided action rows.
- Add a regression that performs the exact sequence: enable 2FA, reload profile and assert the enabled prop, log out, log in again, remain a guest, receive the email, and redirect to the challenge.
- Extend the visual verifier with `--two-factor=enabled` so enabled profile screenshots can be captured through the real authenticated endpoint.

### Misleading check

Testing the enable endpoint and login challenge separately did not prove the exact profile-to-next-login user journey or the immediate visual status.

> [!important] Exact-path lesson
> Reproduce the exact user action and exact entry point first. Backend health, route status, or a different launcher does not prove the user-facing path works.

### Follow-up verification

```powershell
php artisan test tests/Feature/Account/TwoFactorTest.php tests/Feature/Auth/PasswordUpdateTest.php tests/Feature/ProfileTest.php
npm run build
npm run verify:visual -- "/profile#security" --login=amanda@hke.com:password --two-factor=enabled
```

- 28 focused tests passed with 128 assertions.
- Enabled and disabled compact profile states passed at 1440×900 and 390×844.

Related project: [[Hong Kong Express]]

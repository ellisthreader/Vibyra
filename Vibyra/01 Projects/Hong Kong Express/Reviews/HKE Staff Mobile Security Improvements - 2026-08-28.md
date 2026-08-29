---
title: HKE Staff Mobile Security Improvements - 2026-08-28
date: 2026-08-28
updated: 2026-08-28
type: review
status: complete
project: "[[01 Projects/Hong Kong Express/Hong Kong Express|Hong Kong Express]]"
tags:
  - hke
  - mobile
  - staff
  - security
---

# HKE Staff Mobile Security Improvements - 2026-08-28

## Summary

- Fixed phone verification when a customer genuinely changes their phone number.
- Kept phone verification when the submitted number only uses different formatting.
- Fixed the staff-benefit refund regression caused by formatting-only phone changes.
- Updated the vulnerable UUID dependency to `uuid@11.1.1`.
- Fixed the Live Activity TypeScript test error.
- Blocked screenshots and screen recording throughout native staff routes.
- Kept screen-capture protection as a safe no-op on web.
- Added encrypted, queued security emails for escalating lockouts, PIN recovery, administrator PIN resets, and staff-access revocation.
- Kept PINs, recovery codes, tokens, IP addresses, device details, administrator details, and internal reasons out of security emails.
- Added a two-minute inactivity re-lock for the staff dashboard.
- Cleared the memory-only staff dashboard token and staff query cache when inactivity locking occurs.
- Kept active delivery location sharing running separately while the dashboard is locked.
- Preserved full location cleanup for normal sign-out, access expiry, route exit, or revocation.
- Preserved the existing staff PIN keypad and dashboard design.

## Main implementation locations

- `app/Services/Account/CheckoutCustomerDataService.php`
- `app/Services/Account/PhoneVerificationService.php`
- `app/Services/Staff/StaffMobileAccessService.php`
- `app/Notifications/StaffSecurityAlertNotification.php`
- `mobile/src/features/staff/staff-screen-capture-protection.tsx`
- `mobile/src/features/staff/staff-privacy-cover.tsx`
- `mobile/src/services/staff-session.ts`
- `mobile/src/providers/app-providers.tsx`
- `mobile/src/features/live-activity/use-order-live-activity.test.ts`
- `mobile/package.json`
- `mobile/package-lock.json`

## Validation

- Backend: 688 tests passed with 9,288 assertions.
- Mobile: 174 test suites passed with 941 tests.
- Full TypeScript checking passed.
- ESLint and Prettier passed.
- Composer dependency audit passed.
- Mobile dependency and image-parser security checks passed.
- Expo dependency validation passed.
- Expo Doctor passed all 18 checks.
- UUID dependency tree resolves to `uuid@11.1.1`.

## Remaining unrelated work

- The project-wide localization-content audit still reports stale or missing translations across the 29 non-English catalogues.
- The translations were not automatically replaced with English because that would reduce translation quality.

## References

- [UUID advisory GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)
- [Expo ScreenCapture documentation](https://docs.expo.dev/versions/v54.0.0/sdk/screen-capture/)


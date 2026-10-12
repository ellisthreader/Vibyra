# Owner dashboard frontend revamp

Implemented on 12 October 2026. The production website has not been deployed with this change.

## Result

The owner workspace now starts with registrations, download responses, website checkouts and current Pro accounts. Six primary destinations replace the long analytics pages: Overview, Users, Downloads, Memberships, Website and App usage. Tracking status remains a separate supporting destination. Memberships contains the license workflow; Website and App usage have focused subsections.

The redesign includes a neutral light interface, dark/system appearance, responsive navigation, smaller headings, readable account tables, an accessible account dialog, charts with exact values and a keyboard-controlled date selector, grouped license creation with a review step, and matching owner sign-in/verification styling. Missing data, empty data, current account state and selected-period activity are distinguished explicitly.

Backend controllers, reporting queries, routes, billing, authentication, license permissions, dependency versions and database schema are unchanged. Current Pro accounts do not establish paid subscriptions; website checkouts remain recorded website purchase events. Download responses do not establish installations. A universal individual-event feed, revenue reporting and global user search require additional backend capabilities and are outside this frontend change.

## Source provenance

Base: `origin/railway-production` at `48d32eb2`. All 383 files in the captured production frontend snapshot matched this branch byte for byte before implementation. Work is isolated on `codex/owner-dashboard-redesign-20261012`; existing edits in the main and website checkouts are preserved.

The source snapshot and comparison manifests are stored locally in `/Users/ellis/Desktop/Vibyra-owner-redesign-20261012/`. No production customer records, keys or credentials are used in the preview. Old owner components and styles that are no longer imported have been removed.

## Run and verify

From `backend/`:

```sh
npm ci --ignore-scripts
npm run check:owner
npm run build
npm run preview:owner
```

The preview binds only to `127.0.0.1:8137`. Open `http://127.0.0.1:8137/owner`. Its banner marks all data as synthetic; all account, verification and license responses are local fixtures. The `/review` page embeds the actual application at 390px and 768px widths. Preview files are not imported by the production entry point.

Use the scenario selector for empty, unavailable, sparse, stale, error, denied, verification, setup and uncertain-response cases. The `uncertain` scenario records a synthetic license but returns a failure on the first request; “Check same request” returns that license without creating another. Refreshing the preview resets its verification challenge. The login page is a presentation preview; no real credentials should be entered there.

## Validation completed

- Production Vite build: exit 0, 209 modules. The existing missing-at-build-time font URL notices and large benchmarks chunk warning remain; font URLs are retained for runtime resolution and the owner interface uses system font fallbacks.
- `check:owner`: exit 0. All 11 tests pass, including 55 report renders across normal, empty, unavailable, sparse and stale data. React rendering emits no warnings.
- Data tests cover missing versus zero values, plan counts, download coverage, sparse/single-point charts, integer axes, SQL/ISO UTC dates, guest classification, all license statuses, URL navigation and isolation between account identities.
- Source line gate: 43 files, maximum 189 lines, below the 200-line limit. `git diff --check` passes.
- Native Chrome and Safari review: all six destinations and Tracking status; all Website and App usage tabs; account details, Escape/focus return and pagination; light/dark layouts; 390px/768px responsive layout and phone navigation; owner login; synthetic verification and denied access; license review and recovery after an uncertain creation result.
- No real accounts or licenses were created, revoked or otherwise modified. Actual payment processing, provider login, authenticator enrollment and production authorization enforcement were not changed or re-exercised by this frontend validation.

The branch includes a GitHub Actions workflow for the source gate, tests and frontend build. Its result must be checked on the pushed commit; a local build is not independent release approval.

## Release and rollback

Review the diff and preview before release. Follow the repository's production security release gates, including independent approval and checks for the exact release commit. Recheck the live source for intervening deployments before applying this branch. No production deployment or permissions change is part of the preview workflow.

Build from the reviewed commit using the existing deployment process. Verify owner sign-in, all sections, 7/30/90-day reports, protected account/license challenges, and the public login/download routes after release. This change needs no migration. Rollback uses the previous production source and rebuilt frontend assets; it does not require changing data or access settings.

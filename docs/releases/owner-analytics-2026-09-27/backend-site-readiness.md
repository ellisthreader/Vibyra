# Backend and website analytics release readiness — 27 September 2026

This branch builds on the stacked analytics/model review head `0834f5a9`. It is a review candidate, not a live deployment. The production collector is still absent and historical website, Desktop, and iOS interaction events cannot be recovered.

## Source and contract

- `backend/routes/web.php` contains website session consent/intake, bearer-session Desktop/mobile consent/intake, protected owner routes, and local-loopback aggregate-only owner login. The three analytics migrations create events, consent/history, and daily rollups; `start-production.sh` runs migrations for the web/all role, while `routes/console.php` schedules rollup and pruning in the scheduler role.
- The latest local 8128 website and this branch have byte-identical `WebsiteConsent`, `WebsiteEvents`, `AnalyticsConsentController`, `AnalyticsEventController`, `EventContract`, owner controllers, dashboard components, and analytics styles. The latest site's home, `/downloads`, `/benchmarks`, portal, and legal entrypoints mount `initAnalyticsChoice`; named download buttons carry allowlisted IDs. The latest site has newer general marketing/download pages that are **not** in this reviewed backend branch. Do not replace its backend wholesale: its core Vibes/Agent/Remote routes differ from the current production source. Integrate those frontend pages separately onto the reviewed backend, or release the reviewed backend first and preserve the latest website checkout for its own verified update.
- Desktop and mobile client payloads use `GET/PUT /api/analytics/consent` (`surface`, choice, policy version 1) and bearer `POST /api/analytics/events` (UUID, timestamp, named event, bounded properties, current consent mode). Backend rejects unknown/declined server choices. Client events are best effort. Prompt text and project paths are not part of the contract.

## Package corrections in this branch

- `export-owner-production.php` required `scripts/owner-analytics-events.php`, but that 142-line helper was missing from the prior source archive and PR branch. It is now present. `OwnerProductionExporterPackageTest` invokes the CLI without production variables and expects its deliberate environment guard; a missing helper fails before that guard. The local 8128 checkout already had the helper, so this defect affected the proposed release package, not its current snapshot refresh.
- Repository-root `railway.json` had an explicit build command that installed Composer packages but skipped Vite. It now runs `npm ci && npm run build`, so a root-based build creates the website analytics choice and owner dashboard bundles. Backend-root `nixpacks.toml` already builds Vite. `ProductionProcessTopologyTest` checks the root command.
- The consent panel now distinguishes optional download-button clicks from anonymous successful download-response and signup counts. The full privacy policy already discloses optional named events, coarse country, 90-day raw retention, 13-month suppressed totals, withdrawal, and separate account linkage. Apply this small panel-copy change to the latest 8128 website before releasing that site's frontend.

## Verified here

- Isolated backend PHP suite: 913 tests, 6,514 assertions; four PHPUnit notices and one skip, no failures. The worktree is under the user home because an existing encoded-preview fixture permits folders there.
- Focused owner, analytics, website tracking and process topology: 29 tests, 286 assertions, no failures. Latest 8128 website checkout focused analytics/owner tests: 25 tests, 277 assertions, no failures.
- `npm run build` generated a Vite manifest with the analytics choice, marketing, portal, and owner imports. The static homepage image and Manrope fonts exist in `public/`; Vite's unresolved-root-URL warnings refer to runtime-served public assets.
- CLI exporter without production variables returns its expected refusal after loading all helpers. No production database connection or event insertion was made in this review.

## Deployment boundary

The Railway Vibyra service remains linked to the obsolete `ellisthreader/Vibeza` Git source. A previous environment-variable apply unexpectedly deployed that old source; the live 848-file source was recovered. Do not treat a variable change, `main`, or a healthy `/up` response as proof of this candidate. A release must use the exact independently reviewed source upload/image, or first correct and protect the linked Git source. After deployment, compare source hashes with the approved manifest, check migrations, `/api/analytics/consent`, `/api/analytics/events`, `/web-api/analytics/consent`, `/web-api/owner/analytics`, existing Vibes/Agent/Remote routes, queue worker and scheduler, and then refresh the local aggregate snapshot. Verify consent rejection, accepted opted-in events and withdrawal before distributing native clients. Configure the owner allowlist and country database separately through reviewed production settings. The repository's production security and independent review gates still apply.

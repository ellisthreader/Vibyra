# Owner analytics review evidence — 26 September 2026

This folder accompanies the review branch. It contains no production secrets or test logs. It does not approve a deployment.

- [`DRAFT_PR_BODY.md`](DRAFT_PR_BODY.md): scope, two source commits, validation, and blockers.
- [`GATES.md`](GATES.md): release gate status and outstanding manual evidence.
- [`PRODUCTION_WEB_SCOPE_REVIEW.md`](PRODUCTION_WEB_SCOPE_REVIEW.md): proposal for an independently approved backend/website scope. The current policy remains in force.
- [`CI_FOLLOWUP.md`](CI_FOLLOWUP.md): sanitized PR check failures and the narrow CI fixes.
- [`production-security-audit.json`](production-security-audit.json): redacted recorded audit findings, 53 pass/24 fail/9 manual. A subsequent production flag finding awaits an updated audit. It lists variable names and status only, not values.
- [`release-manifest.json`](release-manifest.json): production image identity, 114 source overlay hashes, tar hash, tests, and Git provenance. Its absolute artifact paths are local review references, not files in this repository.

## Validation summary

The final integrated backend candidate was run in a source copy under the trusted user home with current mobile picker and root deployment fixtures, an ephemeral test encryption key, and direct PHPUnit with `memory_limit=512M`. Result: **910 tests, 6,454 assertions, one failure, three PHPUnit notices, one skipped**. The sole failure is the current mobile model picker versus the unchanged production backend Auto shortlist; a separate model/billing review is required. Owner enrollment, consent, account reporting, operational metrics and existing 2FA cases passed. Connector registry tests passed 64 tests/340 assertions after test-only corrections. Eight UI source tests, PHP lint, route cache, and final Vite build passed. Mobile `npm ci` and Expo dependency alignment passed after its separate patch.

The production source archive is held outside Git at `/Users/ellis/Desktop/Vibyra-owner-analytics-release-candidate/source.tar.gz`, SHA256 `cf4d0831deb28c6735cf7bdbd35af6302370ec7b84c5c659e7d230c1a803ac36`. Its 930 files exclude secrets, dependencies and runtime state. The branch tracks its 114 source overlays and the exact running backend baseline; Railway rebuilds frontend assets from source. Check the live deployment image digest against the manifest again immediately before any approved release.

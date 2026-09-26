# Owner analytics review evidence — 26 September 2026

This folder accompanies the review branch. It contains no production secrets or test logs. It does not approve a deployment.

- [`DRAFT_PR_BODY.md`](DRAFT_PR_BODY.md): scope, two source commits, validation, and blockers.
- [`GATES.md`](GATES.md): release gate status and outstanding manual evidence.
- [`PRODUCTION_WEB_SCOPE_REVIEW.md`](PRODUCTION_WEB_SCOPE_REVIEW.md): proposal for an independently approved backend/website scope. The current policy remains in force.
- [`production-security-audit.json`](production-security-audit.json): redacted audit findings, 53 pass/24 fail/9 manual. It lists variable names and status only, not values.
- [`release-manifest.json`](release-manifest.json): production image identity, 112 source overlay hashes, tar hash, tests, and Git provenance. Its absolute artifact paths are local review references, not files in this repository.

## Validation summary

The final integrated backend candidate was run in an isolated copy with current mobile picker and root deployment fixtures, isolated `HOME`, and PHP `memory_limit=512M`. Result: **910 tests, 6,450 assertions, one failure, three PHPUnit notices, one skipped**. The sole failure is the current mobile model picker versus the unchanged production backend Auto shortlist; a separate model/billing review is required. Owner enrollment, consent, account reporting, operational metrics and existing 2FA cases passed. Connector registry tests passed 64 tests/340 assertions after test-only corrections. Eight UI source tests, PHP lint, route cache, and final Vite build passed.

The production source archive is held outside Git at `/Users/ellis/Desktop/Vibyra-owner-analytics-release-candidate/source.tar.gz`, SHA256 `45452eae3775063184cae43f05c93643ff8b909e158a0120530f56565f861a6c`. Its 929 files exclude secrets, dependencies and runtime state. The branch tracks its 112 source overlays and the exact running backend baseline; Railway rebuilds frontend assets from source. Check the live deployment image digest against the manifest again immediately before any approved release.

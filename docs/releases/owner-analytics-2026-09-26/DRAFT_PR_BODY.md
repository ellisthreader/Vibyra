# Draft PR: consented owner analytics and protected owner reporting

## Status

**Draft; do not merge or deploy.** Branch `codex/owner-analytics-production-review-20260926` contains two source commits because `origin/main` does not represent the running Railway backend, plus a documentation-only evidence commit:

1. `30453116d696af1b4505469df20d493854fda2e3` — record the backend source of the running production image (`377 files changed, 26,142 insertions, 215 deletions`). The source has been checked against 848 file hashes in `baseline-sha256.json`.
2. `8d85ad306d8f4a2091db8497ee9a03f796801a7f` — consented analytics and protected owner portal overlays (`113 files changed, 4,647 insertions, 103 deletions`). The deployment package inventory records 112 changed or added source paths; root `.railwayignore` is also in the commit. Every tracked package source file matches this commit byte-for-byte. Generated `public/build` is rebuilt by Vite and is not Git tracked.

The base is `origin/main` at `3619067cd68237feeb09009a415c5bd7d66f9912` (8 September 2026). Compared with that old base, the running backend has 357 paths absent from main and 35 paths with different bytes. Review commit 1 as deployed-source reconciliation, then commit 2 as the analytics change. The third commit records this evidence under `docs/releases/owner-analytics-2026-09-26/` and does not change deployment source. Do not replace production with old `main` or cherry-pick commit 2 onto it.

## Scope

- Optional, explicit website/Desktop/iOS analytics choices, revocation and bounded named event ingestion. Prompt text, arbitrary URLs, file paths, terminal content and raw IP are excluded.
- Website, Desktop, iOS, account and Vibes cloud summaries, data quality and operational account activity. Existing server records provide token-use and cloud-turn series; unrecorded historical surface activity remains unavailable.
- Verified allowlisted owner web routes; local 8128 one-click test access is restricted to aggregate snapshot data.
- Named account records require confirmed Vibyra TOTP and a fresh separate owner step-up. A Google-provider owner can enroll through a website-only Google identity round trip bound to the same owner web session and exact provider subject, followed by TOTP confirmation. Google may reuse its session and does not guarantee a fresh password/MFA challenge. Existing native Google login semantics are unchanged.
- Test-only connector registry corrections cover actual advertised operations. Composio and connector runtime remain at the running production baseline.

## Validation

- Final integrated isolated backend suite: **910 tests, 6,450 assertions, one model-shortlist failure**, three PHPUnit notices, one skipped. It uses the current mobile picker fixture, root deployment fixtures, isolated `HOME`, and PHP `memory_limit=512M`. The remaining failure is `VibesAutoGuardrailsTest`: the current mobile picker advertises GPT-6 Sol/Luna and Claude Opus 5.5 absent from the unchanged production backend Auto shortlist/profile/billing data. A separate coordinated model branch is under review and is not in this PR.
- Focused Google-owner enrollment, analytics, existing 2FA and owner reporting tests pass. Eight UI source tests, route cache, PHP lint, connector suite (64 tests/340 assertions), and final Vite build pass.
- Security audit: **53 pass, 24 fail, 9 manual**. See `production-security-audit.json`, `GATES.md`, and `PRODUCTION_WEB_SCOPE_REVIEW.md`. The production release policy has not been waived.
- The running deployment ID and image digest matched the candidate snapshot at the last read-only check, 2026-09-26 14:28 UTC. Recheck immediately before any later release.

## Review and release gates

The repo's `docs/security/production-release-gates.md` requires green automated gates and dated evidence with approval independent of the implementer. No protected commit CI, branch/environment protection, complete manual evidence, or approval is present yet. `VIBYRA_OWNER_EMAILS` is unset in production, GeoLite2 is unprovisioned, and optional event intake is not live. Before rollout, reviewers must resolve or independently scope the 24 security findings, the model failure, protected provenance, backup/restore and rollback, auth and consent acceptance, monitoring, and platform release gates. No production variables were changed, no build was distributed, and no deployment was made by this candidate.

Review evidence is in [`docs/releases/owner-analytics-2026-09-26/`](docs/releases/owner-analytics-2026-09-26/). The local package and full logs are at `/Users/ellis/Desktop/Vibyra-owner-analytics-release-candidate/`; source archive SHA256 `45452eae3775063184cae43f05c93643ff8b909e158a0120530f56565f861a6c`.

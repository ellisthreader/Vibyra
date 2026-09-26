# Backend and website release scope review — 26 September 2026

**Proposal for independent review only.** The existing `docs/security/production-release-gates.md` still governs this release. The analytics candidate has not been deployed, and optional website/native event intake is not live.

## Why a scoped release may help

The current production security audit has 24 failed checks and nine manual gates. Six failed checks concern packages that a backend/website-only deployment would not ship: Android LAN cleartext, the absent Expo Updates runtime/channel, remote EAS build numbering, and verified iOS/Android app links. `environment.EXPO_PUBLIC_LAN_V2_MODE` is likewise a native-client setting. A reviewer could approve a *new documented scope rule* that defers native artifact checks until native distribution, while retaining all backend/web checks. This is not a waiver to be inferred by the implementer; it needs a policy change and independent approval before it affects a release.

A website/backend release would start measuring consenting website visitors and could expose existing server-held account/Vibes activity to the protected owner. Desktop and iOS telemetry remains unavailable until updated native clients are actually installed by users. Historical usage cannot be reconstructed.

## Findings that still affect the running service

The audit flagged service configuration for explicit CORS origins, legacy Desktop/phone/preview routes and tokens, publish review, pairing rate limits, LAN V2, and moderation fail-closed behavior. These are backend behavior decisions and require production review, correct values, and proof of compatibility. Do not set flags merely to satisfy the audit.

The audit also flagged Stripe keys/webhook, Apple and Google IAP configuration, and `GOOGLE_AUTH_CLIENT_IDS`. Reviewers must either provision genuine credentials for the shipped feature scope or independently document why a gate is inapplicable. `GOOGLE_DESKTOP_CLIENT_ID` is included by current backend config in Google audiences, but that does not make the audit green or prove the new owner enrollment in production. No secrets belong in the artifact.

A web-only release still requires a verified owner account allowlist, server-side denial by default, consent rejection and withdrawal checks, native event isolation, privacy notice, auth/TOTP step-up, database backup/restore, migration and rollback rehearsal, monitoring, incident response, threat review/pentest evidence, protected release commit, and independent approval. The current GitHub repo has no visible main branch protection/rulesets; there is no environment named exactly `production`, and the existing `spectacular-charisma / production` environment has no protection rules. A local Git branch does not meet protected provenance.

## Sequence if the scope is approved

1. Review and approve the scoped policy change with an independent reviewer and dated evidence. Keep native packaging/distribution as a later separately gated release.
2. Resolve the backend/web audit findings and the full-suite model shortlist failure on a reviewable protected commit. Rebuild the source package from that commit and confirm it still matches the current running deployment baseline; if the image changed, rebase onto a fresh snapshot.
3. Verify a backup and restore path plus rollback. Configure the owner allowlist with the verified account and provision GeoLite2 if country reporting is desired. Keep the local 8128 snapshot aggregate-only.
4. Deploy through the approved path, then test `/up`, migrations, website consent decline/accept/withdrawal, accepted event ingestion, freshness, owner access, Google owner TOTP enrollment, the separate named-data TOTP step-up, and rollback readiness. Observe actual real accepted events before calling telemetry live.
5. Release Desktop/iOS clients only after their own artifact, storefront, privacy and production gate evidence is complete. Track rollout adoption and never interpret old-client silence as zero usage.

## Current evidence and limits

The isolated integrated suite ends at 910 tests/6,450 assertions with one unrelated but real mobile/backend model failure. The final Vite build passes. A local 8128 timestamped real account snapshot and server token-use/cloud-turn aggregates are useful operational data; they are not historical optional product events and are not evidence of deployed ingestion. The intended Google owner lacks Vibyra TOTP. The website-only setup requires an OAuth identity round trip returning the exact provider subject, bound to the same owner web session, then TOTP confirmation; Google can reuse an existing provider session, so do not describe the round trip as guaranteed fresh authentication or MFA. Named records separately require Vibyra TOTP step-up.

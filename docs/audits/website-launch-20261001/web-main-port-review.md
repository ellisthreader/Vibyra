# Selective website/security port review — 2026-10-01

Initial comparison completed before editing. **The reviewed core and hook-only owner port have now been applied**; see `web-source-port-manifest.json` for exact before/after hashes and remaining integration boundaries. Baseline is deployed `0a02f32a`; candidate is the isolated launch-fix working tree. Do not apply `web-review-owned.patch` wholesale: it is a preservation artifact, not a main-ready patch. Exact per-file classification is in `web-main-port-comparison.json`.

## Safe core patch

`web-main-safe-core.patch` applies cleanly against the current dirty main checkout (`git apply --check` passed). It preserves other dirty work and contains only:

- VibyraCors sandboxed-public-demo CORS preservation.
- CommunityPublishing HostedDemo, PreviewEndpoints, PublishEndpoint, RuntimeBundle, Utilities changes.
- ProjectSafetyReview, ProjectSafetyReviewAi, ProjectSafetySourceBodyScanning and new PublishedArtifactReview.
- HostedDemoFullStackArtifactTests and PublishingReviewOverrideTests corrected security expectations.

Apply this small patch, then run the community core/hosted suites plus focused new artifact tests. Main already registers SecurityHeaders and has a nonce-bearing legal layout: preserve those stronger existing implementations.

## Requires deliberate integration

- Main has no VerifyHuman, human-check template or WebsiteHumanCheckTest. Bring these together only with parent-owned Turnstile services config, page and API route wiring; adding the middleware class alone is ineffective. Do not weaken main's stronger legal/signup/market route enforcement.
- Main OwnerPage is an earlier, untracked four-section implementation. Add the three new owner hook/identity files, then manually replace only its fetch state/effect and freshness/retry rendering. Preserve its existing sections; never replace it with the candidate's account/commercial UI without the corresponding backend.
- Main BillingPage, BillingStatusPage, legal layout/privacy/terms are divergent. Preserve main: it already gates paid CTAs with stripeEnabled, uses rights-request links, has nonce-aware styling, and includes newer eligibility/legal content. Only add October availability wording if an equivalent iPhone claim actually exists; no blanket contact replacement.
- Main lacks the production marketing/home subtree, CheckoutPage, and release-announcement template. Do not reconstruct that website by copying missing leaf components. The active website source is `/Users/ellis/Desktop/Vibyra-web`; Desktop, PocketDialog, NightShift, OwnerPage and human-check match the deployed baseline there, while Mobile/Plans/Questions/Checkout and legal views have intervening work. Apply scoped hunks to that source after review; keep unrelated design and legal edits.
- WebsiteLaunchSecurityTest spans new human routes and current candidate publication fixtures. Split or adapt it after route integration; blindly copying it into main introduces misleading failures.
- Startup/router/bootstrap/routes, auth, billing, dependency files and built assets are parent-owned and intentionally excluded.

## Isolated candidate test follow-up

Updated the old production auto-approval fixture to require pending review and changed the isolated LegalPages contact assertion to `support@vibyra.net`. Main's legal assertions should continue to follow its own rights-request page; do not port the isolated legal expectation there.


## Applied source ports

2026-10-01: Applied the checked core patch to main, added the identity-scoped owner polling hook, and manually integrated freshness/retry into its four-section OwnerPage. Preserved all unrelated dirty files. Community core/hosted tests and temporary-output Vite build pass.

Applied clean baseline deltas and narrow semantic edits to the active Vibyra-web source: October iPhone waitlist/copy, app-open agent conditions, owner polling/identity guard, trusted CSP nonces, nonce-aware SecurityHeaders, and canonical IPv6 crawler comparison. Preserved its stronger TrustedClientIp verification, sales/market/legal gates, rights forms and differing Free/Pro source policy. Website headers/human tests and temporary-output Vite build pass. These ports do not deploy either checkout.

Do not apply the historical full preservation patch blindly: missing main frontend structure and parent-owned auth/billing/backend integration remain explicit boundaries. The source-port manifest is the release-overlay checklist.

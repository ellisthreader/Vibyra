# App - Store Production Readiness

Read this for the current App Store and Google Play release state. Recheck
policy before submission. The detailed evidence and acceptance criteria are in
`Vibyra/_ai/Runs/Vibyra Phone Application Audit - 2026-07-19.md`.

## Current Status

Audit date: 2026-07-19. The native phone app is not ready for public store
submission.

Implemented foundations:

- native Apple/Google/email auth, recovery and provider-aware account deletion;
- secure native storage for auth and desktop bearer tokens;
- pairing approval, projects/files, chat/tools, edit approval and preview flows;
- community publishing/comments and verified Apple/Google purchase restoration;
- public Laravel Privacy Policy and Terms routes with working pre-auth/profile links;
- authenticated, persisted, bounded, and rate-limited Explore report submission;
- best-effort backend session revocation with verified local logout cleanup;
- mobile line gate, TypeScript, and 141 mobile logic/contract tests pass.

Confirmed release blockers:

- the new legal routes still require production deployment and live URL verification;
- `links.vibyra.app` does not resolve, breaking reset links and association files;
- user/content blocking remains absent from Explore;
- onboarding/PC setup is not mounted and its quiz is explicitly bypassed;
- privacy/cache copy conflicts with continuous cloud session-state sync;
- subscription server notifications/revalidation, localized presentation,
  disclosures, and top-up UI are incomplete;
- `app.json` uses a transparent 1254px retired-brand icon and has no Android
  adaptive icon configuration;
- Android globally allows cleartext and the production desktop URL is HTTP;
- the public demo allowlist trusts the shared `*.up.railway.app` namespace;
- no signed-build, physical-device, screen-reader, or end-to-end release evidence
  exists.

## Current Validation Snapshot

- Mobile line gate: 577 files, zero over 200 lines; TypeScript and 141/141
  mobile tests pass after the legal/report/logout release-flow implementation.
- Clean Expo JavaScript exports for iOS and Android: passed; these are not signed
  native builds.
- `npx expo-doctor`: 18/18 on Expo SDK 54.
- Physical-iPhone App Store Expo Go can test the SDK 54 app through an explicit `--go` Metro
  launch. IAP and native Google Sign-In are deliberately unavailable there and
  still require a development/store build; EAS authentication and the first
  signed development build remain manual release-environment gates.
- `npm audit --omit=dev`: 15 advisories (13 moderate, 2 low, no high/critical).
- Static production security audit: 40 passed, 2 failed, 9 manual gates. The two
  failures are global Android cleartext and production HTTP desktop URL.
- The 2026-07-19 live check found legal URLs redirecting to `/lander`; recheck
  after deploying the Laravel legal routes. The recovery hostname was also unresolved.

## Submission Gate

Do not submit until the blockers above are closed and a production-signed iOS
and Android acceptance matrix covers auth/recovery, onboarding, pairing, chat,
edits, previews, UGC report/block/moderation, publishing, purchase lifecycle,
logout/account deletion, app lock, offline behavior, accessibility, and cold
launch.

Also verify EAS signing/project ownership, provider/store credentials, production
backend security environment, AASA/asset links, App Privacy/privacy manifests,
Play Data Safety/account-deletion URL, content/age ratings, UGC and AI-content
declarations, localized store assets, support contact, reviewer demo account,
and an operable desktop pairing/demo path.

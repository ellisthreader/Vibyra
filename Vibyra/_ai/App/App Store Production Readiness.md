# App - Store Production Readiness

Read this for App Store and Google Play release audits. Recheck store policy
before submission because requirements change.

## Current Status

Audit date: 2026-06-09. The mobile app is not ready for public store review
because the explicitly deferred findings below remain open.

Implementation scope decision, 2026-06-09:

- Current pass owns audit items 1, 4, and 5 only: production authentication
  and account recovery, store purchase verification/restoration, and Expo/EAS
  release configuration.
- Explore moderation, hosted legal pages, secure token storage, notification
  behavior, telemetry behavior, and the remaining audit findings are explicitly
  deferred to a later pass.

Completed in the current pass:

- Apple and Google mobile sign-in now use native provider SDKs. The backend
  verifies RS256 signatures through provider JWKS plus issuer, audience,
  expiry, verified email, and Apple single-use nonce claims.
- Email accounts have verification, resend, forgot-password, reset-password,
  and auth rate-limit flows. Password reset revokes existing app sessions.
- Account deletion requires the email password or fresh matching Apple/Google
  reauthentication according to the account provider.
- Google subscriptions and topups are verified through Android Publisher API
  endpoints with service-account OAuth. Restore Purchases exists in onboarding
  and profile billing, and trusted store transaction IDs prevent replay on both
  Apple and Google.
- Expo SDK dependencies are aligned, Expo Doctor passes 18/18, `eas.json`
  contains development/preview/production profiles, native build versions are
  set, microphone permission is removed, networking is scoped for local desktop
  use, and the icon is an opaque square 1024x1024 PNG.
- `app.config.js` conditionally adds the Google iOS URL-scheme plugin from
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`; production EAS builds must provide that
  real client ID.

Deferred blockers:

- `CommunityReportModal.tsx` only displays local success state; it does not
  submit a report. Explore also has no abusive-user blocking flow, content age
  labels, age gate, or universal-link index for hosted mini apps.
- `https://vibyra.app/legal/privacy` and `/legal/terms` currently resolve to a
  parked-domain page. The auth-screen legal controls also have no `onPress`.

## Release Configuration

- EAS production still requires account authentication (`eas login` or
  `EXPO_TOKEN`) and real Apple/Google/store credentials before signed builds.
- Configure `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
  `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, backend `GOOGLE_AUTH_CLIENT_IDS`,
  `APPLE_AUTH_CLIENT_IDS`, HTTPS `APP_URL`, production mail, and Google Play
  service-account variables before physical-device acceptance testing.
- Session and remembered desktop bearer tokens are persisted through
  AsyncStorage in `src/utils/persistence.ts`; move secrets to secure native
  storage before release.

## Validation Snapshot

- `npm run typecheck`: passed.
- Focused auth and IAP mobile tests: 4 passed.
- Focused auth and billing backend tests: 24 passed with 137 assertions, plus
  the shared Apple replay regression test.
- `npx expo-doctor`: 18/18 passed.
- Expo public config resolves with and without Google credentials; with a
  real-format iOS client ID it generates the required reversed URL scheme.
- `npm audit --omit=dev`: 16 findings, including one critical and one high.
- App source exceeds the repo 200-line standard in multiple files; start with
  `ChatComposer.tsx`.

## Submission Workflow

Fix the critical blockers first, then create production EAS profiles, build
signed iOS and Android artifacts, and run physical-device smoke tests for auth,
pairing, chat, previews, publishing, purchases, restore, cancellation, account
deletion, permissions, offline behavior, and cold launch. Provide reviewers a
non-expiring demo account plus a usable desktop pairing/demo path.

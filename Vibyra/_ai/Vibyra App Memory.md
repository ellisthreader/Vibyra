# Vibyra App Memory

The sole mobile application is `mobile/` (Expo SDK 57). Its first screen is
“Build from your pocket.”, with Get started and I already have an account.
Settings > Show welcome again reopens onboarding without deleting account data.
The former root `src/` application and its launch/build configuration are removed.

Connecting a computer starts with a live Bonjour search, not a code; read
[[App/Computer Connection]] for that flow.

Read [[App/iOS Remote Workspace]] as the focused app note. Begin at
`mobile/App.tsx`, `mobile/src/ui/WorkspaceApp.tsx`, and
`mobile/src/onboarding/OnboardingFlow.tsx`. The new app was preserved from the
confirmed working `/home/ellis/Desktop/Vibyra-iOS/mobile` checkout, including
its previously uncommitted source. Do not recover the retired app to satisfy a
launch request.

For native chat activity, questions and approvals, read [[App/iOS Conversations]].

For Vibes, sponsored OpenRouter agents, trial limits or StoreKit purchases, read
[[App/AI Credits]] as the focused note instead.

For sign-up/login design and Apple/Google/email authentication, read
[[App/Account Sign In]] as the focused note instead.

Run from root: `npm ci --prefix mobile`, `bash host/scripts/build-wasm.sh`,
then `npm run phone`. Root start/dev/web/ios commands delegate to mobile.
Verify the manifest's source directory and native bundle before sharing a QR.
See the Expo diagnostics skill for listener ownership and account discovery.

Validation: root `npm run check:mobile`, mobile `export`, Host workspace tests,
and `scripts/mobile-entrypoints.test.mjs` (rejects a second Expo entry point).
The backend and desktop core remain shared services, not legacy app artifacts.

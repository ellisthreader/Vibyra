# Vibyra App Memory

The sole mobile application is `mobile/` (Expo SDK 57). Its first screen is
“Build from your pocket.”, with Get started and I already have an account.
Settings > Show welcome again reopens onboarding without deleting account data.
The former root `src/` application and its launch/build configuration are removed.

Read [[App/iOS Remote Workspace]] as the focused app note. Begin at
`mobile/App.tsx`, `mobile/src/ui/WorkspaceApp.tsx`, and
`mobile/src/onboarding/OnboardingFlow.tsx`. The new app was preserved from the
confirmed working `/home/ellis/Desktop/Vibyra-iOS/mobile` checkout, including
its previously uncommitted source. Do not recover the retired app to satisfy a
launch request.

Run from root: `npm ci --prefix mobile`, `bash host/scripts/build-wasm.sh`,
then `npm run phone`. Root start/dev/web/ios commands delegate to mobile.
Verify the manifest's source directory and native bundle before sharing a QR.
See the Expo diagnostics skill for listener ownership and account discovery.

Validation: root `npm run check:mobile`, mobile `export`, Host workspace tests,
and `scripts/mobile-entrypoints.test.mjs` (rejects a second Expo entry point).
The backend and desktop core remain shared services, not legacy app artifacts.

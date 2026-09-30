# Mobile Account Sign In

The maintained phone account entry lives in `mobile/src/onboarding/AccountStep.tsx`
and `AccountForm.tsx`; Settings reuses the form through `ui/AccountSheet.tsx`.
Use Graphite+Cobalt tokens, a compact branded header, prominent Apple/Google
buttons, then labelled email/password fields. Keep Skip in the header and the
login/signup switch below the form. Avoid claims that Host chats already sync.
Use one Vibyra logo in the header only; omit the duplicate hero logo tile and
promotional subtitle. The account heading leads directly into sign-in choices.
`OnboardingHeaderBackdrop.tsx` reuses the welcome cobalt/sky textures as faint, slow
header lighting, fading away above the email fields. Keep field/button surfaces
opaque, reduce the light strength in light mode, and retain the single logo.
Shared `useDrift` uses the native animation driver, avoids interaction blocking,
and responds to live Reduce Motion changes by keeping the lighting static.
Account and path-choice pages share that backdrop and `OnboardingBrand.tsx`.
The form scrolls with the keyboard; email Next focuses Password. Switching
modes retains email but clears password, reveal state and errors.

`account/accountApi.ts` owns the Laravel contracts; `accountActions.ts` keeps
verified sessions in existing SecureStore (memory on web). Provider identity
tokens, nonce challenges and browser flow IDs are transient, never UI state or
persistent flags. Closing the account sheet or leaving onboarding cancels a
provider attempt; cancellations do not produce an error or complete onboarding.

On iOS, `providerSignIn.ts` uses `expo-apple-authentication`, a server-issued
single-use nonce from `/api/auth/provider/challenge`, then `/api/auth/login`
with identityToken/challengeId. The config enables usesAppleSignIn and the
plugin. The backend must accept the signed app audience in APPLE_AUTH_CLIENT_IDS;
Expo Go has a different audience. Simulator availability is not device proof.

Google uses the system authentication browser and the existing backend-owned
`/api/auth/desktop/google/start` and `/status/{flowId}` flow (state/PKCE and
code exchange stay server-side). URLs must be HTTPS at the selected provider's
exact host. Requests time out and the attempt is cancellable. Web uses an
isolated popup; Apple web/Android requires separate backend browser OAuth
configuration. The deployed Google start endpoint was available on 2026-09-09;
Apple browser OAuth was not configured. Native Apple uses a separate contract.
Real provider-account completion and Apple device validation remain necessary.

## Dev demo sign-in

The account step's `__DEV__`-only Test button calls `signInDemo` (wired in
`App.tsx`), which opens the sample workspace signed in as `demoAccount`
(`demo/data.ts`, demo@vibyra.app, plan `sample`). It never calls the backend,
stores no token and creates no account; Settings labels it a sample account and
its Log out simply leaves the sample workspace. Keep it behind `__DEV__` and
memory-only; do not swap it for shipped credentials or a backend demo session.

A successful sign-in must never remount the workspace. `VibesProvider` now
replaces its per-account `VibesStore` in place: keying that subtree by account
identity remounted `WorkspaceApp`, so email and provider sign-in during the
first run threw the phone back to the welcome screen (fixed 2026-09-09).

Run `npm --prefix mobile run verify:auth-ui` for signup/login, focus, password
visibility, backend errors, short keyboard viewports, provider cancellation,
and a fixture-backed successful session at three phone widths plus desktop in
both themes, then the Test button's demo sign-in, sample workspace and log out.
It does not create real accounts. Also run mobile check/export.
The Expo diagnostics skill routes auth checks here. The broad workspace UI
harness covers separate terminal/navigation behavior; do not mistake a later
terminal-tab assertion for an account-screen failure.

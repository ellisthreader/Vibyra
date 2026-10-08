# iOS Remote Workspace

The new iOS workstream lives in `mobile/` with standalone Rust `host/`, in the
confirmed `Desktop/Vibyra-iOS` checkout, including its uncommitted work.
This app is now preserved in the repository; the root `src/` Expo app is removed;
`Desktop/SaaS` and its retired vault are not the new implementation target.

Read `docs/ios-mobile-implementation-status.md` for current evidence and open
milestones; the long master plan is `docs/ios-mobile-master-plan-2026-2027.md`.
The local `plan` skill routes implementation/verification to this workstream.

Entry points: `mobile/App.tsx`, `src/state/WorkspaceStore.ts`, `src/ui/WorkspaceApp.tsx`,
`src/transport/`, `src/terminal/`, and `src/demo/` (paths relative to `mobile/`).
Use Graphite+Cobalt tokens with a conversation-first mobile layout. This is a
remote vibe coding tool, not a teaching app. Start on the coding composer; the
sidebar searches chats, filters Chats/Terminals, and opens Projects/Computers.
Avoid lessons, onboarding dashboards and sample calls to action on the home.
The first screen says “Build from your pocket.”; Settings > Show welcome again
reopens it. A one-time first-run gate (`src/onboarding/`, welcome → optional account →
computer-or-phone choice, every step skippable) is permitted before the
workspace mounts; it is not a home dashboard and the home stays unchanged.
`PathStep.tsx` uses the account screens' single `OnboardingBrand` header and
subtle `OnboardingHeaderBackdrop`. `PathCard.tsx` presents two radio choices
with full-width descriptions and visible rollout status. Default to computer;
keep Skip in the header and one bottom action matching the current selection.
Accounts (`src/account/`) offer email, native Apple and browser Google sign-in;
see [[Account Sign In]] for UI ownership, provider configuration and checks. The token
lives only in SecureStore (memory on web) and the "welcome completed" flag in
`deviceFlags` (localStorage on web). Pairing never requires an account.
Sample content is explicit opt-in under Settings, or the `__DEV__`-only Test
button on the account step that signs in to the sample `demoAccount`; labeled
and memory-only.
Rich conversation/approval examples do not establish live support.

Sending from a home composer never opens a configuration sheet. One shared
picker, `mobile/src/ui/AgentSheet.tsx` with `mobile/src/ui/agents.ts`, is the
only place a choice is made, and every row in it is an OpenRouter model: Auto,
then one collapsed row per company that opens to that vendor's models. Companies
are keyed by the OpenRouter slug vendor (the part before the "/"), never by the
display family, so a curated model and a live catalogue model land together;
`mobile/src/ui/brands.ts` maps that vendor to its official single-colour mark
(Simple Icons paths, drawn by `BrandLogo.tsx` through `react-native-svg` and
tinted to the theme), falling back to an initial. Computer agents are not in the
picker: Auto resolves them, and `NewSessionSheet` from the Projects list is the
only place Claude Code/Codex/Terminal is chosen by hand. Auto is never stored;
each surface resolves it and picks the project itself, so a phone that never
opens the picker still starts a chat in one tap. Picking a model on the computer
home switches to the AI chat, carrying the draft. `released` on curated
`backend/config/vibes.php` models earns the "New" badge.
The catalogue is a menu, not account state, so it never depends on a signed-in
account or a healthy wallet: `mobile/src/vibes/catalogue.ts` ships the curated
list with the app, `VibesStore.loadModels` fetches over it on its own, and
`GET /api/vibes/models` answers unauthenticated and ignores `vibes.enabled`
(spend paths stay gated). Without this the picker silently degrades to Auto
alone whenever the backend is old, unreachable or the phone is signed out.
`available` on a shipped row means "offered", not "priced"; the quote is still
what decides whether a model can run. Keep the file in step with
`backend/config/vibes.php`.

New Codex chats on capable Hosts have the native iOS conversation experience:
compact activity, inline questions/permissions and expandable command details.
Read [[iOS Conversations]] for source ownership, exact contracts and validation.
Existing PTYs retain their runner. Theme ownership is `mobile/src/theme.ts`.

Safe areas: under the New Architecture, `SafeAreaView` cannot walk the native
superview chain through a full-screen Modal to its provider. Read
`useSafeAreaInsets()` in the Modal owner and apply content padding explicitly.
For the full-height navigation rail, pinned footer, scrolling chat sections and
isolated native/browser verification, read [[iOS Sidebar]]. The `plan` skill
covers this edge-to-edge design check. Never replace the shared App.tsx entry
for a simulator fixture; use the isolated fixture manifest instead.

The Vibes economy now has its own mobile screens, StoreKit bridge, versioned
backend wallet and metered OpenRouter file-tool loop. Read [[AI Credits]] for
ownership, trial/rollover policy and validation. Live provider and physical iPhone
purchase acceptance remain open; the release flags default off. Existing
computer/provider-account agents remain separately funded and accessible.

Computer setup, the auto-starting Apple Bonjour search, code-free nearby
pairing and native-build limitations are in [[Computer Connection]]; use the
Expo diagnostics skill for verification.

Host protocol and current limitations are in `host/docs/protocol.md`. Host
owns PTYs, input leases, session generations, current state and file boundaries.
Standalone Host sessions stay separate. Mac 0.1.9 embeds a view-only adapter
for existing desktop PTYs; see [[Desktop/iPhone Connection]]. PTY Chat shows the actual CLI terminal stream; new structured Codex
sessions use the additive contract in `host/docs/conversations.md`.
The phone observes by default, explicitly claims control, and must never retry
ambiguous terminal input. Session-create retries retain their submission ID.
Reconnect uses bounded snapshots plus byte-offset output reconciliation.

Native trust uses SecureStore; browser keys stay in memory. A phone that found
a computer over Bonjour can pair with no code, still only after an explicit
approval on that computer; see [[Computer Connection]]. Structured iOS drafts
persist locally; other drafts remain memory-only. New chat creation returns its session so the home prompt moves
into that session as a draft without automatic execution. Session drafts and
sample terminal output are isolated by session. Do not upload host output into
legacy account/cloud state. Standalone Host pairing grants full computer-user
shell authority; Desktop pairing only grants terminal viewing. Neither is an
account-bound or project-sandboxed execution service. Structured approvals are supported only
by the new conversation runner; existing PTYs retain provider terminal prompts.
Current working-tree diffs are not task-owned artifacts or test provenance.

Build WASM with `host/scripts/build-wasm.sh`, then run `npm ci` in `mobile/`.
`npm run check` generates assets and checks types/tests/source lines.
`npm run web` starts the browser preview; `npm run export` bundles iOS/web.
The terminal verification script exercises rendering and control using Chrome.
`npm run verify:ui` captures the demo flow; `npm run verify:host-ui` tests real
UI pairing, file effects, review, reconnect and stop against an isolated Host.
Keep source/test/script files at most 200 lines; generated assets are excluded.
The plan skill covers rendered radio/tab ARIA state and modal background
accessibility checks; do not infer browser accessibility from native props alone.

For an iPhone QR, use the local `vibyra-expo-web-diagnostics` skill and start
Expo with `npm run phone` from the dedicated repo root or `mobile/`. It uses
`--go --lan --port 8081`; keep the process persistent. An old SDK 56 Metro from
`Desktop/SaaS` previously occupied 8081 with the same Vibyra name and slug.
Verify the listener cwd and native manifest, not the Expo Go recent-project name.
Expo Go from the iOS App Store supports this app's SDK 57 as of September 2026;
the CLI and phone must be signed into the same Expo account. Verify the LAN
manifest and warm its iOS bundle before sharing the QR. A development build
remains the target for full native validation; browser/export and LAN bundle
checks do not establish physical iPhone, mobile-data, background or store readiness.

Retirement workflow: all root launch commands delegate to mobile and CI builds
the bundled Host transport before checking/exporting it. The old source, Expo
configs, screenshots, browser profiles and old app-specific memory notes are
removed. `scripts/mobile-entrypoints.test.mjs` guards this single-app rule.
The Expo diagnostics skill is the authoritative launch/QR troubleshooting route.

Mac simulator setup: the current checkout is `/Users/ellis/Desktop/Vibyra/mobile`.
Use the existing Expo app with Xcode's iPhone Simulator and SDK 57 Expo Go.
The Expo diagnostics skill covers runtime installation, localhost IPv4 binding,
and preserving Fast Refresh by leaving CI unset. SwiftUI Canvas is a separate
workflow and does not preview this React Native app.
Verified on iPhone 17 / iOS 26.5 Simulator: SDK 57 Expo Go renders the
“Build from your pocket.” welcome, with Fast Refresh enabled.

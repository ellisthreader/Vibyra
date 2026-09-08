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
Accounts (`src/account/`) are email/password against `/api/auth/*`; the token
lives only in SecureStore (memory on web) and the "welcome completed" flag in
`deviceFlags` (localStorage on web). Pairing never requires an account.
Sample content is explicit opt-in under Settings, labeled and memory-only.
Rich conversation/approval examples do not establish live support.

Host protocol and current limitations are in `host/docs/protocol.md`. Host
owns PTYs, input leases, session generations, current state and file boundaries.
Host sessions are separate from existing Desktop chats until Desktop IPC is
implemented. Live agent Chat shows the actual CLI terminal stream.
The phone observes by default, explicitly claims control, and must never retry
ambiguous terminal input. Session-create retries retain their submission ID.
Reconnect uses bounded snapshots plus byte-offset output reconciliation.

Native trust uses SecureStore; browser keys stay in memory. Drafts are currently
memory-only. New chat creation returns its session so the home prompt moves
into that session as a draft without automatic execution. Session drafts and
sample terminal output are isolated by session. Do not upload host output into legacy account/cloud state. Pairing
currently grants full computer-user shell authority; it is not an account-bound
or project-sandboxed execution service. Structured approvals are unsupported.
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

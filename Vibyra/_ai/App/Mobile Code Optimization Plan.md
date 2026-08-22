---
title: Mobile Code Optimization Plan
scope: Expo phone app
status: implemented
updated: 2026-07-17
tags:
  - vibyra
  - mobile
  - refactoring
  - performance
---

# Mobile Code Optimization Plan

This plan covers the native Expo phone application only: `App.tsx`, `src/`,
mobile tests, and phone build configuration. Desktop and Laravel implementation
are out of scope except where the phone consumes an established contract.

## Verified Baseline

- 493 first-party phone source/test files and 48,750 physical lines.
- 22 files exceed the hard 200-line limit: 18 production files and 4 tests.
- `src/screens/workspace/` alone contains 239 files and about 26,154 lines.
- Styles are about 13,631 lines across 104 files. The complete workspace cascade
  resolves 1,339 keys from 1,411 definitions, with 61 duplicated names and 72
  last-writer overwrite events whose winners depend on spread order.
- There are 106 exact `partNN`/`chunkNN` filenames (81 style files and 25 inline
  modules), plus five weakly named `part20Profile*` modules.
- `useAppState` owns 69 `useState` calls. The flat `AppContext` is consumed by
  26 modules, and workspace hooks frequently depend on the whole `app` or `s`
  object, defeating callback stability.
- The largest prop contracts are `AIChatPage` (38), `ProjectPublishForm` (32),
  `PcSwitcherSheet` (20), `CommunityPostDetail` (19), and `MessageBubble` (18).
- Static reachability from `App.tsx` produces a volatile candidate list (90
  production candidates / about 7,915 lines in the peer-reviewed union graph).
  This includes two old onboarding/welcome trees, orphan components, unused
  workspace features, and platform files that must be resolved correctly before
  deletion. `App.tsx` currently routes authenticated users directly to
  `WorkspaceScreen` and does not read `onboardingComplete`.
- TypeScript strict mode passes. There are 332 type aliases, only 6 explicit
  `any` syntax nodes, and 110 aliases with zero or one textual external use.
  The issue is oversized ownership and redundant exported/local contracts, not
  an absence of types.
- All 115 current Node tests pass. Several tests transpile/import and execute
  real modules (notably persistence and URL policy), while many others inspect
  source contracts. There is no rendered React Native interaction suite.
- Clean iOS export: 1,643 Metro modules, 4.7 MB Hermes bundle, 38 assets, and
  25.65 MB total output. Only Ionicons is used, but the package-barrel import
  includes all vector-icon fonts. Large billing PNGs dominate app asset weight.
- `npm run typecheck` passes but took about 111 seconds on the audit machine.

## Existing Work To Preserve

The workspace inline UI now uses semantic filenames instead of `chunk1` through
`chunk25`. `AIChatPage.tsx` delegates scroll following, project-brief view
derivation, and message-list rendering to focused sibling modules while keeping
its explicit public prop contract in `AIChatPageTypes.ts`. The unreachable
`DashboardHome` / `RunningProjectsPanel` / `HomeBuildRow` family was removed.
`WorkspaceScreen` now delegates its modal/sheet host to `WorkspaceOverlays`;
desktop connection intents, community filtering, and preview selection live in
`useWorkspaceDesktopActions`, `communityFeedFilters`, and
`workspacePreviewSelection` respectively.

The earlier permission/optimization work established good boundaries:

- `AppContext.tsx` is intended to coordinate focused action hooks.
- agent work is already divided among prompt resolution, mode decisions,
  message streaming, result handling, and approval handling;
- pairing, workspace files, local chat, secure persistence, and preview logic
  already have focused modules;
- strict TypeScript, secret-storage tests, preview URL policy, explicit edit
  approval/deny, preview-start approval, and scoped desktop trust are valuable
  safety boundaries;
- the `plan`, `vibyra-optimise`, `vibyra-refactor`, and `vibyra-obsidian` skills
  define the working method; connection, preview, and Expo diagnostic skills
  supply regression checks for their respective batches.

The shortfall is enforcement and completion: there is no `mobile:lines` or
`test:mobile` script, the app memory claims the 200-line standard is already
met, and mechanical numbered splitting has outpaced semantic organization.

## Target Architecture

Use domain slices with narrow state and action hooks:

```text
src/
  app/                 providers, routing, app-lock shell
  features/
    account/           auth, profile, credits, billing
    desktop/           pairing, connection, permissions
    projects/          discovery, files, project memory
    chat/              threads, composer, runs, edit approvals
    preview/           preview launch and WebView policy
    community/         feed, detail, publish
  shared/
    api/               request, streaming, endpoint contracts
    persistence/       public state and secret adapters
    ui/                genuinely reusable primitives
    types/             only cross-feature contracts
```

Keep compatibility facades while migrating. Do not perform one large path
rewrite. Context is for cross-feature state; modal visibility, search input,
gesture state, and one-screen drafts stay local.

## Ordered Delivery Plan

### Phase 0 - Freeze Scope And Gates

1. Add a mobile scope manifest covering `App.tsx` and all first-party code in
   `src/`, including tests and platform variants.
2. Add `mobile:lines`, `test:mobile`, and `check:mobile` scripts. The combined
   gate runs the 200-line checker, strict typecheck, and mobile tests.
3. Capture current public exports, persistence payload fixtures, critical API
   request shapes, screenshots, iOS export size, and startup/chat render timing.
4. Add linting with React Hooks dependency rules; fix violations per batch,
   not as an unrelated repository-wide formatting change.

Exit: scope is reproducible and a new oversized file cannot merge unnoticed.

### Phase 1 - Freeze Safety Contracts

1. Before deleting or restructuring providers, add executable regression tests
   for full-session persistence, secret stripping/write ordering, sign-out,
   cache clear, session expiry, pairing's desktop-approval then phone-confirm
   boundary, project-scoped edit apply/deny/always, and preview allow/deny.
2. Keep one canonical persistence coordinator throughout migration. Slice
   reducers may expose snapshots, but only the coordinator writes the complete
   `PersistedSession`; partial saves must never imply secret deletion.
3. Preserve `createPersistableAppState` as a whitelist. Never spread complete
   account, desktop, project, or chat slices into local/cloud payloads.

Exit: safety invariants fail loudly before any state/context or dead-code work.

### Phase 2 - Resolve Dead And Duplicate Product Trees

1. Classify every current reachability candidate with Expo platform resolution,
   test-source ownership, deep links, and dynamic asset rules accounted for.
2. Decide whether onboarding is intentionally removed or accidentally bypassed.
   Keep exactly one onboarding/welcome route if required; otherwise delete the
   72-file legacy trees and obsolete onboarding state/actions.
3. Remove confirmed orphan components and unused workspace/publishing/billing
   branches. Never delete `.native`, `.web`, deep-link, or static-test targets
   solely because the simple import graph misses platform resolution.
4. Move desktop-only shared assets out of the phone asset namespace when that
   can be done without changing phone behavior. Remove confirmed unused mobile
   images and exact duplicates.

Exit: every production phone module is reachable or has a documented platform,
test, or tooling owner. Re-run export and record the size delta.

### Phase 3 - Clear All 22 Line-Gate Failures

Split by responsibility and keep stable public facades:

| Current file/family | Extraction boundary |
| --- | --- |
| `appApi.ts`, `appApiStream.ts` | request/errors/headers/retry; stream transport/SSE parser/timeout policy |
| `AppContext.tsx` | disconnect hook/transport and skills-loading hook; preserve provider/context facade |
| `useAuthContextActions.ts` | remote-user mapping, login/session actions, sign-out/cache/profile actions |
| `useAppState.ts` | account, desktop, project, chat, and runtime state slices plus persistence coordinator |
| `useLocalChatActions.ts` | text replies, image lifecycle, folder proposals, desktop/preview messages |
| `WorkspaceScreen.tsx` | edge gesture hook, chat route, page route, overlay host |
| `domain.ts`, `appContextTypes.ts` | account, desktop, project, chat, agent contracts; temporary compatibility barrels |
| `chunk9.tsx` | rename to `ChatScreen`; extract message list, setup gate, and controller |
| both `useWorkspaceActions.ts` files | connection/navigation/chat actions and project/file/preview actions respectively |
| `workspaceChatRuntime.ts` | chat targeting, detached messages, preview resolution |
| `hostedDemo.ts` | contracts, normalization, desktop transport |
| `BillingFeaturedPlan.tsx` | palette data, plan artwork, focused card component |
| `useCommunityPage.ts` | query/pagination, reactions, reporting/detail selection |
| `part57.ts`, `part49.ts` | semantic attachment, top-bar, and community style modules |
| four oversized tests | behavior-named test files; no arbitrary test fragments |

Aim for 160-180 lines in frequently edited files, with 200 as the hard ceiling.

### Phase 4 - Split State Ownership And Context Rerenders

1. First extract pure slice initializers/reducers/normalizers while retaining
   `useAppState`'s public return shape. Replace related independent states only
   after their transitions are covered; do not create one 69-field reducer.
2. Introduce narrow providers/hooks: account session, desktop connection,
   projects/files, and chat/runtime. Keep `PreferencesContext` separate.
3. Separate state contexts from action contexts where it materially prevents
   rerenders. Memoize each provider value from primitive/slice dependencies.
4. Migrate consumers from `useAppContext()` to the smallest domain hook. Start
   with account/profile leaves, then desktop permission/pairing, then project
   memory/preview, and migrate `useWorkspaceState`/`WorkspaceScreen` last. Keep
   a temporary compatibility facade until no production consumer needs it.
5. Split `useWorkspaceState` into local feature controllers (navigation/chat,
   PC switcher, community, preview). Pass narrow dependencies into workspace
   actions instead of the entire `app` and `s` bags.
6. Replace whole-object hook dependencies with exact functions/values. Profile
   before adding `React.memo`; memoization is an optimization, not a default.

Exit: changing composer text does not rerender profile, billing, project list,
or pairing consumers; connection polling does not rerender unrelated chat UI.

### Phase 5 - Reduce Prop And Type Friction

1. Give chat and publishing screens feature-local controllers/providers so
   `AIChatPage` and `ProjectPublishForm` receive small semantic inputs rather
   than 38/32 individual props.
2. Keep direct props for reusable leaf components. Do not use global context to
   hide two or three clear dependencies.
3. Localize one-use types, stop exporting private aliases, and derive types from
   canonical functions/contracts when clearer. Remove duplicate request and
   persistence shapes.
4. Keep discriminated unions and external API/security contracts explicit.
   “Fewer types” must not mean replacing safe contracts with `any` or `unknown`.
5. Replace the three `styles: any` escape hatches with typed themed-style
   helpers. Convert runtime icon imports used only for keys to type imports.

Exit: large prop surfaces are grouped into genuinely cohesive, memoized view
models/actions rather than hidden inside one equally broad controller object;
feature APIs have one canonical contract and explicit dependencies.

### Phase 6 - Replace Numbered Chunks And Unsafe Style Cascades

1. Rename all `chunkNN` files after their exports (`TopBar`, `ChatScreen`,
   `CommunityPostDetail`, `MessageBubble`, etc.) and update the barrel.
2. Snapshot all 1,339 resolved style keys, current winning sources/values, and
   transformed light values before changing style files.
3. Resolve the 61 duplicate style keys deliberately, preserving the current
   winning value unless a visual change is separately approved.
4. Replace `partNN` with feature-owned styles such as `chatAttachments.styles`,
   `communityFeed.styles`, and `workspaceMenu.styles`. Co-locate styles when
   only one component owns them.
5. Add a test that rejects duplicate merged style keys and numbered production
   modules. Validate dark/light and narrow/wide phone screenshots.

Exit: no `partNN`/`chunkNN` production files; every duplicate winner and merge
order is explicit and fixture-protected, with no visual regression from source
renames or import-order changes.

### Phase 7 - Measured Phone Runtime Optimization

1. Change the Ionicons barrel to a direct Ionicons entrypoint in a small spike;
   retain it only if a clean export removes unused font assets and typecheck/UI
   remain correct.
2. Convert oversized billing/background PNGs to appropriately sized modern
   assets, deduplicate card artwork, and compare visual quality plus export size.
3. Instrument local persistence. It currently serializes/saves the full session
   whenever any persisted dependency changes; add a short serialized debounce
   only after background/unmount/sign-out flush ordering is covered. Always
   write the canonical complete session; do not implement partial secret saves.
4. Keep the existing 700 ms cloud-sync debounce, but avoid rebuilding identical
   payloads and skip writes when the canonical snapshot hash has not changed.
5. Replace the long chat `ScrollView`/`.map` path with a virtualized list if
   profiling confirms message-render cost. Preserve bottom-follow, keyboard,
   setup-form, preview-card, and accessibility behavior.
6. Measure Hermes bundle size, asset size, cold start, authenticated workspace
   render, typing latency, chat scroll FPS, memory, and persistence write count
   after each optimization. Do not call file splitting a runtime win.

Exit: measured improvements with no functionality or approval regression.

### Phase 8 - Testing And Final Acceptance

1. Keep the 115 existing contract/security tests, but replace brittle source
   regex assertions with behavior tests as modules become directly testable.
2. Add reducer/hook tests for session restore, chat updates, pairing loss,
   permission apply/deny, preview approval, persistence flush, and cloud retry.
3. Add React Native interaction tests for auth, chat send, folder proposal,
   project selection, billing, profile, and edit approval.
4. Add a small device smoke suite for login, desktop connection prompt, project
   open, chat, preview, background/foreground lock, and sign-out.
5. Final checks: zero mobile files over 200 lines, strict typecheck, lint, all
   tests, clean iOS and Android exports, dark/light screenshots, permission
   matrix, and before/after bundle/performance report.

## Style Cascade Implementation

- Workspace styles now compose ordered semantic sources through
  `src/screens/workspace/styles/workspaceStyleSources.ts`; onboarding uses the
  matching `onboardingStyleSources.ts` registry.
- `workspaceStyleCascade.test.mjs` and its fixture protect all 1,411 workspace
  definitions, 1,339 resolved keys, winning-source order, dark values, light
  transforms, `setStylesScheme`, and themed Proxy enumeration/access.
- Numbered workspace/onboarding style modules were replaced with feature-owned
  modules; mixed boundaries were split without changing resolved values or
  merge order.
- Duplicate style definitions remain intentionally ordered for visual
  compatibility. Resolve those collisions only in a separately reviewed visual
  change, updating the cascade fixture deliberately.

## Batch Order And Safety

Execute one behavior-preserving batch at a time: gates, dead code, API and
persistence, app state/context, workspace/chat, community/publishing, styles,
then measured runtime work. Do not mix redesigns with structural refactors.
Preserve edit apply/deny, preview-start approval, desktop trust scope, billing
confirmation, secure token storage, and public URL policy in every batch.

## Completion Definition

The mobile optimization is complete only when the scoped line gate reports
zero offenders, no generic numbered production modules remain, all checks exit
cleanly, critical phone flows pass on device, and runtime changes have recorded
before/after evidence. Desktop and backend source are not part of this plan.

## 2026-07-17 Implementation Result

- `npm run mobile:lines`, `test:mobile`, and `check:mobile` now enforce the
  complete `App.tsx` + `src/` phone scope, including tests/platform variants.
- `node scripts/check-source-lines.mjs --summary --scope scripts/source-scopes/mobile.json --limit 200`
  is the canonical compact hierarchy report. It uses the enforcement scope and
  physical-line definition, groups code by mobile area, and separates application
  source from tests/test support.
- All 569 current mobile source/test files are at or below 200 lines; the gate
  reports zero offenders. No `partNN` or `chunkNN` filenames remain.
- API, streaming, hosted-demo, app-state, auth, local-chat, workspace, community,
  preview, domain-type, and test facades now delegate to behavior-named modules.
- Account and desktop state/actions use narrow memoized contexts for isolated
  consumers; the mixed workspace continues through the compatibility facade.
- Safety coverage increased from 115 to 125 passing tests, including pairing's
  phone-confirm step, project-scoped approvals, preview allow/deny, secret
  clearing, domain-context boundaries, and the complete style cascade.
- Workspace/onboarding style registries preserve all existing dark/light values,
  last-writer winners, `setStylesScheme`, and Proxy behavior. The 61 duplicate
  names remain deliberately fixture-protected rather than visually changed.
- Direct Ionicons entrypoints reduced the clean iOS export from 38 to 20 assets,
  1,643 to 1,636 modules, 25.65 MB to 21.83 MB total, and about 4.50 MB to
  4.20 MB for the Hermes bundle. Android exports cleanly at 20 assets, 1,634
  modules, 21.84 MB total, and about 4.21 MB Hermes.
- Confirmed unreachable legacy running-build, billing-card, old shared-shell,
  preview-probe, deep-research-card, and feedback modules were removed.
  Onboarding/welcome were retained because their persisted/server/IAP contracts
  remain active and deleting them would require a separate product decision.
- PNG recompression, persistence debouncing, and chat virtualization were not
  applied: no native visual/lifecycle/profile evidence justified those higher-
  risk behavior changes. Their measured baselines remain documented for a
  future isolated performance pass.

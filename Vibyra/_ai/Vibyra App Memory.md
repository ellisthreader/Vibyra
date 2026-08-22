# Vibyra App Memory

Scope: shared Expo React Native product client in `src/`, with the native phone
app as the primary surface and React Native Web as its browser runtime.

Use this as the app index only. For app work, read this file plus exactly one focused app note from `Vibyra/_ai/App/` unless the task clearly crosses topics.

## Mental Model

The app is the phone-side command center for onboarding, pairing with Vibyra Desktop, project/file selection, chat prompts, live preview, billing/profile, and cloud account sync.

See [[Product Surfaces]] before treating the Expo browser build as the public
marketing website; they are separate surfaces.

## Composition

`src/context/AppContext.tsx` wires the app store and action hooks:

- `useRequests`: desktop/backend request helpers.
- `useLogActions`: activity feed helpers.
- `useWorkspaceActions`: project, file, preview, and local chat actions.
- `usePairingActions`: phone-to-desktop pairing.
- `useAgentActions`: prompt submission to desktop or backend chat.
- `useLiveSync`: desktop event polling.
- `useCloudSync`: remote account/app-state persistence.

## Focused Notes

- AI chat overview/router: `App/AI Live Chat.md`
- Prompt routing, project briefs, reasoning effort: `App/Chat Prompt Routing.md`
- Slash commands and local/backend AI skills: `App/Chat Slash Commands.md`
- Chat rendering, streaming, code blocks, visual polish: `App/Chat Rendering UI.md`
- Edit approval, changed-files cards, run artifacts: `App/Chat Code Changes.md`
- Detached chat folder/project intent routing: `App/Detached Chat Routing.md`
- Preview cards, in-app WebView, blank preview fixes, view-preview intent: `App/Live Preview.md`
- Pairing, reconnect, PC reachable/not reachable, desktop discovery: `App/Pairing And Connection.md`
- Project selection, folder search, detached/project chat ownership: `App/Workspace Projects.md`
- Cloud sync, account state, background API offline gate: `App/Cloud Sync.md`
- Profile tab, billing sheets, model gating UI: `App/Profile Billing.md`
- Bottom nav, major UI entry points, visual routing: `App/Navigation UI.md`
- App Store/Google Play release configuration and policy blockers: `App/App Store Production Readiness.md`
- Cross-domain mobile cybersecurity blockers and verification: `App/Mobile Cybersecurity Review.md`
- Ordered implementation, rollout flags, evidence, and launch gates: `App/Production Security Roadmap.md`
- Short-form product clarity, visual hook, and mobile frontend design checks: `App/Short-Form Frontend Design Principles.md`
- Phone-only source organization, line-gate remediation, context ownership, and measured runtime work: `App/Mobile Code Optimization Plan.md`

## Source Entry Points

- `App.tsx`: top-level app entry.
- `src/context/AppContext.tsx`: compact provider that composes focused action hooks.
- `src/context/useAppState.ts`: compatibility store coordinator. Account, desktop, workspace/runtime,
  and chat ownership lives in `useAccountState.ts`, `useDesktopState.ts`,
  `useWorkspaceRuntimeState.ts`, and `useChatState.ts`; `useAppStatePersistence.ts`
  remains the single complete-session persistence coordinator.
- `AccountContexts.tsx` and `DesktopContexts.tsx` provide memoized session, usage,
  connection, permission, and semantic-action subscriptions for isolated leaves.
  `useAppContext` remains the workspace compatibility facade during incremental migration.
- `src/screens/WorkspaceScreen.tsx`: main workspace shell.
- `src/screens/OnboardingScreen.tsx`: onboarding orchestration.
- `src/styles/theme.ts`: shared design tokens.

## Code Organization Standard

The hard app standard is 200 lines per first-party source/test file. The
2026-07-17 implementation cleared all 22 offenders; `npm run mobile:lines`
checks `App.tsx` plus `src/`, including tests and platform variants. Generated
and vendor/tool folders remain excluded. See `App/Mobile Code Optimization Plan.md`.

`AppContext.tsx` should stay a coordinator. Keep action families in focused hooks such as `useAuthContextActions`, `useEditPermissionActions`, `useLocalChatActions`, `useAgentActions`, `usePairingActions`, and `useWorkspaceActions`.

Workspace screen behavior is split similarly: `useWorkspaceActions.ts` is a coordinator, while prompt routing, folder proposal handling, and chat runtime helpers live in `workspacePromptActions.ts`, `workspaceFolderActions.ts`, and `workspaceChatRuntime.ts`.

## Token Rule

Do not add feature-specific detail here. Add durable facts to the smallest focused note above and keep this index under about 60 lines.

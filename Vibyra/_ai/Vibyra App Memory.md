# Vibyra App Memory

Scope: Expo React Native mobile app in `src/`.

Use this as the app index only. For app work, read this file plus exactly one focused app note from `Vibyra/_ai/App/` unless the task clearly crosses topics.

## Mental Model

The app is the phone-side command center for onboarding, pairing with Vibyra Desktop, project/file selection, chat prompts, live preview, billing/profile, and cloud account sync.

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

- AI live chat, prompt routing, slash commands, typing animation, changed-files cards: `App/AI Live Chat.md`
- Preview cards, in-app WebView, blank preview fixes, view-preview intent: `App/Live Preview.md`
- Pairing, reconnect, PC reachable/not reachable, desktop discovery: `App/Pairing And Connection.md`
- Project selection, folder search, detached/project chat ownership: `App/Workspace Projects.md`
- Cloud sync, account state, background API offline gate: `App/Cloud Sync.md`
- Profile tab, billing sheets, model gating UI: `App/Profile Billing.md`
- Bottom nav, major UI entry points, visual routing: `App/Navigation UI.md`

## Source Entry Points

- `App.tsx`: top-level app entry.
- `src/context/AppContext.tsx`: composition and exposed actions.
- `src/context/useAppState.ts`: central state.
- `src/screens/WorkspaceScreen.tsx`: main workspace shell.
- `src/screens/OnboardingScreen.tsx`: onboarding orchestration.
- `src/styles/theme.ts`: shared design tokens.

## Token Rule

Do not add feature-specific detail here. Add durable facts to the smallest focused note above and keep this index under about 60 lines.

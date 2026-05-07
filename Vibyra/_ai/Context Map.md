# Context Map

Use this map to choose the smallest useful context.

## Mobile App Work

Read: `Vibyra App Memory.md`

Start files:

- `src/context/AppContext.tsx`
- `src/context/useAgentActions.ts`
- `src/context/usePairingActions.ts`
- `src/context/useWorkspaceActions.ts`
- `src/screens/WorkspaceScreen.tsx`
- `src/screens/OnboardingScreen.tsx`

## Desktop Bridge Work

Read: `Vibyra Desktop Memory.md`

Start files:

- `desktop/local-app.mjs`
- `desktop/lib/routes.mjs`
- `desktop/lib/state.mjs`
- `desktop/lib/pairingHandlers.mjs`
- `desktop/lib/agent.mjs`
- `desktop/lib/projects.mjs`
- `desktop/lib/preview.mjs`

## Pairing Or Connection Bugs

Read both app and desktop memory notes.

Key files:

- `src/context/usePairingActions.ts`
- `src/context/pairingDiscovery.ts`
- `src/context/pairingScans.ts`
- `src/utils/network.ts`
- `desktop/lib/pairingHandlers.mjs`
- `desktop/lib/state.mjs`
- `desktop/lib/discovery.mjs`

## Agent Or Prompt Flow

Read both app and desktop memory notes.

Key files:

- `src/context/useAgentActions.ts`
- `src/context/agentTypes.ts`
- `desktop/lib/agent.mjs`
- `desktop/lib/routes.mjs`

## Backend Or Account Work

Read: `Vibyra Backend Memory.md`

Start files:

- `backend/routes/web.php`
- `backend/app/Http/Controllers/VibyraDesktopController.php`
- `backend/app/Http/Controllers/Concerns/ChatEndpoint.php`
- `backend/app/Http/Controllers/Concerns/ChatPrompting.php`
- `backend/app/Http/Controllers/Concerns/ChatModelMap.php`
- `backend/app/Services/Concerns/OpenAiStreaming.php`
- `backend/config/services.php`
- `src/utils/appApi.ts`
- `src/context/useCloudSync.ts`

## OpenRouter Cost / Token Tuning

Read: `Vibyra Backend Memory.md` → "Token Cost Controls".

Start files:

- `backend/app/Http/Controllers/Concerns/ChatEndpoint.php` (`max_completion_tokens` cap)
- `backend/app/Http/Controllers/Concerns/ChatPrompting.php` (`isBuildPrompt`, `systemPrompt`, `chatHistoryMessages`)
- `src/context/useAgentActions.ts` (frontend payload trimming)

## Style Or UI Work

Start files:

- `src/styles/theme.ts`
- `src/components/`
- `src/screens/WorkspaceScreen.tsx`
- `src/screens/onboarding/`
- `src/screens/workspace/styles/`

Known current typecheck noise: several `src/screens/workspace/styles/part*.ts` files reference missing `Platform` and `communityDetailAccent`.

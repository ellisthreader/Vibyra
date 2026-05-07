# Architecture

## App Layer

The Expo app owns the mobile UI and app state. `AppProvider` composes smaller hooks:

- `useAppState`: state, setters, derived selections.
- `useRequests`: desktop request helper.
- `usePairingActions`: desktop pairing workflow.
- `useWorkspaceActions`: project/file loading and workspace mutations.
- `useAgentActions`: user prompt flow into either desktop agent or backend chat.
- `useLiveSync`: polls desktop events and preview state.
- `useCloudSync`: saves account/app state remotely when authenticated.

## Desktop Bridge

The desktop process exposes local HTTP routes for:

- pairing and health checks;
- desktop approval/deny/quit;
- project discovery;
- preview serving;
- agent task starts;
- allowed command execution.

Route entrypoint: `desktop/lib/routes.mjs`.

## Agent Flow

`src/context/useAgentActions.ts` builds an optimistic mobile agent record, sends the prompt to the paired desktop at `/agents/start` when connected, or to backend chat when not connected.

Desktop local flow currently writes a Markdown run artifact and preview HTML from `desktop/lib/agent.mjs`.

If an Obsidian vault is found, the desktop flow also writes a compact run note to `_ai/Runs/`.

## Backend Layer

Laravel app at `backend/`. Controllers compose trait-based concerns under `app/Http/Controllers/Concerns/`:

- `ChatEndpoint` (`POST /api/chat`): credit check → OpenRouter call with `max_completion_tokens` cap → credit deduction → runnable-app extraction.
- `ChatPrompting`: builds the OpenRouter `messages`. Slim system prompt by default; expanded only when `isBuildPrompt()` matches build-style prompts. Truncates history and `fileBody`.
- `ChatModelMap`: Vibyra model key → OpenRouter model id, plus per-model credit cost.
- `OpenAiStreaming` (`Services/Concerns/`): shared OpenRouter call helper for streaming agent runs; classifies HTTP errors into user-facing strings.
- `AgentExecution`, `AgentLocking`: streaming desktop-agent run path and per-project run lock.

Token budget rule: every OpenRouter call sets `max_completion_tokens` (800 chat / 3000 build). The same `isBuildPrompt` regex is mirrored in `src/context/useAgentActions.ts` so the frontend trims its payload to match.

## Obsidian Memory

The vault lives at `Vibyra/`. Durable project memory should live under `Vibyra/_ai/`.

Keep `Project Context.md` short. Move detailed history into focused notes and link them.

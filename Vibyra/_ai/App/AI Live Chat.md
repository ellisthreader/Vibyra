# App - AI Live Chat

Read this first for mobile AI chat work. Use it as a router; open only one subtopic note unless the task crosses chat boundaries.

## Start Files

- `src/context/useAgentActions.ts`
- `src/context/agentTypes.ts`
- `src/context/agentErrors.ts`
- `src/context/useAppState.ts`
- `src/screens/workspace/inline/chunk9.tsx`
- `src/screens/workspace/inline/chunk23.tsx`
- `src/screens/workspace/inline/ChatAttachmentSheet.tsx`
- `src/screens/workspace/inline/SlashCommandMenu.tsx`
- `src/screens/workspace/data/chatCommands.ts`
- `src/utils/chatStream.ts`

## Subtopic Notes

- Prompt routing, cloud vs desktop, project briefs, reasoning effort: `App/Chat Prompt Routing.md`
- Slash commands and local/backend AI skills: `App/Chat Slash Commands.md`
- Streaming, message rendering, code blocks, visual chat polish: `App/Chat Rendering UI.md`
- Edit approval gate, changed-files cards, run-artifact filtering: `App/Chat Code Changes.md`
- Detached chat folder/project intent handling: `App/Detached Chat Routing.md`
- Error copy, session expiry, transport failures: this note, "Error Copy" section.

## Core Mental Model

`useAgentActions.startAgent` is the main send path. It creates optimistic chat rows, chooses cloud chat vs desktop agent behavior, streams the assistant reply, records generated previews/files/changes, and updates credits/logs.

Cloud `/api/chat` is the real AI generation path for normal chat and build prompts. The Node desktop `/agents/start` route is not a general AI generator; do not route arbitrary app/site/game creation to local desktop templates.

Project chat context should be explicit. Detached chat is a separate thread; project-scoped code/chat behavior starts only after a folder/project is selected or created.

Project chats with `briefRequired` must never render an empty required-setup state. `src/screens/workspace/inline/chunk9.tsx` shows `ProjectBriefSetup` automatically when setup is required and the thread does not already contain a project brief setup/analysis prompt; otherwise the composer is hidden with visible confirmation/setup UI.

The composer keeps attachment and AI controls grouped on the left side of the input footer. `src/screens/workspace/inline/ChatComposer.tsx` opens one combined model/effort dropdown; `ChatComposerMenus.tsx` keeps the selected model title at the top and lets users pick reasoning effort there before choosing a model row.

The attach button opens `src/screens/workspace/inline/ChatAttachmentSheet.tsx`, a bottom sheet that starts around half-screen and expands taller when the user scrolls the action list. Camera/photos use `expo-image-picker`, files use `expo-document-picker`, and selected assets currently append contextual text to the composer because the chat send path does not yet carry binary attachment payloads. Keep mobile permission copy aligned in `app.json` when adding new picker actions.

Attachment tool rows use structured modes from `src/types/chatTools.ts`, not visible slash text. `ChatComposer.tsx` stores the selected mode and passes it through `ChatStartOptions`; `workspacePromptActions.ts` maps research/web/analyze to backend skill IDs and create-image to the existing `/api/community/assets/generate` path, rendering the result with `GeneratedImageCard.tsx`. Backend skill definitions live in `backend/config/skills.php`; research/web enable the OpenRouter `web` plugin in `ChatEndpoint.php` and `ChatStreamEndpoint.php` via `ChatEndpointHelpers::shouldUseWebPlugin`.

## Error Copy

Chat should not show raw transport/provider errors like `HTTP 401`, `502 Bad Gateway`, or `Failed to fetch`. `src/context/agentErrors.ts` maps desktop/backend failures to user-facing recovery text while raw messages stay in logs.

Desktop-agent "already running" errors mean the backend single-run guard still sees a previous request. Backend `/agents/start` clears `activeAgentRun` entries older than 240s before rejecting, `/events` also recovers stale state, and missing/invalid run timestamps are stale immediately. Busy responses include run metadata; mobile preserves it through request errors and `MessageBubble` renders `AgentBusyCard` with project, prompt, model, elapsed time, and reason. If an older/plain busy error arrives without backend payload, `useAgentChatMessages.failAgent` builds fallback busy context from the attempted target and optimistic agent so the same card still renders instead of only plain text. Relevant backend files: `StatePersistence.php`, `AgentExecution.php`, `AgentLocking.php`, `ProjectFileState.php`; relevant app files: `useRequests.ts`, `agentErrors.ts`, `useAgentChatMessages.ts`, `AgentBusyCard.tsx`.

App-session 401s are distinct from desktop 401s. `appApiRequest` throws `AppApiError`; `isAppSessionExpiredError`, `useSessionValidation`, `useCloudSync`, and `useAgentActions` expire app auth without wiping local workspace/chat state. Desktop-token expiry should only disconnect the paired PC.

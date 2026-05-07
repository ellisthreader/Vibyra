# Vibyra App Memory

Scope: Expo React Native mobile app in `src/`.

## Mental Model

The app is the phone-side command center. It handles onboarding, pairing with Vibyra Desktop, project/file selection, chat prompts, live preview state, and cloud account sync.

## State Composition

`src/context/AppContext.tsx` is the main composition point. It creates `store` from `useAppState`, then wires:

- `useRequests`: desktop and backend request helpers.
- `useLogActions`: activity feed helpers.
- `useWorkspaceActions`: project/file/preview actions.
- `usePairingActions`: phone-to-desktop pairing flow.
- `useAgentActions`: prompt submission to desktop or backend chat.
- `useLiveSync`: desktop event polling.
- `useCloudSync`: remote account/app-state persistence. Debounced 700ms; on failure backs off 30s before retrying so it does not spam `ERR_CONNECTION_REFUSED` when the backend is down. Logs "Saved locally" once per outage.

## Prompt Flow

`src/context/useAgentActions.ts`:

- trims `state.taskText`;
- creates optimistic chat and agent records;
- adds prompt-money credit;
- if paired, sends `/agents/start` to the desktop bridge;
- otherwise sends `/api/chat` to the backend app;
- updates chat, files, changes, preview state, logs, and credits from the response.

For backend chat, the payload is trimmed for cost: a regex (`isBuildPrompt`) detects build intent. Non-build prompts skip `fileBody` entirely and send only the last 3 history messages capped at 600 chars each. Build prompts send 4 × 1200 chars and a 1200-char file slice. The same regex lives server-side in `ChatPrompting::isBuildPrompt`; keep them in sync. See `Vibyra Backend Memory.md` for `max_completion_tokens` and system prompt rules.

Assistant replies render with a typing animation. `useAgentActions.streamAssistantMessage` tokenizes the full reply into word+whitespace chunks, sets the assistant message text incrementally with 15–45ms randomized delays, and appends a `▍` cursor until done. Both `finishOpenRouterAgent` and `finishRealAgent` use it; errors and the "Working on it..." placeholder bypass it via `updateAssistantMessage`. New prompts cancel any in-flight stream via `streamingRef`. The full HTTP response still arrives in one shot — this is purely a render-side effect. Auto-scroll during growth is handled by `onContentSizeChange` on the chat ScrollView in `src/screens/workspace/inline/chunk9.tsx`. The `TypingIndicator` (animated three-dot) in `chunk23.tsx` shows only while `text === "Working on it..."` — once the first streamed chunk lands the indicator is replaced by `RichMessageText`.

Chat threads are scoped by project id in `src/context/useAppState.ts` (`chatThreads: Record<projectId, ChatMessage[]>`). The workspace chat page anchors its active chat id to `project-${selectedProject.id}` so starting or clearing a chat affects only the selected project.

Two independent state atoms drive chat rendering:

1. `selectedProjectId` (in `useAppState`) — drives `app.chatMessages = chatThreads[selectedProjectId]` and is the closure id used by `setChatMessages` writes from `useAgentActions`.
2. `selectedChatId` (in `src/screens/workspace/hooks/useWorkspaceState.ts`) — `null` for the detached "new chat" page, or `"project-<id>"` for a project's chat.

`visibleChatMessages` (renderer) **reads from `selectedChatId`**, not `selectedProjectId`: `app.chatThreads[selectedChatProjectId] ?? []` when a project chat is selected. This avoids a race during `createProjectAndOpenChat` where the two ids briefly disagree and the prior project's thread would otherwise leak through. The auto-snap effect (`src/screens/workspace/hooks/useWorkspaceActions.ts:36-40`) keeps `selectedChatId` aligned with `selectedProjectId` after commit, so agent writes (still keyed by `selectedProjectId`) land in the visible thread in steady state.

Agent/chat ownership contract: `app.startAgent(target?)`, `app.addLocalChatReply(..., target?)`, and `app.clearCurrentChat(projectId?)` can operate on an explicit project/chat target. Workspace flows that adopt/find a desktop folder should pass that target instead of relying on the current render's `selectedProjectId` closure. `useLiveSync` only mirrors `selectedProjectId` while an active desktop agent run reports the same project, so stale `/events` state should not yank the visible chat back to an older project.

Project creation (`src/context/useWorkspaceActions.ts::createProject` and `createLocalProject`) explicitly initializes `chatThreads[newId] = []` and seeds `chatTitles[newId]`. Without this, stale persisted entries or re-used ids could resurrect old conversations in freshly-made projects. Backend project ids come from `base64url(diskPath)` with `-2`/`-3` suffixes for collisions (`backend/app/Services/Concerns/ProjectFileState.php`), so true id collisions are rare — the init is defensive.

Desktop/project lookup prompts such as "find project X on my desktop" should stay in the local desktop search flow. `WorkspaceScreen.tsx` extracts the folder name, calls `/desktop/search`, selects the matching project, and writes a local chat reply instead of falling through to `/agents/start`.

If a prompt references local desktop folders/projects while Vibyra Desktop is not connected, the mobile app should answer locally with a pairing/connection instruction. Do not send that prompt to backend/cloud chat, because cloud chat cannot access local files.

Opening AI Chat from the bottom nav or dashboard is a detached new chat and must not show the last selected project thread. Project chat context should appear only after explicitly opening/selecting a folder/project.

Chat should never show raw transport/provider errors like `HTTP 401`, `502 Bad Gateway`, or `Failed to fetch` as the assistant reply. `useAgentActions.ts` maps desktop/backend failures to user-facing recovery text, while preserving the raw message in logs.

Paired desktop agent runs use OpenRouter via `OPENROUTER_API_KEY`; they should not require `OPENAI_API_KEY`. The desktop backend maps Vibyra model keys to OpenRouter model ids before sending the agent request.

## Pairing Flow

`src/context/usePairingActions.ts`:

- scans Wi-Fi candidates for a matching desktop pair code;
- posts `/pair`;
- waits on `/pair/status`;
- stores `{ url, token, machineName }` as `connection`;
- loads desktop projects and first project files after approval.
- persists the desktop bearer token locally in remembered desktops for fast reconnect, but `useCloudSync` strips that token before sending remembered desktops to the cloud API.

Supporting files:

- `src/context/pairingDiscovery.ts`
- `src/context/pairingScans.ts`
- `src/context/pairingHelpers.ts`
- `src/utils/network.ts`

## Workspace Flow

`src/context/useWorkspaceActions.ts` selects projects/files, starts previews, and calls desktop file/project routes when a connection exists.

Current caveat: desktop routes do not yet expose every route this hook expects, such as `/files`, `/files/read`, `/files/create`, or `/projects/create`.

## UI Entry Points

- `App.tsx`: top-level app entry.
- `src/screens/WorkspaceScreen.tsx`: main workspace experience.
- `src/screens/OnboardingScreen.tsx`: onboarding orchestration.
- `src/components/`: reusable UI panels and controls.
- `src/styles/theme.ts`: shared colors, spacing, and typography tokens.

## Token Hints

For mobile tasks, start with this note plus `AppContext.tsx` and the one relevant hook. Avoid opening all screen/style parts unless the task is visual.

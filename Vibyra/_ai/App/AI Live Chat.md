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
- `src/screens/workspace/hooks/workspacePromptActions.ts`
- `src/screens/workspace/hooks/workspacePromptFileFolderActions.ts`
- `src/screens/workspace/hooks/workspacePromptRouting.ts`
- `src/screens/workspace/hooks/workspaceToolActions.ts`
- `src/screens/workspace/hooks/workspaceDetachedToolActions.ts`
- `src/screens/workspace/hooks/workspaceImageToolActions.ts`
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

Detached chat uses local helpers before backend AI. `src/screens/workspace/helpers/chatReplies.ts` handles greetings, help, confusion, small talk, preview asks, and fallback copy; `chatPrompts.ts` handles folder/file/current-project intent; `src/screens/workspace/hooks/workspacePromptActions.ts` applies those helpers before starting an agent. Keep common human variants covered there first: repeated greetings, typo thanks, `where am i rn`, `open App.tsx`, folder typos such as `foler`, and cancel phrases while waiting for a folder name. Project chat also short-circuits small talk, current-project/file-list questions, file-open requests, and supported terminal commands before spending an AI request.

New detached chats are promoted into persisted recent chats as soon as the first message is appended. `src/screens/workspace/hooks/workspaceDetachedChats.ts` creates `detached-*` chat IDs and updates `detachedChatThreads`, `detachedChatTitles`, and `detachedChatUpdatedAt` in app state; `src/screens/workspace/helpers/chatHeaderActions.ts` merges detached and project chats for the primary menu. Do not leave active detached conversations only in `newChatMessages`, because that state is for a blank unsaved draft and can be lost.

Detached cloud tools must not apply a full returned `RemoteUser.appState` after completion. Use `applyRemoteUsage` for credits/level only in tool result handlers; full `applyRemoteUserFromIap` can overwrite the just-created local detached thread with stale backend app state and make the chat look like it closed into a new blank chat.

The composer keeps attachment and AI controls grouped on the left side of the input footer. `src/screens/workspace/inline/ChatComposer.tsx` owns the live composer state, `/open` command handling, tool-plan preview handoff, attachment state, model/tool tag, and bottom-left PC permission control. Keep those live controls in this component unless there is a renderer-level test for the replacement. `ChatComposerMenus.tsx` keeps the selected model/tool title at the top and lets users pick reasoning effort before choosing a normal model row. Active tools should use the same clean bottom-left model/tool tag pattern that Deep Research established, not a separate top-of-composer pill: Deep Research, Agent Web Search, Analyze Files, and Generate Screenshot each get a configured title, icon, translucent accent, and send-button gradient from `chatAttachmentTools.ts`. Tool-only chat models for research/web/analyze hide the manual effort selector because effort is automatic. Generate Screenshot is not a chat model key; it only uses the shared visual treatment while routing through the image-generation path. Starting Deep Research calls authenticated `POST /api/chat/research-plan` first to get a cheap Gemini Flash Lite topic-specific plan, then `ChatComposer.tsx` lifts a pending preview into `AIChatPage` so `DeepResearchPlanCard.tsx` appears inline at the bottom of the scrollable chat stream, not as a modal or top composer pill. The card uses the fixed lead verbs Collect, Extract, Analyse, Correlate, and Summarise; it counts down from 60 seconds and offers Edit, Cancel, or Start before the paid research request is sent. If the planner endpoint fails, `DeepResearchPlanCard.buildDeepResearchPlan()` is only a fallback. The accepted plan is included in the submitted chat prompt so it appears in the actual chat thread and guides the research run.

While a paid Deep Research request is running, `ChatToolActivityCard.tsx` renders a compact `Research in progress` card with elapsed time and timed estimated stages: Preparing research, Searching sources, Reviewing findings, Drafting response. These are intentionally labelled as estimated frontend stages because OpenRouter does not expose reliable per-source/internal progress events. Do not present them as exact telemetry such as a specific site being read unless the backend later provides real events.

The attach button opens `src/screens/workspace/inline/ChatAttachmentSheet.tsx`, a bottom sheet that starts around half-screen and expands taller when the user scrolls the action list. Camera/photos use `expo-image-picker` with bounded base64 data URLs and return `ChatImageAttachment` objects; `ChatComposer.tsx` keeps image/file attachments as removable visual cards and passes them through `ChatStartOptions` as structured data, not as filename text appended to the prompt. Sent user messages can carry `ChatMessage.attachments`, and `ChatImageAttachmentPills.tsx` renders actual image thumbnails or compact file cards with name/type/size in the transcript. `workspacePromptActions.ts` passes images only into project chat AI requests, and `useAgentActions.ts` forces image-attached prompts onto cloud `/api/chat` instead of the desktop agent. Backend `ChatEndpointHelpers::chatImageAttachments()` validates up to 3 public HTTPS or bounded PNG/JPEG/WebP/GIF data URLs, and `ChatPrompting::chatMessages()` turns the final user message into OpenRouter text + `image_url` content parts. File attachments send extracted text snippets as `projectFiles` context while the chat UI remains a visual file card. Keep mobile permission copy aligned in `app.json` when adding new picker actions.

Attachment tool rows use structured modes from `src/types/chatTools.ts`, not visible slash text. `ChatComposer.tsx` stores the selected mode and passes it through `ChatStartOptions`; `workspacePromptActions.ts` maps research/web/analyze to backend skill IDs and create-image to the existing `/api/community/assets/generate` path, rendering the result with `GeneratedImageCard.tsx`. `parseChatToolSlash()` turns `/web`, `/search`, `/research`, `/analyze`, `/analyse`, `/anaylze`, `/image`, `/generate`, and `/screenshot` into structured tool starts with cleaned prompt text; Analyze Files also has a default project-analysis prompt when launched from the tool menu with an empty composer. Research, web search, and analyze files all have forced tool-only model keys from `chatToolModelOverride`: `tool-deep-research`, `tool-web-search`, and `tool-analyze-files`. `ChatComposer.tsx` shows the active tool model label, sends that key while the tool or matching slash command is active, then restores the previous selected model when the tool tag is cleared or sent. Tool-only model keys must stay out of `chatModelGroups` so they cannot be selected from the normal dropdown; keep their labels in `toolOnlyChatModelOptions`/`chatModelOptionFor` only for active-tool and message display. Backend maps the tool keys to budget Gemini Flash Lite, not O3 or premium OpenAI, so keep labels generic and do not expose provider internals in app UI. Backend skill definitions live in `backend/config/skills.php`; research/web enable the OpenRouter `web` plugin in `ChatEndpoint.php` and `ChatStreamEndpoint.php` via `ChatEndpointHelpers::webSearchTools`. Native phone `/api/chat` calls allow a longer timeout than ordinary API requests so long-running tools can finish when streaming is unavailable; web/analyze streams get an intermediate timeout, and Deep Research gets the longest timeout in `src/utils/appApiStream.ts`.

`workspacePromptActions.ts` should stay a coordinator. Folder/file prompt handling lives in `workspacePromptFileFolderActions.ts`, detached attachment routing lives in `workspacePromptRouting.ts`, detached cloud tool runs live in `workspaceDetachedToolActions.ts`, and image generation lives in `workspaceImageToolActions.ts`.

Detached chat may analyze explicitly attached files without first opening a project chat. In `workspacePromptActions.ts`, a detached send with `fileAttachments` and no selected tool routes through the Analyze Files cloud tool automatically, preserving file cards in the transcript and sending extracted snippets as `projectFiles`. This is only for user-attached files; desktop project context still requires a selected/opened project.

Create image is separate from attached-image understanding. The `image` tool calls `/api/community/assets/generate`, which uses `CommunityAssetGenerator` and `services.openrouter.image_model` (default `openai/gpt-5.4-image-2`) to produce a generated image card and charge image credits only after success. Keep this route distinct from multimodal chat; do not overload `ChatToolMode.image` to mean "analyze attached image."

## Error Copy

Chat should not show raw transport/provider errors like `HTTP 401`, `502 Bad Gateway`, or `Failed to fetch`. `src/context/agentErrors.ts` maps desktop/backend failures to user-facing recovery text while raw messages stay in logs.

Desktop-agent "already running" errors mean the backend single-run guard still sees a previous request. Backend `/agents/start` clears `activeAgentRun` entries older than 240s before rejecting, `/events` also recovers stale state, and missing/invalid run timestamps are stale immediately. Busy responses include run metadata; mobile preserves it through request errors and `MessageBubble` renders `AgentBusyCard` with project, prompt, model, elapsed time, and reason. If an older/plain busy error arrives without backend payload, `useAgentChatMessages.failAgent` builds fallback busy context from the attempted target and optimistic agent so the same card still renders instead of only plain text. Relevant backend files: `StatePersistence.php`, `AgentExecution.php`, `AgentLocking.php`, `ProjectFileState.php`; relevant app files: `useRequests.ts`, `agentErrors.ts`, `useAgentChatMessages.ts`, `AgentBusyCard.tsx`.

App-session 401s are distinct from desktop 401s. `appApiRequest` throws `AppApiError`; `isAppSessionExpiredError`, `useSessionValidation`, `useCloudSync`, and `useAgentActions` expire app auth without wiping local workspace/chat state. Desktop-token expiry should only disconnect the paired PC.

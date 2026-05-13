# App - Chat Prompt Routing

Read this for prompt submission, cloud vs desktop routing, project briefs, model selection, and reasoning effort.

## Files

- `src/context/useAgentActions.ts`
- `src/context/useAgentChatMessages.ts`
- `src/context/useAgentResultHandlers.ts`
- `src/context/agentActionHelpers.ts`
- `src/context/useProjectBriefActions.ts`
- `src/context/useWorkspaceFileActions.ts`
- `src/utils/projectBriefs.ts`
- Backend sync: `backend/app/Http/Controllers/Concerns/ChatEndpoint.php`, `ChatEndpointHelpers.php`, `ChatPrompting.php`

## Routing Rules

`useAgentActions.startAgent` trims `state.taskText`, creates optimistic chat/agent records, adds prompt-money credit, sends cloud `/api/chat` for real AI generation, then updates chat, files, preview state, logs, and credits.

Detached/new-chat startup remains active: Vibyra can answer greetings, help find/open/create project folders, and guide the user into a project. Project creation prompts add a local Vibyra response after opening the new project so the flow never goes silent while the setup brief is pending. Once `selectedChatId` is an actual `project-*` chat, plain composer text does not call the AI route; `useWorkspacePromptActions.onStartChat` adds a local Vibyra idle notice and only calls `startAgent` for known slash AI skills (for example `/plan`, `/debug`, `/design`, `/explain`) or slash command flows such as `/publish`. The local idle notice must pass `file: null` so normal messages do not show a selected-file label under the user name. Direct explicit AI surfaces such as preview edit mini-chat may still call `startAgent` with generated prompts.

Paired desktop does not mean every activated AI prompt edits code. When Vibyra is activated with a slash skill, treat normal conversation as default. Only explicit edit/apply requests should use desktop edit pathways; questions, explanations, and open-ended discussion use `/api/chat`.

Build/create-site prompts are project-scoped even when a file is selected. Do not prefix them with `In <file>:` or send selected-file context, otherwise prompts like "create a real estate website" can target `package.json`.

Normal project questions use folder context, not the selected file. `useAgentActions.ts` sends a compact `projectFiles` map built by `agentContextPayload.ts` and uses a message target with `file: null`, so chat bubbles do not show paths like `app/Actions/Fortify/CreateNewUser.php` unless the user explicitly asks about the current/selected file or names that file. When paired to desktop, `agentContextPayload.ts` first asks `/desktop/context?projectId=...&q=...` for prompt-relevant project snippets; if unavailable, it falls back to the loaded mobile file list. Backend `ChatPrompting.php` inserts `Project files:` into the prompt and instructs the model to prefer project/folder context before focusing on one file. Backend `ChatEndpointHelpers::projectFilesContext()` allows a 12k-character project context so the desktop-retrieved snippets are not trimmed too aggressively.

For colour/theme/palette questions, `agentContextPayload.ts` adds small style evidence snippets from relevant loaded or desktop-fetched CSS/theme/component files to the `projectFiles` map. Backend `ChatEndpointHelpers::projectFilesContext()` preserves those snippets under the file entries, so the model can answer the colour scheme from actual values instead of only seeing filenames.

Mobile sends explicit `mode: "chat" | "build"` to `/api/chat`, computed from raw user intent before `withProjectBriefPrompt()` adds project context. Keep this contract in sync with backend `ChatEndpointHelpers::resolveChatMode()`.

Runnable-preview edit prompts must route as build mode. The frontend and backend build-detection target regexes include `preview`, and `AppPreviewMiniChat` sends the current preview HTML with the edit prompt so `/api/chat` updates the existing runnable preview instead of starting from stale or unrelated context. `/api/chat` timeouts should surface as preview-generation timeouts, not as LAN/backend/desktop bridge reachability errors; timeout handling lives in `src/utils/network.ts`, `src/utils/appApi.ts`, and user-facing copy in `src/context/agentErrors.ts`.

## Cost Trimming

Backend chat payloads are cost-trimmed: non-build prompts skip `fileBody` and send only 3 recent history messages capped at 600 chars; build prompts send 4 history messages capped at 1200 chars plus a 1200-char file slice.

Keep the frontend `isBuildPrompt` regex aligned with backend `ChatPrompting::isBuildPrompt` for old clients that omit explicit mode.

## Project Briefs

New projects can require a first-run brief before the composer appears. `ProjectBriefSetup` asks product type, supports **Other**, then asks framework/stack with recommended/custom paths.

`saveProjectBrief` stores `Project.brief`, clears `briefRequired` / `briefRequiredFilePath`, records `briefedFilePaths` only for a real selected file, and sets chat title to `<type> · <framework>`. Project-level completion must not assume `derived.selectedFile` exists.

`useAgentActions.startAgent` wraps prompts with the project brief and instructs the model to plan/review internally while prioritizing code/project output over conversational explanation.

## Reasoning Effort

The composer exposes `low | medium | high | xhigh` through `EFFORT_OPTIONS` in `chunk9.tsx`. `useAgentActions.ts` forwards both `reasoningEffort` and `selectedChatModel` to desktop and `/api/chat`; do not use `selectedModel` for paired desktop agent calls because it only tracks OpenAI-backed `ModelKey` values.

Backend maps reasoning as: `none` suppresses reasoning, `low|medium|high` pass through, and `xhigh` becomes `high` plus a larger reasoning-token budget (`max_tokens: max(maxOutput * 4, 8000)`). Unknown values fall back to `medium`.

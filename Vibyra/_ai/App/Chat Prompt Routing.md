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
- Desktop context: `desktop/lib/projectContext.mjs`
- Backend sync: `backend/app/Http/Controllers/Concerns/ChatEndpoint.php`, `ChatEndpointHelpers.php`, `ChatPrompting.php`

## Routing Rules

`useAgentActions.startAgent` trims `state.taskText`, creates optimistic chat/agent records, adds prompt-money credit, then chooses cloud chat or paired desktop execution. Normal Q&A/advice stays on cloud `/api/chat`; explicit build/edit/fix/refactor/debug/style/preview work on a paired desktop project routes to desktop `/agents/start`.

Detached/new-chat startup remains active: Vibyra can answer greetings, help find/open/create project folders, and guide the user into a project. Once `selectedChatId` is an actual `project-*` chat, plain composer text talks to the selected AI agent via `startAgent`; do not add local Vibyra notices in project chat. Slash commands/skills are still routed through `startAgent` with their skill prompt expansion, and local commands such as `/publish` remain local command flows. Direct explicit AI surfaces such as preview edit mini-chat may also call `startAgent` with generated prompts.

Detached/new-chat `analyze` tool requests do not require an opened project. `workspaceToolActions.ts` sends them directly to `/api/chat` with `skill: "analyze"` and `model: "tool-analyze-files"`; attached images are forwarded as `imageAttachments`, and attached text/code files are converted to `projectFiles` entries via `src/utils/chatFileAttachments.ts`. Backend skill/model override keeps this on the cheap analyze model and normal chat credit charging.

Paired desktop does not mean every activated AI prompt edits code. When Vibyra is activated with a slash skill, treat normal conversation as default. Only explicit edit/apply/build/debug/fix/refactor/style/preview requests use desktop edit pathways; questions, explanations, plans, reviews, publish commands, and open-ended discussion use `/api/chat`.

Build/create-site prompts are project-scoped even when a file is selected. Do not prefix them with `In <file>:` or send selected-file context, otherwise prompts like "create a real estate website" can target `package.json`.

Normal project questions use folder context, not the selected file. `useAgentActions.ts` sends a compact `projectFiles` map built by `agentContextPayload.ts` and uses a message target with `file: null`, so chat bubbles do not show paths like `app/Actions/Fortify/CreateNewUser.php` unless the user explicitly asks about the current/selected file or names that file. When paired to desktop, cloud chat prompts first ask `/desktop/context?projectId=...&q=...` for a broad selected-project file map; `desktop/lib/projectContext.mjs` keeps project scan order for the map and uses prompt ranking only to choose snippet-bearing files, so one subfolder such as `app/Http/Controllers` must not become the apparent project scope. If unavailable, prompts fall back to the loaded mobile file list. Desktop agent prompts also send recent chat history, `projectFiles`, and selected file context when the prompt explicitly targets the current file. Backend `ChatPrompting.php` inserts `Project files:` into the cloud prompt and instructs the model to prefer the whole project/folder shape before focusing on snippets or one file. Backend `ChatEndpointHelpers::projectFilesContext()` allows a 20k-character, 300-entry project context so desktop-retrieved project maps are not trimmed too aggressively.

Natural-language terminal intents are intercepted in `workspacePromptActions.ts` before AI chat. `git status` can run directly through `app.runTerminalCommand`; `npm install`, `npm run dev`, `npm run build`, `npm test`, and `pytest` require a yes/no follow-up before `/commands/run`.

For colour/theme/palette questions, `agentContextPayload.ts` adds small style evidence snippets from relevant loaded or desktop-fetched CSS/theme/component files to the `projectFiles` map. Backend `ChatEndpointHelpers::projectFilesContext()` preserves those snippets under the file entries, so the model can answer the colour scheme from actual values instead of only seeing filenames.

Mobile sends explicit `mode: "chat" | "build"` to `/api/chat`, computed from raw user intent before `withProjectBriefPrompt()` adds project context. Build detection covers direct creation prompts and short follow-ups such as "create it", "make this", and "build that" so project-chat retries stay on the build path. Before `/api/chat`, `appApiReachability.ts` probes `/api/skills` with a short timeout when the backend is not known online; this turns a down Laravel backend into a fast actionable chat error instead of a long optimistic Thinking state. Keep this contract in sync with backend `ChatEndpointHelpers::resolveChatMode()`.

Runnable-preview edit prompts must route as build mode. The frontend and backend build-detection target regexes include `preview`, and `AppPreviewMiniChat` sends the current preview HTML with the edit prompt so `/api/chat` updates the existing runnable preview instead of starting from stale or unrelated context. `/api/chat` timeouts should surface as preview-generation timeouts, not as LAN/backend/desktop bridge reachability errors; timeout handling lives in `src/utils/network.ts`, `src/utils/appApi.ts`, and user-facing copy in `src/context/agentErrors.ts`.

## Cost Trimming

Backend chat payloads are cost-trimmed: non-build prompts skip `fileBody` and send only 3 recent history messages capped at 600 chars; build prompts send 4 history messages capped at 1200 chars plus a 1200-char file slice.

Keep the frontend `isBuildPrompt` regex aligned with backend `ChatPrompting::isBuildPrompt` for old clients that omit explicit mode.

## Project Briefs

New projects can require a first-run brief before the composer appears. `ProjectBriefSetup` asks product type, supports **Other**, then asks framework/stack with recommended/custom paths.

Desktop folder first-open setup is enforced in app context, not only the chat folder proposal UI. `useFirstOpenProjectBrief.ts` runs before `adoptProject` / `selectProject`, adds or updates the project-brief setup chat card, preserves confirmed briefs via `workspaceProjectMemory.ts`, and blocks preview startup until the project purpose/framework is confirmed. Shared setup-card helpers live in `projectBriefSetup.ts`; chat UI helpers such as `desktopFolderAnalysis.ts` should reuse them instead of rebuilding message state.

`saveProjectBrief` stores `Project.brief`, clears `briefRequired` / `briefRequiredFilePath`, records `briefedFilePaths` only for a real selected file, and sets chat title to `<type> · <framework>`. Project-level completion must not assume `derived.selectedFile` exists.

`useAgentActions.startAgent` wraps prompts with the project brief and saved project memory before sending desktop/cloud AI requests. `projectMemories` persist in app state, sync through `/api/session/state`, seed a locked brief entry when `saveProjectBrief` confirms framework direction, and expose user-memory actions even though no current UI calls `rememberProjectMemory` directly. `ProjectMemoryBar` below the composer is a plain circular context meter backed by `chatContextMeter.ts`; it estimates the same frontend request windows against 64K: wrapped prompt, latest 3/4 cloud or 6 desktop history messages with caps, selected-file body when relevant, loaded project file map/snippets, project name, and saved project memory. An idle/new chat with no draft, no non-welcome history, and no saved user memory must show 0 instead of counting project scaffolding. It remains visual only and cannot include backend `chat_learning_memories`, which are fetched server-side. Saved user memory injected into prompts excludes brief entries and uses the latest 6 user entries; chat history remains a separate sliding window. Relevant files: `src/utils/projectMemory.ts`, `src/context/useProjectMemoryActions.ts`, `src/screens/workspace/inline/chatContextMeter.ts`, `src/screens/workspace/inline/ProjectMemoryBar.tsx`, `src/context/useAgentActions.ts`.

## Reasoning Effort

The composer exposes `low | medium | high | xhigh` through `EFFORT_OPTIONS` in `chunk9.tsx`. `useAgentActions.ts` forwards both `reasoningEffort` and `selectedChatModel` to desktop and `/api/chat`; do not use `selectedModel` for paired desktop agent calls because it only tracks OpenAI-backed `ModelKey` values.

Backend maps reasoning as: `none` suppresses reasoning, `low|medium|high` pass through, and `xhigh` becomes `high` plus a larger reasoning-token budget (`max_tokens: max(maxOutput * 4, 8000)`). Unknown values fall back to `medium`.

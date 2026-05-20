# App - Chat Slash Commands

Read this for slash popover behavior, local commands, and AI skills.

## Files

- `src/screens/workspace/data/chatCommands.ts`
- `src/screens/workspace/inline/SlashCommandMenu.tsx`
- `src/screens/workspace/inline/chunk9.tsx`
- `src/utils/chatSkills.ts`
- `src/context/useAgentActions.ts`
- Backend registry: `backend/config/skills.php`

## Local Commands

Local-only commands execute client-side without `/api/chat`, credits, or OpenRouter streaming.

- `/open`: opens `FolderBrowserModal`; selected folder is adopted and `selectedChatId` becomes `project-<folder.id>`.
- `/preview`: opens the active project's runnable Live Preview without `/api/chat`; it prefers the latest displayable chat preview, then project files, then a desktop preview URL only when the URL serves a real static/browser entry.
- `/test`: alias for `/preview`.
- `/new`: clears current chat and returns to detached chat.
- `/clear`: clears current project chat.
- `/help`: streams local help copy.

`matchChatCommand(text)` is the source of truth. It trims, matches `^/(\w+)(?:\s+([\s\S]*))?$`, and looks up lowercase ids. `filterChatCommands(query)` powers the popover.

## Popover UI

`SlashCommandMenu` shows **Commands** (purple icon chip) and **Skills** (yellow sparkle chip) on one shared card surface. Empty sections are omitted; the popover hides when both are empty.

`ChatComposer` intercepts send through `handleStart`: local commands run and clear the composer; everything else goes through `useWorkspacePromptActions.onStartChat` before any AI request can start.

Project/folder chat uses the selected AI agent for normal text. Slash skills such as `/plan`, `/debug`, `/design`, and `/explain` are explicit Vibyra workflow activations layered on top of the same `startAgent` path. Do not add local Vibyra notices in project chat; non-AI local command handling belongs in `ChatComposer` or a command-specific helper.

## Local AI Skills

Local AI skills live in `src/utils/chatSkills.ts`. `mergeChatSkills(state.chatSkills)` prepends local skills to backend skills and de-dupes by `id`, so local behavior wins.

Registry: `/plan`, `/debug`, `/review`, `/design`, `/ship`, `/publish`, `/explain`. These keep the normal AI send path; `applyLocalSkillPrompt` expands the prompt before sending. `/plan` and `/explain` ask not to edit; `/design` uses build mode for richer file context.

## Backend Skills

`AppProvider` fetches `GET /api/skills` once with `{ background: true }` and stores `state.chatSkills`. `useAgentActions.startAgent` sends only the body as `prompt` and forwards `skill: <id>`.

Keep local commands separate from server `chatSkills`. If a local command collides with a local/backend skill, the command wins.

Tool slash skills (`/research`, `/web`, `/analyze`) stream through the same mobile backend URL as normal cloud chat: `EXPO_PUBLIC_API_URL` + `/api/chat/stream`. Backend maps their tool-only model keys to budget Gemini Flash Lite: `tool-deep-research` with web search and a 16000-token completion cap, `tool-web-search` with web search and a 1200-token cap, and `tool-analyze-files` with project file context and an 1800-token cap. Keep the app labels generic ("Deep Research", "Agent Web Search", "Analyze Files"), not provider/model names. If Expo reports "Could not reach Vibyra" immediately while port 8000 is listening, first verify `.env` points at the active Wi-Fi/LAN IP and restart Expo. If a tool fails after timing out, inspect `src/utils/appApiStream.ts`; tool streams have longer timeout paths than normal chat. `npm start` runs `scripts/start-dev.sh`, which detects the LAN IP and rewrites `EXPO_PUBLIC_API_URL` before launching Expo.

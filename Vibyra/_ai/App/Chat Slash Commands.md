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
- `/test`: opens latest displayable preview; falls back to active project's `index.html` or desktop preview URL.
- `/new`: clears current chat and returns to detached chat.
- `/clear`: clears current project chat.
- `/help`: streams local help copy.

`matchChatCommand(text)` is the source of truth. It trims, matches `^/(\w+)(?:\s+([\s\S]*))?$`, and looks up lowercase ids. `filterChatCommands(query)` powers the popover.

## Popover UI

`SlashCommandMenu` shows **Commands** (purple icon chip) and **Skills** (yellow sparkle chip) on one shared card surface. Empty sections are omitted; the popover hides when both are empty.

`ChatComposer` intercepts send through `handleStart`: local commands run and clear the composer; everything else goes through `useWorkspacePromptActions.onStartChat` before any AI request can start.

Project/folder chat activation is slash-only. After local command interception, `useWorkspacePromptActions.onStartChat` keeps detached startup chat active, but once `selectedChatId` starts with `project-` it checks `mergeChatSkills(state.chatSkills)` and only sends known slash skills to `startAgent`; non-slash project-chat text gets a local idle notice via `addLocalChatNotice` with `file: null`, so no AI typing row or accidental selected-file label appears.

## Local AI Skills

Local AI skills live in `src/utils/chatSkills.ts`. `mergeChatSkills(state.chatSkills)` prepends local skills to backend skills and de-dupes by `id`, so local behavior wins.

Registry: `/plan`, `/debug`, `/review`, `/design`, `/ship`, `/publish`, `/explain`. These keep the normal AI send path; `applyLocalSkillPrompt` expands the prompt before sending. `/plan` and `/explain` ask not to edit; `/design` uses build mode for richer file context.

## Backend Skills

`AppProvider` fetches `GET /api/skills` once with `{ background: true }` and stores `state.chatSkills`. `useAgentActions.startAgent` sends only the body as `prompt` and forwards `skill: <id>`.

Keep local commands separate from server `chatSkills`. If a local command collides with a local/backend skill, the command wins.

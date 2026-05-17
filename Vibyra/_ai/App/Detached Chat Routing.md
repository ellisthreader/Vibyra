# App - Detached Chat Routing

Read this for detached new-chat behavior, regex intent handling, folder search, and project creation from chat.

## Files

- `src/screens/workspace/helpers/chatReplies.ts`
- `src/screens/workspace/helpers/chatPrompts.ts`
- `src/screens/workspace/helpers/projectCreation.ts`
- `src/screens/workspace/hooks/workspacePromptActions.ts`
- `src/screens/workspace/hooks/workspaceFolderActions.ts`
- `src/screens/workspace/hooks/workspaceProjectCreationActions.ts`
- `src/screens/workspace/inline/DesktopConnectionCard.tsx`

## Routing Order

Detached chat routes prompts through regex helpers, not the LLM. Order in `workspacePromptActions.ts`: starter/help/confusion, project creation, publish command, greeting/small talk, folder recovery, awaiting-folder-name, folder file-list questions, "where am I?", file/folder intents, preview intents, bare-name clarify, fallback.

Keep detached chat regex-driven to avoid per-message model spend. Project-attached chat can use the real AI path.

## Folder Search

Natural-language folder opens render a folder proposal card first, even for one match. `/open` is the direct manual browse path.

Folder intent parsing in `chatPrompts.ts` recognizes common open/folder typos such as `oepn folder ...`; closest-folder guessing belongs to the desktop `/desktop/search` scorer, not an LLM call. Parser regression coverage lives in `src/screens/workspace/helpers/chatPrompts.intent.test.mjs`.

When desktop search/browse intent cannot run because `app.connection` is missing, render `DesktopConnectionCard` with Connect PC / Scan Wi-Fi actions. Those actions preserve the original message id and pending folder intent until pairing/search completes.

Accepting a folder proposal from detached chat must immediately `rememberProject`, seed/select `project-<folder.id>`, clear detached messages, then load files. Otherwise the UI can say "Opened" while the next prompt still routes as detached chat.

## Project Creation

Detached project creation should happen inline from chat, not redirect to Projects or require a paired desktop. `projectCreationIntent` covers container asks and build-shaped asks. `handleChatProjectCreation` calls `app.createProject(name?)`, opens `project-<id>`, and lets `ProjectBriefSetup` be the single Vibyra response.

Build-shaped prompts are left in the composer after creation; plain container prompts are cleared.

## Small Talk And Bare Names

`isSmallTalk` strips leading filler and re-tests the tail so dismissals like `Ok ty`, `No don't worry`, and `actually nvm` resolve to `smallTalkReply()`.

`STOP_NAMES` and `FILLER_TOKEN_RE` in `chatPrompts.ts` must mirror the small-talk vocabulary. If you add a dismissive phrase to one regex, add the single-token form to both `chatPrompts.ts` and `chatReplies.ts`.

## Project Resolution

`useWorkspaceActions.activeProjectTarget` and `useAgentActions.resolveTarget` resolve the visible chat project as `app.projects[id]` -> `app.chatProjects[id]` -> synthesized stub. Never silently fall back to `app.selectedProject` when `selectedChatId` points elsewhere.

`AppContext.rememberProject(project)` writes to `chatProjects` without touching `projects`. `chatProjects` persists locally and through cloud sync.

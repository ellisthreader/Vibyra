# App - Workspace Projects

Read this for project selection, folder search, detached chat behavior, project chat ownership, file browsing, and creating/opening projects.

## Main Files

- `src/context/useWorkspaceActions.ts`
- `src/screens/workspace/hooks/useWorkspaceActions.ts`
- `src/screens/workspace/hooks/useWorkspaceState.ts`
- `src/screens/workspace/helpers/chatPrompts.ts`
- `src/screens/workspace/helpers/chatReplies.ts`
- `src/screens/workspace/inline/chunk8.tsx`
- `src/screens/workspace/inline/chunk9.tsx`
- `src/screens/workspace/inline/chunk23.tsx`
- `src/utils/files.ts`

## Project State

Project creation (`createProject`, `createLocalProject`) initializes `chatThreads[newId] = []` and seeds `chatTitles[newId]`. Backend project ids come from `base64url(diskPath)` with suffixes for collisions.

Project metadata for chat-attached folders is persisted in `state.chatProjects`. `adoptProject`, `createProject`, and `createLocalProject` upsert it. On remote restore, `applyRemoteUser` merges `chatProjects` back into `app.projects`; desktop refreshes use `mergeProjects(current, incoming)` so adopted-only projects are not wiped.

The Projects tab `Open` action must anchor `selectedChatId` to `project-<id>` before/while selecting the project. Otherwise the user can reopen a project visually but land in detached chat where prompts are consumed by local fallback replies.

## Detached Folder Search

`useWorkspaceActions.onStartChat` handles folder/project lookup locally before agent routing. If local desktop folders/projects are referenced while Vibyra Desktop is not connected, answer locally with a connection instruction; do not send that prompt to backend chat.

Decision order: awaiting-name state, current-project question, find-folder without name, find-folder with name, conversational fast paths, greeting/small-talk, detached fallback or project-chat agent.

Detached folder proposals must be written to `newChatMessages`, not `app.chatThreads`, or the visible detached chat will appear to delete the user's message.

## Folder Proposal Recovery

Folder proposal cards expose Open folder, Not now, and Wrong folder. Wrong folder appends a visible recovery card with Browse PC and Auto search PC, and stores a short-lived recovery ref so the next correction (for example `no test1`) runs replacement search.

Browse PC opens `FolderBrowserModal` in `chunk9.tsx`, backed by `app.browseDesktopPath`. It shows PC roots, parent path, and child folders/files, and selects a folder via `acceptFolderProposal`.

`useWorkspaceActions.onStartChat` uses `submitLockRef` to dedupe local submits, including desktop folder searches that do not set `agentRequesting`.

## Folder Name Parsing

`extractFolderName(prompt)` in `chatPrompts.ts` returns `null` on uncertainty. `isBareName` and the awaiting-name `looksLikeName` check are intentionally single-token only, so phrases like `i dont understand` or `can you help` are not treated as folder names. `cleanCandidateName` strips trailing tails starting at `on/in/from/.../its/it's/that's/which is/that is/located/saved/stored/sitting/living` and then pops remaining trailing filler/pronoun tokens, so `open folder 123test its on my desktop` extracts `123test`, not `123test its`.

`isFindFolderIntent` uses verb/noun/named patterns. The extractor order is quoted, called/named, verb+noun+name, verb+name+noun, noun+name, trailing name+noun, bare verb+name.

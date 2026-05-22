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

Mobile workspace state starts without seeded projects, files, agents, logs, changes, or recent chats; real projects arrive from desktop discovery, project creation, adopted folders, or restored account state. Empty-state sentinels live in `src/context/appStateDefaults.ts` and must not be treated as selectable project data.

Project creation (`createProject`, `createLocalProject`) initializes `chatThreads[newId] = []` and seeds `chatTitles[newId]`. Backend project ids come from `base64url(diskPath)` with suffixes for collisions.

Project metadata for chat-attached folders is persisted in `state.chatProjects`. `adoptProject`, `createProject`, and `createLocalProject` upsert it. On remote restore, `applyRemoteUser` merges `chatProjects` back into `app.projects`; desktop refreshes use `mergeProjects(current, incoming)` so adopted-only projects are not wiped.

Desktop-opened folders may include `analysis` and `detectedBrief` from the bridge. First-open desktop folders should show a normal Vibyra chat message: `addProjectBriefSetupMessage` writes an "Analyzing this folder..." card, `analyzeDesktopProject` calls `/desktop/analyze`, and `updateProjectBriefSetupMessage` replaces the card with deterministic findings plus Confirm/Change. Confirm saves `detectedBrief` through `saveProjectBrief`, marks the setup card `confirmed`, and removes the card actions; Change opens the existing `ProjectBriefSetup` inside `AIChatPage`'s scroll view, not as a centered blocking panel. `useWorkspaceActions.adoptProject` must merge incoming desktop metadata with any saved `chatProjects[id].brief` so a manual/confirmed choice is remembered when the same PC folder is opened again. `selectProject` loads files but skips `/preview/start` while `briefRequired && !brief`, preventing preview startup before first-open setup is complete.

Opening a remembered desktop project while Vibyra Desktop is disconnected must show the chat `DesktopConnectionCard`, not the folder analysis/setup card. `useWorkspaceChatRuntime.openProjectPreview` adds a `desktop-browse` `addLocalDesktopConnectionPrompt` before analysis in that case, and `AIChatPage` suppresses `ProjectBriefSetup` for disconnected desktop projects so the Connect PC UI remains actionable. After pairing, `useWorkspaceActions` resumes the browse intent by analyzing the same project for framework/app type, not by showing a manual folder proposal.

The desktop analyzer is local-only: `desktop/lib/projectAnalysis.mjs` shallow-scans prioritized project files, `projectAnalysisPurpose.mjs` scores page/content purpose signals above folder names, and `projectAnalysisBrief.mjs` infers framework metadata. Mobile renders `analysis.evidence` as purpose signals and optional `analysis.techEvidence` as tech signals. Folder proposal and first-open analysis cards should stay compact: one status label, one folder/result title, short copy, limited signal chips, and a clear primary action before quieter secondary actions. When Change opens manual classification, `AIChatPage` hides the existing analysis setup message while rendering `ProjectBriefSetup`, so the user sees replacement UI instead of two setup prompts. Relevant files: `src/screens/workspace/inline/FolderCards.tsx`, `src/screens/workspace/inline/ProjectBriefConfirmationCard.tsx`, `src/screens/workspace/inline/chunk9.tsx`.

First-open desktop folder analysis is centralized in `src/screens/workspace/helpers/desktopFolderAnalysis.ts`. All mobile folder-open entry points should call `runFirstOpenDesktopAnalysis()` before `adoptProject()` so the chat setup card always leaves "Analyzing" and becomes either detected findings or a manual-classification fallback.

Disconnected desktop-folder resume stores `projectId` on the `DesktopConnectionPrompt` and `useWorkspaceActions` restores `selectedChatId` to `project-<id>` after pairing. Do not infer the target only from current UI state; otherwise the framework/app-type confirmation card can be written off-screen.

The project-brief confirmation card passes the detected `ProjectBrief` directly to `confirmProjectBrief`; do not make Confirm rediscover the brief from project state only. `AIChatPage` also treats a `projectBriefSetup.status === "confirmed"` card as enough to re-enable the composer if project metadata is one render behind.

The Projects tab `Open` action must anchor `selectedChatId` to `project-<id>` before/while selecting the project. Otherwise the user can reopen a project visually but land in detached chat where prompts are consumed by local fallback replies.

Chat-side project opens must not automatically open or start live preview. `selectProject(projectId, { startPreview: false })` loads files and selects the project without calling `/preview/start`, and `adoptProject(project)` defaults to that chat-safe behavior. Keep preview startup behind explicit preview actions such as `/preview` (`/test` alias) / `openRunnablePreview` or direct `selectProject()` calls that omit `startPreview: false`.

The Projects tab must not fabricate branch names or random lifecycle states. `useProjectsPage` should derive display status from real source only (`On PC` for `pc`/`desktop`, `On mobile` for mobile), treat `desktop` as a PC source for filtering, and avoid screen-only rename/archive/delete mutations until those actions have persistent backing.

## Project Publishing

Publishing is backend-owned public data, not account `appState` and not raw desktop preview links. The mobile app collects explicit publish metadata/approval, sends a sanitized preview snapshot through `src/utils/communityApi.ts`, and keeps desktop paths/tokens private. Start from `src/screens/workspace/inline/chunk8.tsx`, `ProjectPublishModal.tsx`, `ProjectPublishIcon.tsx`, `ProjectPublishScreenshots.tsx`, `ProjectPublishModal.data.ts`, `ProjectPublishModal.styles.ts`, `src/screens/workspace/hooks/useCommunityPage.ts`, and `src/screens/workspace/inline/chunk15.tsx` for frontend publish/community behavior.

The project card menu opens `ProjectPublishModal`. The publish UI is a compact full-screen listing form: screenshots/photos first, required title/description fields, a quiet visibility segment, AI-suggested discovery controls for category/tags, optional app icon controls through `ProjectPublishIcon.tsx`, and the publish CTA as the final item at the bottom of the scroll content. `ProjectPublishModal.data.ts` owns local publish suggestions from project name, stack, analysis evidence, and brief metadata; the category dropdown should show a `Suggested` label while using that recommendation. Avoid bringing back the numbered accordion flow or a top preview card; keep publishing visually simple and listing-page-like. The selected category is folded into outgoing tags, and visibility is sent through `communityApi.ts` to `CommunityPublishing.php`. Icon and screenshot AI generation open custom prompt fields before calling `POST /api/community/assets/generate`; screenshots use the same endpoint through `generatePublishAsset`.

Publish form spacing is intentionally balanced so the default closed page fits short mobile screens without feeling tiny on newer tall phones. Preserve the medium control heights in `ProjectPublishModal.styles.ts`; expanding the category menu, tag input, AI prompt, or added media may still make the scroll container useful.

After a successful publish response, the publish modal should show the lightweight `ProjectPublishCompletion.tsx` result animation, then close back to Projects. `chunk8.tsx` reuses `publishResult` as the temporary top notice state, and `ProjectPublishNotice.tsx` shows visible outcomes near the top of Projects before auto-dismissing. Pending/under-review outcomes intentionally return no publish result, no card label, and no modal status panel; the modal closes quietly while the backend continues to own review state.

Owned publish review status comes from authenticated `GET /api/projects/publish-status`. `useProjectPublishStatuses.ts` fetches that map for Projects cards, and `ProjectPublishResult.ts` maps visible review states/safety ratings to card labels/modal copy while hiding pending/under-review status from the mobile UI. Publishing asks Vibyra Desktop for a bounded source snapshot through `loadProjectReviewFiles()` / `/files/review-bundle` and sends it as `sourceFiles` plus `sourceReview`; backend stores only findings/summary/rating, not source bodies. Re-publishing the same pending/under-review source project re-runs automated review and updates the existing row instead of returning a duplicate-status error.

Publish/community readiness fixes: publishing uses `selectProject(..., { startPreview: false })` and never falls back to stale `app.files`; private/unlisted responses stay visible in the modal while under-review responses are hidden; Explore uses local sample `communityPosts` only when Laravel returns no published apps, and real backend posts override those samples. Sample posts are identified by the `sample-` id prefix, keep likes local, call `/api/moderation` before local comment insertion, and may carry `previewHtml` for self-contained demo previews. Real backend likes still use the DELETE unlike path and sync counts from API responses.

Explore project cards and detail pages include a report action backed by `CommunityReportModal.tsx`; the current flow is review-mode UI only, with preset issues, Other, optional comment, and optional screenshot attachment, but no persisted backend report queue yet.

Publish icon and screenshot attachment use `expo-image-picker` in `ProjectPublishIcon.tsx` and `ProjectPublishScreenshots.tsx`; the media buttons open the native library directly and store selected images as `data:image/...;base64` URIs so `CommunityPublishMedia` can accept them. AI publish image generation can take longer than generic API calls, so `src/utils/appApi.ts` gives `/api/community/assets/generate` a 100s timeout. Backend generation uses OpenRouter (`OPENROUTER_API_KEY`, `services.openrouter.image_model`, default `openai/gpt-5.4-image-2`) through `/api/v1/chat/completions` with `modalities: ["image"]`, extracts data/HTTPS image URLs from the assistant message, and charges credits only after successful generation; do not call OpenAI's Images API or reintroduce the deterministic local PNG fallback for the AI publish buttons. The frontend must confirm credit spend before generation using `PUBLISH_ASSET_CREDIT_COST` (`logo: 12`, `screenshot: 20`) so users see the cost before credits are deducted.

The chat command `/publish` is handled locally in `src/screens/workspace/hooks/workspacePublishCommand.ts`: in a project chat it switches to Projects and opens the publish modal for that project; in detached chat it asks the user to open a project chat first. The slash menu also exposes `/publish` in `src/utils/chatSkills.ts`.

## Detached Folder Search

`useWorkspaceActions.onStartChat` handles folder/project lookup locally before agent routing. If local desktop folders/projects are referenced while Vibyra Desktop is not connected, answer locally with a connection instruction; do not send that prompt to backend chat.

Decision order: awaiting-name state, current-project question, find-folder without name, find-folder with name, conversational fast paths, greeting/small-talk, detached fallback or project-chat agent.

Detached folder proposals must be written to `newChatMessages`, not `app.chatThreads`, or the visible detached chat will appear to delete the user's message.

## Folder Proposal Recovery

Folder proposal cards expose Open folder, Not now, and Wrong folder. Wrong folder appends a visible recovery card with Browse PC and Auto search PC, and stores a short-lived recovery ref so the next correction (for example `no test1`) runs replacement search.

Browse PC opens `FolderBrowserModal` in `chunk9.tsx`, backed by `app.browseDesktopPath`. It shows PC roots or a supplied project-root `initialPath`, parent path, and child folders/files, and selects a folder via `acceptFolderProposal`.

`/open` and Browse PC share `useDesktopFolders.browseDesktopPath`; desktop browse requires the paired bearer token, and the hook maps transport/auth/missing-folder failures to friendly modal copy before rethrowing.

Project chat directory and agent target resolution must stay anchored to the opened project root, not the selected file path. `chatDirectory.ts`, `workspaceChatRuntime.ts`, and `agentActionHelpers.ts` may fall back to `selectedProject` when ids match, but must not derive the chat/project root from `selectedFile.path`. Chat and Browse PC UI labels should display folder/project names instead of absolute home-directory paths such as `/Users/...`, `/home/...`, or `~/Desktop/Vibyra Projects/...`; keep full paths internal for desktop requests only.

`useWorkspaceActions.onStartChat` uses `submitLockRef` to dedupe local submits, including desktop folder searches that do not set `agentRequesting`.

## Folder Name Parsing

`extractFolderName(prompt)` in `chatPrompts.ts` returns `null` on uncertainty. `isBareName` and the awaiting-name `looksLikeName` check are intentionally single-token only, so phrases like `i dont understand` or `can you help` are not treated as folder names. `cleanCandidateName` strips trailing tails starting at `on/in/from/.../its/it's/that's/which is/that is/located/saved/stored/sitting/living` and then pops remaining trailing filler/pronoun tokens, so `open folder 123test its on my desktop` extracts `123test`, not `123test its`.

`isFindFolderIntent` uses verb/noun/named patterns. The extractor order is quoted, called/named, verb+noun+name, verb+name+noun, noun+name, trailing name+noun, bare verb+name.

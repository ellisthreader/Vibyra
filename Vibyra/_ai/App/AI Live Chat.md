# App - AI Live Chat

Read this for mobile AI chat, prompt submission, slash commands, typing animation, assistant message rendering, changed-files cards, and chat error copy.

## Main Files

- `src/context/useAgentActions.ts`
- `src/context/agentTypes.ts`
- `src/context/agentErrors.ts`
- `src/context/useAppState.ts`
- `src/screens/workspace/inline/chunk9.tsx`
- `src/screens/workspace/inline/chunk23.tsx`
- `src/utils/chatStream.ts`

## Prompt Flow

`useAgentActions.startAgent` trims `state.taskText`, creates optimistic chat/agent records, adds prompt-money credit, sends `/agents/start` when paired, otherwise sends `/api/chat`, then updates chat, files, changes, preview state, logs, and credits.

Backend chat payloads are cost-trimmed: non-build prompts skip `fileBody` and send only 3 recent history messages capped at 600 chars; build prompts send 4 history messages capped at 1200 chars plus a 1200-char file slice. Keep the frontend `isBuildPrompt` regex in sync with backend `ChatPrompting::isBuildPrompt`.

Slash-command skills are backend-driven. `AppProvider` fetches `GET /api/skills` once with `{ background: true }` and stores `state.chatSkills`. The composer in `chunk9.tsx` shows a slash popover for `^/(\w*)$`; `useAgentActions.startAgent` sends only the body as `prompt` and forwards `skill: <id>`.

## Streaming UI

`streamChatText` tokenizes reply text into word/whitespace chunks, uses 15-45ms randomized timeouts, and appends `TYPING_CURSOR` on non-final partials.

Call sites:

- `useAgentActions.streamAssistantMessage` for real `/agents/start` and `/api/chat` replies.
- `AppContext.addLocalChatReply` and `addLocalChatProposal` for canned project-chat replies.
- `useWorkspaceActions.addDetachedChatReply` for detached chat replies.

`TypingIndicator` in `chunk23.tsx` shows only while message text is exactly `Working on it...`; then `RichMessageText` renders streamed content.

## Code Block Rendering

`parseMessageBlocks` in `chunk24.tsx` recognises both closed (` ``` … ``` `) and open (` ``` … `, no closing fence) fences so streaming code is detected mid-token; the open-fence path strips a trailing `TYPING_CURSOR` (`▍`) before counting. Fence info lines are split into `{ language, filename }` — any token containing `/` or a non-language `.ext` is treated as the filename, otherwise as the language.

`RichMessageText` renders code via `CollapsibleCodeBlock`: collapsed by default, header shows `{filename || language || "code"}` plus a live `N lines` count (suffixed `• writing…` while `streaming` is true). Tapping the header expands the body; the actual code never renders until expanded. Decision (2026-05-10): keep code hidden on first paint to avoid wall-of-code in mobile chat — line count is the live progress signal during streaming.

If you change `streamChatText`'s cursor character, update `TYPING_CURSOR_CHARS` in `chunk24.tsx` so the streaming line count doesn't include the cursor.

The collapsed header replaces the line count with diff-style chips: `+N` (green `#4EC07A`) and `-N` (red `#F26A6A`), driven by `diffCounts(code)` in `src/utils/syntaxHighlight.ts`. Code containing any line beginning with `+`/`-` (excluding `+++`/`---` headers) is treated as a unified diff; everything else is treated as pure additions, so the header becomes `+totalLines`. While streaming, an italic `writing…` chip is shown alongside the counts.

When expanded, the body is rendered through `tokenize(code, language)` — a regex-based scanner with families `js` (ts/tsx/js/jsx/mjs/cjs), `json`, `py`, plus a plain fallback. Colours come from `SYNTAX_COLORS` (VS-Code Dark+ approximations: keyword `#C586C0`, string `#CE9178`, number `#B5CEA8`, comment `#6A9955`, function `#DCDCAA`, type `#4EC9B0`, property `#9CDCFE`, boolean `#569CD6`, punctuation `#D4D4D4`, default `#E5E2F0`). Each token is a nested `<Text>` so original whitespace and indentation are preserved by RN's text layout. The fenced filename is consulted as a fallback for language detection (e.g. ` ```src/foo.py ` highlights as Python even with no language token).

## Reasoning Effort Selector

The composer in `chunk9.tsx` exposes a four-step reasoning effort picker via `EFFORT_OPTIONS` (`low | medium | high | xhigh`, mapped 1:1 to `ReasoningEffort` in `domain.ts`). The pill (`chatEffortPill`) sits at the start of `chatComposerTools`; tapping it opens `chatEffortMenu` (a popover above the composer, mutually exclusive with the model menu) showing label + hint per option. Current value is shown via `effortShortLabel` (Low / Med / High / X-Hi).

Selection writes through `app.setReasoningEffort` which already drives the desktop `/agents/start` payload. `useAgentActions.ts` now also forwards `reasoningEffort` on the `/api/chat` (OpenRouter) payload.

Backend handling lives in `ChatEndpoint.php` (`normalizeReasoningEffort`, `buildReasoningPayload`):
- `none` → `{ exclude: true }` (suppresses reasoning).
- `low | medium | high` → `{ effort: <value> }`.
- `xhigh` → `{ effort: "high", max_tokens: max(maxOutput * 4, 8000) }` — OpenRouter has no native "extra high" tier, so we promote effort to high and grant a deeper reasoning-token budget. Decision (2026-05-10): better than introducing a non-OpenRouter shim or a separate model swap; keeps the request schema standard while honoring the user-facing tier.

Validation rejects unknown values back to `medium`. The reasoning payload is only added to the OpenRouter call when not null, so models that ignore the field stay unaffected.

## Box Token System

All chat surfaces share the same box tokens to keep radii / borders / surfaces consistent:

- **Radii**: `999` (pills), `12` (inline buttons + tool surfaces + small panels), `14` (cards + popovers — the dominant container radius), `18` (composer only — anchor element).
- **Border tints (purple)**: `rgba(176, 132, 255, 0.18)` subtle / default panels and inline buttons; `rgba(176, 132, 255, 0.24)` for popovers and emphasized cards (folder proposal, app preview, model menu, skill menu, effort menu); `rgba(176, 132, 255, 0.32)` for permission-required surfaces (`EditPermissionCard`).
- **Surfaces**: `rgba(15, 17, 26, 0.92)` for cards in the message stream, `#13131F` for floating popovers (slightly more opaque since they overlay content), `rgba(255, 255, 255, 0.045)` for inline tool surfaces.
- **Shadow**: popovers and the send button use `shadowColor: "#8E3CFF"` with low opacity (0.22–0.45) for a purple-tinted lift; cards inside the message stream stay shadowless to avoid stacking artefacts.

Decision (2026-05-10): unified after a polish pass exposed inconsistencies (`messageCodeBlock` was at 10px radius, `chatModelMenu` at 15px, `folderProposalStyles.card` at 16px with a 0.34 border, code-changes card had a green border whereas every other card was purple). Anything new should pull radii from this 12/14/18/999 set and borders from the 0.18/0.24/0.32 set.

## Visual Design

The chat surface targets a Claude-Code-remote feel rendered in Vibyra's purple palette (`#8E3CFF` → `#5D24D8` for accents, `#B084FF` / `#D7C4FF` for soft tints, `#0B0D17` / `#080A12` for surfaces). Borders are hairlines tinted purple at low alpha (`rgba(176, 132, 255, 0.10–0.42)`), shadows are purple-tinted at low opacity for depth without colour cast on the background.

`MessageBubble` renders user messages inside a purple-tinted bubble (`messageUserBubble`) while assistant content stays free-flowing — this differentiates without forcing right-alignment. The author label uses `messageAuthorAssistant` (`#D7C4FF`) for "Vibyra" to lift the assistant identity. Avatars: assistant gets a subtle purple shadow glow; user stays neutral. Bubble enters with a 360ms lift + 280ms fade — long enough to feel intentional, short enough to not drag.

`ChatEmptyState` opens with a gradient orb (Vibyra logo on `#8E3CFF→#5D24D8`) that pulses subtly (1.0 → 1.06 scale, 0.6 → 1.0 opacity, 1800ms each direction). The block enters with a 12px lift + fade. Suggestion cards use `chatSuggestionIconPlate` (purple gradient inset behind a purple-tinted Ionicon) and `chatSuggestionCardPressed` for press feedback.

The composer (`chatComposer`) gets a focus state via `composerFocused` in `chunk9.tsx` — the border tint shifts to `rgba(176, 132, 255, 0.42)` and shadow opacity bumps when the input is focused. The send button shadow is purple-tinted (`shadowColor: "#8E3CFF"`) and presses scale to 0.94 via `chatSendButtonPressed`. Tool buttons fade + scale on press inline.

The chat top bar uses a purple hairline divider (`borderBottomColor: "rgba(176, 132, 255, 0.10)"`) and tightened title typography (16.5/-0.2 letter spacing). All three top-bar icons share the same press-feedback expression (`opacity: 0.65, scale: 0.94`).

Decision (2026-05-10): keep motion subtle and snappy (240–420ms timings, ≤12px lift, ≤6% scale pulses). Showier glow trails / animated gradient borders were rejected — they read as "AI demo" rather than the trustworthy Claude-Code-remote feel the user is aiming for.

## Run-Artifact Filtering

Files under `.vibyra-agent/runs/` are background log artifacts the desktop writes after every agent turn — they should never appear as the user's "current file" or in chat-message file labels. Helpers `isRunArtifactPath(path)` and `isRunArtifact(file)` live in `src/utils/files.ts`.

`useAppState.derived.selectedFile` no longer falls back to `files[0]` blindly: the explicit `selectedFileId` always wins, otherwise the first non-run-artifact file is used (then `files[0]`, then `emptyFile`). Without this, a freshly prepended run artifact from `setFiles(dedupeFiles([...result.files, ...current]))` became the implicit selection and surfaced as the chat's `file` label even though the user never opened it.

`useAgentActions.resolveTarget` and `AppContext.addLocalChatReply`/`addLocalChatProposal`/`addLocalFolderRecovery` all skip run artifacts when deciding `target.file`, so chat bubbles never tag a run log path. Decision (2026-05-10): keep run artifacts in `app.files` (they're useful for the changes card and undo) but make them invisible to "active file" derivation.

## Project Preview Never Blank

`openProjectPreview` (in `useWorkspaceActions` hook) now returns the loaded files via `selectProject`'s new `Promise<FileEntry[]>` signature and passes them to `pickPreviewHtml(files, hasLiveUrl)` in `src/utils/files.ts`:

1. If the project has an `index.html` with content → use it as `html` (preview renders the project's own page).
2. Else if a desktop URL is available → leave `html` empty and use `url` (live dev-server preview).
3. Else if any source file has body content → render `buildCodeListingHtml(files)` (a styled HTML listing of the first 30 files with their bodies).
4. Else → no preview is set.

Decision (2026-05-10): never set a preview that is guaranteed to render blank. The previous flow set a preview with only `url` when a desktop was connected; if the URL 404'd or the dev server wasn't running, the WebView blanked. The fallback HTML keeps the surface useful even when there's no working desktop server.

## Edit Permission Gate

Assistant messages with `codeChanges` carry an `editApproval` of `"pending" | "allowed" | "denied"`. `useAgentActions.finishRealAgent` sets it to `"allowed"` when `state.editApprovals[projectId] === "always"` and `"pending"` otherwise (no value when there are zero changes).

`MessageBubble` swaps cards based on approval: `"pending"` renders `EditPermissionCard` (`src/screens/workspace/inline/EditPermissionCard.tsx`) — gradient header with pulsing shield icon, file preview list with `+N`/`-N` per file, total chips, and three buttons: **No** (deny), **Allow** (one-time), **Allow always** (gradient pill). `"allowed"` and `"denied"` fall back to the existing `CodeChangesCard` so users can still Review and Undo.

`AppContext.approveEdits(messageId, projectId, alwaysAllow)` flips the message to `allowed` and, if `alwaysAllow`, writes `editApprovals[projectId] = "always"`. `AppContext.denyEdits(messageId, projectId)` marks the message `denied` and iterates `codeChanges`, calling `workspace.undoCodeChange` for each file with a `previousBody` (best-effort rollback since the desktop has already written the file by the time changes arrive).

`editApprovals` is persisted in `appState` (local + cloud sync) with the same lifecycle as `chatThreads`/`chatProjects`. Decision (2026-05-10): keep approval per-project rather than global so a user can pre-approve trusted projects without granting blanket consent. The card also runs an entrance animation (fade + lift) and a slow ring pulse on the shield icon, intentionally not haptic — invoking `impact()` here would feel intrusive on every assistant turn.

## Project Resolution On Send

`useWorkspaceActions.activeProjectTarget` and `useAgentActions.resolveTarget` resolve the chat's project as: `app.projects[id]` → `app.chatProjects[id]` → synthesised stub `{ id, name: id, path: "", stack: "", updated: "" }`. Decision (2026-05-10): never silently fall back to `app.selectedProject` when `selectedChatId` points to a different project — that produced "messages vanish on send" because the user message was appended to `chatThreads[p1]` while the UI rendered `chatThreads[<actual id>]`. The fallback chain keeps `chatProjectId` aligned with the visible thread even when the project isn't in `app.projects` (e.g. a desktop folder shown via `includedDesktopFolders` that was never adopted).

`AppContext.rememberProject(project)` writes to `chatProjects` without touching `projects`. Called by `openProjectPreview` so opening any project (including a desktop folder shown but not adopted) registers it for later resolution. `chatProjects` is now persisted in local `appState` (in addition to cloud sync), and on initial mount `useAppState` re-merges its values into `projects` so the projects list survives an offline restart.

## Message Ownership

Chat threads are scoped by project id in `useAppState` (`chatThreads: Record<projectId, ChatMessage[]>`). `selectedProjectId` drives agent writes; `selectedChatId` drives what the workspace renders (`null` for detached chat, `project-<id>` for project chat).

`app.startAgent(target?)`, `app.addLocalChatReply(..., target?)`, and `app.clearCurrentChat(projectId?)` accept explicit targets. Workspace flows that adopt/find a desktop folder should pass the target instead of relying on the current `selectedProjectId` closure.

## Changed Files Card

Desktop agent completions attach `codeChanges`, `codeFiles`, and `codeProjectId` to the assistant message. `MessageBubble` renders file name only, `+/-` counts, Review opens a read-only file modal, and Undo restores only when `previousBody` exists. Relevant backend/desktop producers: `backend/app/Services/Concerns/GeneratedFileHandling.php`, `desktop/lib/agent.mjs`.

## Detached Chat Intent Routing

Detached chat (no project attached) routes prompts through regex-based intent matchers in `src/screens/workspace/helpers/chatReplies.ts` and `chatPrompts.ts`, not the LLM. Order in `useWorkspaceActions.ts:240-355` is: greeting → small talk → folder recovery → awaiting-folder-name → "where am I?" → file/folder intents → preview intents → bare-name clarify → fallback.

`isSmallTalk` strips a leading filler run (`ok`, `nah`, `actually`, `hmm`, `please`, single greetings, etc.) and re-tests the tail against the token list, so multi-word dismissals like `Ok ty`, `No don't worry`, `actually nvm`, `nah it's fine` resolve to `smallTalkReply()` instead of falling through to `bareNameClarifyReply` or `detachedFallbackReply`. Token list includes `ty|thx|tnx|tysm|cheers|fine|cool|nice|nvm|lol` and dismissals (`forget it`, `drop it`, `no worries`, `don't worry`, `it's fine`).

`STOP_NAMES` and `FILLER_TOKEN_RE` in `chatPrompts.ts` must mirror the small-talk vocabulary, otherwise `bareNameCandidate` will treat dismissive acronyms (e.g. `ty`) as folder names and produce "Did you mean a folder called `ty`?".

If you add a new dismissive phrase to one regex, add the single-token form to both `chatPrompts.ts` STOP_NAMES/FILLER_TOKEN_RE *and* `chatReplies.ts` SMALL_TALK_TOKENS_RE. Decision (2026-05-09): keep detached chat regex-driven rather than calling `/api/chat` to avoid per-message Anthropic spend; LLM is reserved for project-attached chat.

## Error Copy

Chat should not show raw transport/provider errors like `HTTP 401`, `502 Bad Gateway`, or `Failed to fetch`. `agentErrors.ts` maps desktop/backend failures to user-facing recovery text while raw messages stay in logs.

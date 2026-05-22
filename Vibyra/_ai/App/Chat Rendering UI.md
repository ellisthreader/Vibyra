# App - Chat Rendering UI

Read this for streaming text, assistant message rendering, code block display, and chat visual polish.

## Files

- `src/utils/chatStream.ts`
- `src/screens/workspace/inline/chunk23.tsx`
- `src/screens/workspace/inline/chunk24.tsx`
- `src/screens/workspace/inline/AgentRunProgressText.tsx`
- `src/utils/syntaxHighlight.ts`
- `src/screens/workspace/inline/chunk9.tsx`

## Streaming

Cloud chat sends now hit `POST /api/chat/stream` (SSE), not `/api/chat`. The legacy JSON endpoint stays for fallback / tests. Backend trait: `backend/app/Http/Controllers/Concerns/ChatStreamEndpoint.php`. It validates auth, plan, prompt, credits up front (returns JSON 4xx on failure), then opens a Symfony `StreamedResponse` that proxies OpenRouter's SSE: `event: chunk` carries `{delta}`, `event: final` carries the full ChatResponse-shaped payload (reply, app, credits, level activity, user), `event: error` carries `{error}`. Guzzle is used raw inside the stream closure because Laravel's HTTP facade buffers; `Http::fake` cannot intercept it. After streaming completes, credits and level activity are recorded the same way the non-streaming endpoint does.

Frontend SSE consumer: `appApiStreamChat` in `src/utils/appApi.ts` uses `/api/chat/stream` only on web, where `response.body.getReader()` is available. On iOS/Android it deliberately falls back to `/api/chat` because Expo native fetch may not expose `Response.body`; this avoids the "streaming response has no body" failure and prevents duplicate fallback requests. Web streaming parses SSE blocks, invokes `onChunk(delta)` for each chunk, and resolves with the `final` payload. `useAgentActions.startAgent` cloud branch uses it; `useAgentChatMessages.appendStreamingDelta` mutates the in-flight assistant message text in place (collapsing the initial "Working on it..." placeholder on the first chunk). On completion, `useAgentResultHandlers.finishStreamedOpenRouterAgent` writes the canonical post-processed reply, applies app/codeChanges metadata, and flips `runStatus.status` to `complete`.

The local-only `streamChatText` (word-by-word fake stream) is still used for non-cloud paths: desktop agent results, local proposals/replies, detached chat replies.

`TypingIndicator` shows only while message text is exactly `Working on it...`. Pending assistant rows carry `ChatMessage.runStatus`; while pending, `AgentRunProgressText` renders elapsed time, safe step labels, and a compact active-file card for code-generation prompts. Tool runs may also set `runStatus.tool` (`image`, `research`, `web`, `analyze`), in which case `ChatToolActivityCard.tsx` renders the visible running card. Tool text may stream in the background, but `MessageBubble` keeps the tool card visible until `runStatus.status` completes; completion is held by `remainingChatToolProgressMs()` in `src/utils/chatToolProgress.ts` so the stage rail reaches the final step before the answer/image replaces the card.

Live-chat tools share one visual language: keep tool chips, chooser icons, preview cards, and running cards on the same purple Deep Research-style scheme instead of changing the send button or swapping accent colors per tool. `ChatToolPlanCard.tsx` owns the compact pre-start card for image, deep research, and web search, with tool-specific icon/copy but shared purple treatment. Analyze Files starts directly without a plan card. Previewed tools wait for explicit Start; do not auto-start Deep Research from a countdown. Use `ChatStartOptions.displayPrompt` / `AgentStartOptions.displayPrompt` when adding hidden tool planning context so the visible user bubble, prompt money, last prompt, and intent-routing context stay based on the user's original prompt while the backend can receive the enriched prompt.

Tool completion delays must be guarded by the original running `ChatRunStatus` key. `chatToolRunKey()` / `isSameRunningChatToolRun()` in `src/utils/chatToolProgress.ts` prevent delayed finalizers from converting a failed, replaced, or deleted run into a completed answer. Detached chat updates should no-op when the detached thread/message no longer exists rather than recreating an empty thread.

Create-image requests must add a pending assistant row immediately, then update that same row with `generatedImage` or an error. Project chats use `useLocalChatActions.addLocalImageGenerationPending()` / `finishLocalGeneratedImage()` / `failLocalImageGeneration()`; detached chats use the matching local helpers in `workspacePromptActions.ts`. Do not wait for `/api/community/assets/generate` to finish before adding chat UI.

Detached/new-chat research and web tools must not call `app.startAgent()` because that writes to a project chat thread that is not visible when `selectedChatId` is null. `workspacePromptActions.ts::runDetachedCloudTool()` owns that path: it appends the user row plus a pending tool assistant row to `newChatMessages`, calls `appApiStreamChat()` directly with the skill id, streams deltas into that same row, then finalizes the row with the `ChatResponse`.

`LiveCodeActivityCard` (`src/screens/workspace/inline/LiveCodeActivityCard.tsx`) renders below the assistant message while `runStatus.status === "running"` and text has streamed content. It parses the accumulated text for the trailing unclosed ``` fence, infers a file name from the fence info line or comment headers (`// path.ext`, `# path.ext`, etc.), and shows "Generating <filename> · N lines" with a pulsing icon. The card vanishes once the fence closes or the run completes. Use this instead of any new "AI request in progress" cards.

Decision (2026-05-13): build-mode progress should read as the simple "Thinking" then "Building" sequence. Backend busy fallbacks still use `AgentBusyCard`, but it must stay visually aligned with `AgentRunProgressText` and avoid the heavier "AI request in progress" card treatment, "previous AI request" copy, or backend-lock wording. Busy fallbacks are failed/blocked prompts, not queued thinking states, so they must show "Run blocked" plus retry guidance and active-run context.

## Code Blocks

`parseMessageBlocks` recognizes closed and open fences during streaming. Open-fence parsing strips the trailing typing cursor before counting lines.

Fence info lines split into `{ language, filename }`: tokens with `/` or non-language `.ext` are filenames, otherwise language ids.

`RichMessageText` renders code through `CollapsibleCodeBlock`, collapsed by default. Header shows filename/language plus diff-style `+N` and `-N` chips from `diffCounts(code)`; an italic `writing...` chip appears while streaming.

Expanded code uses `tokenize(code, language)` with JS/TS, JSON, Python, CSS, and HTML/XML/SVG families. Colors come from `SYNTAX_COLORS`; preserve whitespace with nested `<Text>` tokens.

If `streamChatText`'s cursor changes, update `TYPING_CURSOR_CHARS` in `chunk24.tsx`.

## Feedback Integration

Assistant rows render through `MessageBubble` in `src/screens/workspace/inline/chunk23.tsx`, with the list wiring in `src/screens/workspace/inline/chunk9.tsx`. App-side `ChatMessage` has local `id`, `runStatus`, `editApproval`, and `pendingApplyId`; backend `ChatResponse` now exposes `chatReference`, but the UI should persist it onto the assistant `ChatMessage` before adding visible worked/did-not-work controls.

`src/utils/chatFeedback.ts` provides the app-side future POST helper for `POST /api/chat/learning/feedback`; it requires `chatReference` so UI cannot accidentally submit local-only message ids as durable learning signals.

## Visual System

Chat targets a Claude-Code-remote feel in Vibyra's purple palette. `MessageBubble` renders user and assistant text free-flowing; user prompts do not get a boxed surface.

Motion should stay subtle: 240-420ms timings, max 12px lift, max 6% scale pulses. Avoid showy glow trails or animated gradient borders.

Use the chat box-token system: radii `999` pills, `12` inline tools/small panels, `14` cards/popovers, `18` composer only. Purple borders use alphas `0.18`, `0.24`, `0.32`; popovers use `#13131F`; message-stream cards use `rgba(15, 17, 26, 0.92)`.

Inline action cards that define local `StyleSheet.create` colors do not pass through the workspace `themeTransform`; give them explicit dark/light palettes. Current shared palette: `src/screens/workspace/inline/chatActionCardTheme.ts`, used by `DesktopConnectionCard.tsx` and `FolderCards.tsx`.

Preview server startup approval and progress render through `ChatMessage.previewServer` and `PreviewServerActivityCard.tsx` instead of plain assistant text. Keep it compact, terminal-like, and aligned with the shared chat action card palette. The terminal lines must reflect real app phases reported by `app.startPreviewServer()` and stop animating once the card reaches ready, failed, or cancelled.

Preview server approval buttons mutate the existing `previewServer` card directly and do not add synthetic `yes`/`no` user chat messages. Typed yes/no follow-ups still remain valid chat messages. The post-approval terminal view should fill the whole card surface, not render as a smaller nested panel. Relevant files: `src/screens/workspace/hooks/workspacePromptActions.ts`, `src/screens/workspace/inline/PreviewServerActivityCard.tsx`.

The preview-start terminal card should feel like a real terminal: command/response lines with a blinking typed cursor on the active line. Do not add scanning beams, sweep overlays, or decorative progress animations.

Edit permission prompts should use the same shared chat action palette via `EditPermissionCard.tsx`; avoid green/purple gradient chrome, large glowing permission art, or separate pending code-change cards below it. Keep the card clean with file rows, inline Review/Hide code expansion before approval, and simple No / Allow / Always allow actions. The full `CodeChangesCard` should appear only after edits are approved/applied.

The composer keeps attach, model selector, effort picker, and send button in one compact toolbar. It intentionally does not render a detached/project context strip.

Composer attachments render as a horizontal strip above the text input through `ChatImageAttachmentPills.tsx`. Image picks show only a bare square preview with an overlaid remove button; document picks show a compact file icon, filename, and metadata. Document picks are composer-local `ChatFileAttachment`s and text/code-like files include a bounded text snippet for analyze/project context on send; image picks still travel through `ChatStartOptions.imageAttachments`.

The empty live-chat screen uses `chatEmptyTitles.ts` for desktop-style rotating, greeting-led titles. Do not re-add the old `Vibyra AI` kicker or long helper description above suggestions.

Live chat top controls should read as icons floating on the chat surface: `chatIconOnlyTopBar` blends into the chat page background with no divider, and the menu / preview / more buttons use transparent hit targets with no visible boxed or pill backgrounds.

`ProjectMemoryBar.tsx` owns the bottom-right composer context/memory usage chip. Keep it as a plain circular meter only: no enclosing box, no center icon/fill, starting at 12 o'clock and filling clockwise. Its estimate should include project memory entries, visible chat messages, and the draft prompt so the circle grows with chat context usage. Avoid brain icons or cartoon-style memory art.

`PcPermissionControl.tsx` owns the bottom-left composer PC chip opposite `ProjectMemoryBar`. When disconnected, tapping it opens the existing PC switcher. When connected, it shows the selected PC permission mode with three choices: Read (PC context only, no desktop edit runs), Ask (current approval-card flow), and Auto (desktop edits auto-apply via `desktopPermissionMode === "auto"` or project `editApprovals`). The mode persists in app state/cloud sync and `useAgentActions.ts` must respect it before routing build/edit prompts to the desktop agent. The permission popover includes a compact `PcPermissionUsageLimits.tsx` footer; keep it collapsed by default as "Usage remaining" and animate it open inside the popover to show only the 5-hour burst and weekly counters from `AppContext` (`burstCredits*`, `weeklyCredits*`) with simple progress bars.

Assistant bubble identity is stored per assistant `ChatMessage.assistantModel`, not derived from the current model menu. Generated app replies render `AppPreviewCard`; `chatPreviewFallback.ts` builds a client-side preview app from fenced JSX/HTML when backend metadata is missing.

Quota and usage-limit failures on mobile should not render as assistant bubbles. `src/context/chatUsageLimit.ts` owns the mobile usage-limit lock and reset-time copy; `agentErrors.ts` stores a lock from backend 5-hour burst or weekly cap responses, using backend reset metadata when present and falling back to hit time + 5 hours / 7 days. `useAgentActions.startAgent()` checks that lock before creating the optimistic agent, so all mobile AI chats are blocked until the reset time. `MessageBubble` hides failed assistant rows that match usage-limit text, and `ChatUsageLimitNotice.tsx` renders a dismissible warning above `ChatComposer` with the exact reset time. The notice must read the visible `AIChatPage` `chatMessages` prop, not `appCtx.chatMessages`, because detached chats and project chats can show a different thread.

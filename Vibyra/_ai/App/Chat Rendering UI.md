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

`TypingIndicator` shows only while message text is exactly `Working on it...`. Pending assistant rows carry `ChatMessage.runStatus`; while pending, `AgentRunProgressText` renders elapsed time, safe step labels, and a compact active-file card for code-generation prompts. This progress is runtime-only and disappears as soon as the first stream delta arrives.

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

Edit permission prompts should use the same shared chat action palette via `EditPermissionCard.tsx`; avoid green/purple gradient chrome, large glowing permission art, or separate pending code-change cards below it. Keep the card clean with file rows, inline Review/Hide code expansion before approval, and simple No / Allow / Always allow actions. The full `CodeChangesCard` should appear only after edits are approved/applied.

The composer keeps attach, model selector, effort picker, and send button in one compact toolbar. It intentionally does not render a detached/project context strip.

Assistant bubble identity is stored per assistant `ChatMessage.assistantModel`, not derived from the current model menu. Generated app replies render `AppPreviewCard`; `chatPreviewFallback.ts` builds a client-side preview app from fenced JSX/HTML when backend metadata is missing.

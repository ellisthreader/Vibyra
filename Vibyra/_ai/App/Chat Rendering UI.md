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

`streamChatText` tokenizes reply text into word/whitespace chunks, waits 15-45ms between chunks, and appends `TYPING_CURSOR` on non-final partials.

Call sites: `useAgentActions.streamAssistantMessage`, `AppContext.addLocalChatReply`, `addLocalChatProposal`, and `useWorkspaceActions.addDetachedChatReply`.

`TypingIndicator` shows only while message text is exactly `Working on it...`. Pending assistant rows carry `ChatMessage.runStatus`; while pending, `AgentRunProgressText` renders elapsed time, safe step labels, and a compact active-file card for code-generation prompts. This progress is runtime-only and disappears when final text starts streaming.

## Code Blocks

`parseMessageBlocks` recognizes closed and open fences during streaming. Open-fence parsing strips the trailing typing cursor before counting lines.

Fence info lines split into `{ language, filename }`: tokens with `/` or non-language `.ext` are filenames, otherwise language ids.

`RichMessageText` renders code through `CollapsibleCodeBlock`, collapsed by default. Header shows filename/language plus diff-style `+N` and `-N` chips from `diffCounts(code)`; an italic `writing...` chip appears while streaming.

Expanded code uses `tokenize(code, language)` with JS/TS, JSON, Python, CSS, and HTML/XML/SVG families. Colors come from `SYNTAX_COLORS`; preserve whitespace with nested `<Text>` tokens.

If `streamChatText`'s cursor changes, update `TYPING_CURSOR_CHARS` in `chunk24.tsx`.

## Visual System

Chat targets a Claude-Code-remote feel in Vibyra's purple palette. `MessageBubble` renders user and assistant text free-flowing; user prompts do not get a boxed surface.

Motion should stay subtle: 240-420ms timings, max 12px lift, max 6% scale pulses. Avoid showy glow trails or animated gradient borders.

Use the chat box-token system: radii `999` pills, `12` inline tools/small panels, `14` cards/popovers, `18` composer only. Purple borders use alphas `0.18`, `0.24`, `0.32`; popovers use `#13131F`; message-stream cards use `rgba(15, 17, 26, 0.92)`.

The composer keeps attach, model selector, effort picker, and send button in one compact toolbar. It intentionally does not render a detached/project context strip.

Assistant bubble identity is stored per assistant `ChatMessage.assistantModel`, not derived from the current model menu. Generated app replies render `AppPreviewCard`; `chatPreviewFallback.ts` builds a client-side preview app from fenced JSX/HTML when backend metadata is missing.

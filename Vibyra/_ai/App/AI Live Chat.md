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

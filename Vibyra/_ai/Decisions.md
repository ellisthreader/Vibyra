# Decisions

## 2026-05-07: Slash-Command Skills Driven By Backend Registry

Decision: The mobile chat composer supports slash commands (e.g. `/explain`, `/debug`, `/refactor`, `/fix`, `/build`, `/style`) defined in `backend/config/skills.php`. The frontend fetches the registry once via `GET /api/skills` on `AppProvider` mount, caches it in `state.chatSkills`, and shows a popover above the composer when the user's text matches `^/(\w*)$`. Tapping a skill prefills the input with `<slash> ` so the user types the body. On send, `useAgentActions.startAgent` extracts the skill id, sends only the body as `prompt`, and forwards `skill: <id>` in the `/api/chat` body. Server applies the skill's `prompt_template`, optional `system_prompt_addon`, and uses its `mode` (chat | build) to drive `max_completion_tokens` (800 | 3000) and history/file-body trimming.

Files: `backend/config/skills.php` (registry), `backend/app/Http/Controllers/VibyraAppController.php::skills`, `backend/routes/web.php` (`GET /api/skills`), `backend/app/Http/Controllers/Concerns/ChatEndpoint.php` (`resolveSkill`, `resolveMaxTokens`), `backend/app/Http/Controllers/Concerns/ChatPrompting.php` (`chatMessages` accepts `?array $skill`, `applySkillTemplate`), `src/utils/appApi.ts` (`ChatSkill`, `SkillsResponse`), `src/context/useAppState.ts` (`chatSkills` state), `src/context/AppContext.tsx` (one-shot fetch effect), `src/context/useAgentActions.ts` (slash detection + payload), `src/screens/workspace/inline/chunk9.tsx` (popover UI + `applySkill`).

Reason: Hardcoding prompt scaffolds in the frontend means every prompt tweak ships an app update. Backend-driven registry lets us iterate prompts without releasing the mobile app, and the mode-aware token cap keeps cost optimization aligned with the existing `max_completion_tokens` policy. `prompt_template` placeholders (`{{prompt}}`, `{{file}}`) keep templates declarative; the slim default system prompt is preserved by appending `system_prompt_addon` instead of replacing.

How to apply: Add new skills only by editing `backend/config/skills.php` — the frontend will pick them up on next app launch (or full reload). Required fields: `id`, `slash` (must start with `/`), `label`, `description`, `category`, `mode` (`chat` | `build`), `prompt_template`. Optional: `system_prompt_addon`. Don't add UI logic per skill — keep skills purely declarative. The slash regex on the frontend (`^/(\w*)$`) only triggers the menu when the entire input is a single slash word; once the user types a space, the menu closes and the next send extracts the skill via `^/(\w+)(?:\s+([\s\S]*))?$`.

## 2026-05-07: Client-Side Typing Animation For Assistant Replies

Decision: `useAgentActions.streamAssistantMessage` progressively reveals the assistant's text via word-level chunks (`/\S+\s*|\s+/g`) with randomized 15–45ms delays between chunks and a `▍` cursor appended while in flight. Both the OpenRouter (`finishOpenRouterAgent`) and desktop-agent (`finishRealAgent`) completion paths use it; instant updates (errors via `failAgent`, the "Working on it..." placeholder) still use `updateAssistantMessage`.

File: `src/context/useAgentActions.ts` — `streamAssistantMessage`, `streamingRef`, cancellation hook in `startAgent`.

Reason: The full reply still arrives in one HTTP response (no backend SSE), but rendering it instantly felt unlike Claude Code / ChatGPT. Animating it client-side gives the same visual cadence with zero backend rework. The 15–45ms jitter approximates ~30–60 tokens/sec, which matches what real LLM streams feel like.

How to apply: Any new chat-completion path must call `streamAssistantMessage` (not `updateAssistantMessage`) for the final reply; only error/placeholder text should use the instant setter. New prompts cancel any in-flight typing via `streamingRef.current.cancel()` at the top of `startAgent`. Auto-scroll is handled by `onContentSizeChange={() => followIfAtBottom(true)}` in `chunk9.tsx`, so growing text scrolls naturally. If real SSE streaming is added later, replace the chunk-tokenizer with the network token stream and keep the same cursor + cancellation behavior.

## 2026-05-07: Chat Thread Sourced By `selectedChatId`, Not `selectedProjectId`

Decision: The visible chat thread on the workspace chat page is read from `app.chatThreads[selectedChatProjectId]` (where `selectedChatProjectId = selectedChatId.replace("project-", "")`), not from `app.chatMessages` (which is keyed by `selectedProjectId`).

File: `src/screens/workspace/hooks/useWorkspaceState.ts` — `visibleChatMessages`.

Reason: `selectedProjectId` (in `useAppState`) and `selectedChatId` (in workspace state) are two independent state atoms. During the async `await app.createProject()` round-trip in `createProjectAndOpenChat`, they can briefly disagree, so reading via `selectedProjectId` shows the previous project's thread until React commits the second update. Symptom: "chat does not reset when I make a new project". Falls back to `app.chatMessages` only when no `project-…` chat is selected (defensive).

How to apply: Any new chat-rendering code must read from `chatThreads[<projectIdFromSelectedChatId>]`. Writes from `useAgentActions.setChatMessages` still go through `selectedProjectId` — the auto-snap effect in `src/screens/workspace/hooks/useWorkspaceActions.ts:36-40` keeps the two ids aligned after commit, so writes land in the visible thread in steady state.

## 2026-05-07: Initialize Fresh Chat Thread On Project Creation

Decision: When a project is created (desktop path or local fallback) `useWorkspaceActions.createProject` and `createLocalProject` explicitly write `chatThreads[newId] = []` and `chatTitles[newId] = name` via `setters.setChatThreads` / `setters.setChatTitles`.

Files: `src/context/useWorkspaceActions.ts` — `createProject` (desktop success path) and `createLocalProject`.

Reason: Defensive guard. Even though desktop project ids are unique (base64 of disk path, paths get `-2`/`-3` suffixes in `backend/app/Services/Concerns/ProjectFileState.php::createProject`), an id could be re-used after delete-then-recreate, and persistence layers could carry a stale entry. Initializing the bucket guarantees a freshly-made project always opens to an empty chat.

How to apply: Any new project-creation code path must zero `chatThreads[id]` and set a fresh `chatTitles[id]`. Skipping this can resurrect old conversations in newly-created projects.

## 2026-05-07: Cap OpenRouter `max_completion_tokens` Per Request

Decision: `ChatEndpoint::chat` always sends `max_completion_tokens` — `800` for chat, `3000` when `isBuildPrompt()` matches.

Reason: Without it OpenRouter reserves the model's full output window against the user's credit balance, which fails small balances with "requested up to N tokens" errors. Capping output also bounds worst-case cost per turn.

How to apply: Any new OpenRouter call site (streaming or not) must set `max_completion_tokens`. Build-mode budget is the only reason to raise it.

## 2026-05-07: Slim System Prompt By Default

Decision: `ChatPrompting::systemPrompt` returns a one-line system prompt for plain chat, and only ships the runnable-app HTML/CSP instructions when `isBuildPrompt()` matches.

Reason: The full build-mode prompt is ~400 tokens of input on every turn, even for "what does X mean" questions. Detect intent before sending it.

How to apply: Keep `isBuildPrompt()` as the single source of truth for build mode (used by system prompt selection, history sizing, and `max_completion_tokens`). Mirror it in the frontend (`useAgentActions.ts`) so payloads agree.

## 2026-05-07: Cloud Sync Backs Off On Failure

Decision: `useCloudSync` skips the debounced `POST /api/session/state` for 30s after any failure, and only emits the "Saved locally" log once per outage.

Reason: Every state change re-fires the effect; with the backend down this produced an `ERR_CONNECTION_REFUSED` per keystroke in the browser console. The native log can't be suppressed — only the request can.

How to apply: When adding new background syncs, gate them with the same cooldown pattern. User-initiated requests (chat, agent start) must NOT use the cooldown — they need to fail loudly.

## 2026-05-07: Use Obsidian For Compact Memory

Decision: Use `Vibyra/_ai/` as the project memory layer.

Reason: Agents can read a short context note first and avoid rediscovering repo structure every session.

## 2026-05-07: Ignore Obsidian App State

Decision: Ignore `Vibyra/.obsidian/`, `Vibyra/.trash/`, and `Vibyra/_ai/Runs/` in git.

Reason: Obsidian workspace files and generated run logs are local state. Core notes remain trackable.

## 2026-05-07: Desktop Runs Write Compact Notes

Decision: `desktop/lib/agent.mjs` writes a compact run note to `_ai/Runs/` when it can find an Obsidian vault.

Reason: Run summaries become searchable in Obsidian without adding generated logs to git or bloating the durable context notes.

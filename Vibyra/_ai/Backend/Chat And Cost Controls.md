# Backend - Chat And Cost Controls

Read this for `/api/chat`, OpenRouter request shape, skills, mode resolution, reasoning payloads, and token/cost controls.

## Files

- `backend/app/Http/Controllers/Concerns/ChatEndpoint.php`
- `backend/app/Http/Controllers/Concerns/ChatEndpointHelpers.php`
- `backend/app/Http/Controllers/Concerns/ChatAttachmentHelpers.php`
- `backend/app/Http/Controllers/Concerns/ChatOpenRouterHelpers.php`
- `backend/app/Http/Controllers/Concerns/ChatPreviewAppHelpers.php`
- `backend/app/Http/Controllers/Concerns/ChatStreamResponder.php`
- `backend/app/Http/Controllers/Concerns/ChatPrompting.php`
- `backend/app/Http/Controllers/Concerns/ChatResearchPlan.php`
- `backend/app/Http/Controllers/Concerns/ChatModelMap.php`
- `backend/app/Http/Controllers/Concerns/ChatLearningFeedback.php`
- `backend/config/skills.php`
- `backend/app/Services/Concerns/OpenAiStreaming.php`

## `/api/chat`

`ChatEndpoint::chat` validates user/credits, resolves chat/build mode, posts to OpenRouter with `max_completion_tokens`, deducts credits, extracts `<vibyra-app>` only in build mode, and returns reply plus optional app and refreshed credits.

`ChatEndpointHelpers::resolveChatMode` treats server-side build skills as authoritative, otherwise honors request `mode: "chat" | "build"`, then falls back to `isBuildPrompt` only for old clients. Keep the helper traits split by responsibility: attachments in `ChatAttachmentHelpers`, OpenRouter payload/model/reasoning helpers in `ChatOpenRouterHelpers`, runnable app extraction/preview shaping in `ChatPreviewAppHelpers`, and streaming response parsing/finalization in `ChatStreamResponder`.

`ChatPrompting` uses a slim system prompt by default and expands runnable-app instructions only for build mode. History is trimmed to 3 messages x 600 chars for chat, or 4 x 1200 chars for build. `fileBody` is truncated to 1200 chars in prompt shape.

`projectFiles` may include optional `snippet` fields for targeted project questions such as colour/theme/palette analysis. `ChatEndpointHelpers::projectFilesContext()` includes those indented snippets under each file path and caps the combined context at 12000 chars, so OpenRouter gets actual retrieved evidence without broad file bodies. When `projectFiles` is present, `ChatPrompting` also adds an answer rule telling the model to synthesize from provided context instead of returning bash/grep/rg/npm commands unless commands were explicitly requested. `ChatReplyGuard` is the deterministic fallback: for colour/theme prompts, if OpenRouter still returns a shell-command answer, it replaces that with a direct palette summary extracted from the snippets.

Chat learning memory is backend-only. Migration `2026_05_17_000001_create_chat_learning_memories_table.php` stores high-signal completed chat outcomes per user/project/mode, and additive migration `2026_05_17_000002_add_outcome_feedback_to_chat_learning_memories_table.php` adds nullable outcome feedback, context, error signature, file path JSON, and metadata fields for richer matching. `ChatLearningMemory.php` coordinates storage/retrieval, with ranking in `ChatLearningRanking.php`, persistence/redaction in `ChatLearningStorage.php`, and tag inference in `ChatLearningTags.php`. It retrieves up to three same-project similar past outcomes by token overlap, mode/tag fit, score, feedback, and recency, then `ChatPrompting::chatMessages()` injects them as compact "Relevant past Vibyra learning" suggestions. Both regular `/api/chat` and `/api/chat/stream` store outcomes after successful credit charging and return `chatReference` for feedback; memory failures are swallowed so chat cannot break.

`POST /api/chat/learning/feedback` is authenticated with the app bearer token and lets clients mark one of the current user's memory rows as `worked`, `did_not_work`, `helpful`, or `not_helpful`. Send `reference` / `chatReference` / `chat_reference` when available; otherwise send `learningMemoryId` / `memoryId` / `memory_id`. The endpoint updates only rows owned by the authenticated user, returns `{ ok: true, updatedCount, feedback }`, and treats missing matches as `updatedCount: 0`.

`POST /api/chat/research-plan` is an authenticated preflight planner for mobile Deep Research. It uses `ChatResearchPlan.php` and posts one tiny OpenRouter request to `google/gemini-2.5-flash-lite` with `max_completion_tokens = 260`, `temperature = 0.2`, `reasoning.exclude = true`, and no web-search tool. It returns `{ ok, title, steps, model }` where `steps` are exactly five topic-specific strings starting with Collect, Extract, Analyse, Correlate, and Summarise. This endpoint does not deduct Vibyra chat credits or write a chat ledger row; the actual paid Deep Research request is still `/api/chat` or `/api/chat/stream` with the accepted plan included in the prompt.

Learning-memory rollout keeps privacy/prompt-safety gates in code: stored prompt/reply/project text is redacted for common emails, tokens, API keys, and password/secret assignments; clients can opt out with `disableLearning`, `learningDisabled`, or `learningEnabled: false`; negative feedback hard-excludes a memory from retrieval; and cross-project memories are not injected by default. A future retention/deletion policy is still needed. Keep injected memory compact and included in estimated input tokens so credit preflight remains conservative for streaming and non-streaming chat.

Build-mode replies should return only a `<vibyra-app title="Name">...</vibyra-app>` block. Chat-mode strips any accidental runnable app block and returns plain conversation.

Runnable preview prompts must keep core app logic self-contained for phone iframe/WebView `srcdoc` previews: no external script CDNs, ESM imports, or CDN framework globals for new standalone builds. Use inline browser-native canvas/WebGL/CSS/SVG for games/3D, and require guarded inline fallbacks if a browser library is unavoidable. Relevant files: `backend/app/Http/Controllers/Concerns/ChatPrompting.php`, `backend/app/Services/Concerns/OpenAiStreaming.php`.

## Skills

`backend/config/skills.php` is the skill registry. `GET /api/skills` returns public-safe fields. `ChatEndpoint::chat` reads `skill`, resolves it, applies `prompt_template`, and appends `system_prompt_addon`.

To add a skill, edit `backend/config/skills.php` only. Required fields: `id`, `slash`, `label`, `description`, `category`, `mode`, `prompt_template`.

Only skills that declare a backend-only `model_key` override the selected model. Both `ChatEndpoint::chat` and `ChatStreamEndpoint::chatStream` call `ChatEndpointHelpers::effectiveChatModelKey()` after skill resolution and before plan/credit checks. Current tool model policy:

- `research` pins `tool-deep-research` -> `google/gemini-2.5-flash-lite` and enables OpenRouter `openrouter:web_search`; mobile also passes `model: tool-deep-research` so the chat UI shows the forced Deep Research tool model while active.
- `web` pins `tool-web-search` -> `google/gemini-2.5-flash-lite` and enables OpenRouter `openrouter:web_search`.
- `analyze` pins `tool-analyze-files` -> `google/gemini-2.5-flash-lite` without web search, with project file context/snippets supplied by mobile.

Keep tool model keys in `backend/config/billing.php` and `src/screens/workspace/data/chatModels.ts` so plan gating, fallback credit estimates, and app-side tool labels remain aligned. They are marked `tool_only` in billing and endpoint guards reject direct requests for `tool-deep-research`, `tool-web-search`, or `tool-analyze-files` unless the resolved skill owns that `model_key`; do not put tool-only keys in the visible model selector. These tools are intentionally budget-tier after the O3/premium-model cost spike; do not map them back to premium models without an explicit user-facing cost warning.


## Cost Controls

OpenRouter request safeguards:

- Runtime config reads `OPENROUTER_API_KEY` from `backend/.env`; a root `.env` key is not visible to the Laravel backend. After changing it, run `php artisan config:clear` from `backend/` before retesting.
- `ChatEndpointHelpers::openRouterChatPayload()` owns the shared `/api/chat` and `/api/chat/stream` payload shape. Keep `temperature` out of `openai/o3-deep-research` requests if that legacy model is ever used; OpenRouter accepts the model, but the upstream OpenAI provider rejects that parameter.
- `ChatEndpointHelpers::buildReasoningPayload()` forces legacy `openai/o3-deep-research` to `reasoning.effort = medium`; for current `google/gemini-2.5-flash-lite` tool mappings it sends `reasoning.exclude = true` to avoid hidden reasoning-token spend.
- `/api/chat/stream` creates its Guzzle client with `http_errors => false`; keep this so OpenRouter 4xx/5xx response bodies flow through the existing provider-error branch instead of being mislabeled as transport failures.
- `/api/chat/stream` does not request provider streaming for `tool-deep-research`; it posts a non-streaming OpenRouter chat completion, extracts the JSON answer, then emits Vibyra SSE `chunk`/`final` events to the app. Other models still parse OpenRouter SSE with LF/CRLF event separators and answer text from either `choices[].delta.content` or `choices[].message.content`.
- Deep Research backend OpenRouter calls use a 900s timeout keyed by `tool-deep-research`, matching the app's long stream timeout. Do not leave Deep Research on the generic Gemini Flash Lite 180s timeout, because its non-streaming provider request can legitimately take longer before the first app-visible chunk.
- Deep Research needs more completion budget than normal chat. The `research` skill and `tool-deep-research` requests use `max_completion_tokens = 16000` on Gemini Flash Lite with web search and no hidden reasoning tokens. Web search uses 1200 completion tokens; analyze files uses 1800. If OpenRouter returns a successful empty Deep Research completion, both `/api/chat` and `/api/chat/stream` retry once with an explicit final-answer instruction before emitting the empty-completion no-charge error.
- `CreditCalculator::estimateUsd()` must read fallback pricing from the full array by slug key. Do not use `config("...{$slug}")` for model slugs because dots inside IDs like `google/gemini-2.5-flash-lite` make Laravel dot-notation fall through to the expensive default estimate.
- `max_completion_tokens`: 800 for chat, 3000 for build.
- Boundary caps: prompt <= 8000 chars, fileBody <= 20000 chars, history <= 20 items.
- Per-plan user rate limits from `billing.plans.{plan}` plus global per-IP 30/min.
- Model access by tier through `CreditCalculator::planAllowsModel`.
- Real-usage credit metering via `usage: { include: true }` and `CreditDeductor::chargeForChat`.
- Chat preflight enforces credit balance, 5-hour burst cap, and weekly cap. It does not enforce the legacy daily credit cap for `/api/chat` or `/api/chat/stream`; daily counters may still be tracked for account/history data.

`CreditDeductor::chargeForChat` is the only chat credit writer. It uses `lockForUpdate` and inserts a ledger row in the same transaction.

## Reasoning

Reasoning payloads: `none` suppresses reasoning, `low|medium|high` pass through, and `xhigh` becomes `high` with a larger reasoning-token budget. Unknown values normalize to `medium`.

When changing messages, max tokens, model map, or runnable app extraction, update the split feature tests: `VibyraChatCoreApiTest.php`, `VibyraChatToolsApiTest.php`, `VibyraChatMemoryApiTest.php`, `VibyraChatStreamApiTest.php`, `VibyraPreviewPromptApiTest.php`, and the project preview security/static test files.

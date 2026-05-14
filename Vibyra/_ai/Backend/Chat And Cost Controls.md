# Backend - Chat And Cost Controls

Read this for `/api/chat`, OpenRouter request shape, skills, mode resolution, reasoning payloads, and token/cost controls.

## Files

- `backend/app/Http/Controllers/Concerns/ChatEndpoint.php`
- `backend/app/Http/Controllers/Concerns/ChatEndpointHelpers.php`
- `backend/app/Http/Controllers/Concerns/ChatPrompting.php`
- `backend/app/Http/Controllers/Concerns/ChatModelMap.php`
- `backend/config/skills.php`
- `backend/app/Services/Concerns/OpenAiStreaming.php`

## `/api/chat`

`ChatEndpoint::chat` validates user/credits, resolves chat/build mode, posts to OpenRouter with `max_completion_tokens`, deducts credits, extracts `<vibyra-app>` only in build mode, and returns reply plus optional app and refreshed credits.

`ChatEndpointHelpers::resolveChatMode` treats server-side build skills as authoritative, otherwise honors request `mode: "chat" | "build"`, then falls back to `isBuildPrompt` only for old clients.

`ChatPrompting` uses a slim system prompt by default and expands runnable-app instructions only for build mode. History is trimmed to 3 messages x 600 chars for chat, or 4 x 1200 chars for build. `fileBody` is truncated to 1200 chars in prompt shape.

`projectFiles` may include optional `snippet` fields for targeted project questions such as colour/theme/palette analysis. `ChatEndpointHelpers::projectFilesContext()` includes those indented snippets under each file path and caps the combined context at 12000 chars, so OpenRouter gets actual retrieved evidence without broad file bodies. When `projectFiles` is present, `ChatPrompting` also adds an answer rule telling the model to synthesize from provided context instead of returning bash/grep/rg/npm commands unless commands were explicitly requested. `ChatReplyGuard` is the deterministic fallback: for colour/theme prompts, if OpenRouter still returns a shell-command answer, it replaces that with a direct palette summary extracted from the snippets.

Build-mode replies should return only a `<vibyra-app title="Name">...</vibyra-app>` block. Chat-mode strips any accidental runnable app block and returns plain conversation.

Runnable preview prompts must keep core app logic self-contained for phone iframe/WebView `srcdoc` previews: no external script CDNs, ESM imports, or CDN framework globals for new standalone builds. Use inline browser-native canvas/WebGL/CSS/SVG for games/3D, and require guarded inline fallbacks if a browser library is unavoidable. Relevant files: `backend/app/Http/Controllers/Concerns/ChatPrompting.php`, `backend/app/Services/Concerns/OpenAiStreaming.php`.

## Skills

`backend/config/skills.php` is the skill registry. `GET /api/skills` returns public-safe fields. `ChatEndpoint::chat` reads `skill`, resolves it, applies `prompt_template`, and appends `system_prompt_addon`.

To add a skill, edit `backend/config/skills.php` only. Required fields: `id`, `slash`, `label`, `description`, `category`, `mode`, `prompt_template`.

## Cost Controls

OpenRouter request safeguards:

- `max_completion_tokens`: 800 for chat, 3000 for build.
- Boundary caps: prompt <= 8000 chars, fileBody <= 20000 chars, history <= 20 items.
- Per-plan user rate limits from `billing.plans.{plan}` plus global per-IP 30/min.
- Model access by tier through `CreditCalculator::planAllowsModel`.
- Real-usage credit metering via `usage: { include: true }` and `CreditDeductor::chargeForChat`.
- Daily soft caps per plan through `daily_credits_used` / `daily_credits_reset_at`.

`CreditDeductor::chargeForChat` is the only chat credit writer. It uses `lockForUpdate` and inserts a ledger row in the same transaction.

## Reasoning

Reasoning payloads: `none` suppresses reasoning, `low|medium|high` pass through, and `xhigh` becomes `high` with a larger reasoning-token budget. Unknown values normalize to `medium`.

When changing messages, max tokens, model map, or runnable app extraction, update `backend/tests/Feature/VibyraAppApiTest.php`.

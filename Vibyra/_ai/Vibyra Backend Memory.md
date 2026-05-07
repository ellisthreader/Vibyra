---
tags: [vibyra, memory, backend]
---

# Vibyra Backend Memory

Scope: Laravel backend in `backend/`. Owns auth, account/credits, cloud chat (OpenRouter), and remote app-state persistence.

## Mental Model

The backend is the cloud companion to the phone app. When the phone is not paired to a desktop, the mobile app talks here for AI chat and account state. When paired, the desktop bridge runs the agent locally and the backend only holds account/credit state.

## Entrypoints

- `backend/routes/web.php`: route table.
- `backend/app/Http/Controllers/VibyraDesktopController.php`: aggregates trait-based concerns.
- `backend/config/services.php`: `services.openrouter.{key,url}` driven by env.
- `backend/.env`: `OPENROUTER_API_KEY`, `OPENROUTER_API_URL` (default `https://openrouter.ai/api/v1/chat/completions`).

## Concern Traits (`backend/app/Http/Controllers/Concerns/`)

- `ChatEndpoint`: `POST /api/chat`. Validates user/credits, posts to OpenRouter with `max_completion_tokens` cap, deducts credits, extracts `<vibyra-app>` runnable preview from the reply, returns reply + optional app + credit balance.
- `ChatPrompting`: builds the OpenRouter `messages` array. Slim system prompt by default; expands with runnable-app instructions only when `isBuildPrompt()` matches build/create/make verbs + app/page/dashboard nouns. Trims history window and per-message char cap based on build mode. Truncates `fileBody` to 1200 chars.
- `ChatModelMap`: maps Vibyra model keys (`auto`, etc.) to OpenRouter model ids; declares per-model credit cost.
- `AgentExecution`: streaming agent run path (used by desktop bridge integration).
- `OpenAiStreaming`: shared OpenRouter call helper for streaming flows; resolves model id, validates key, classifies HTTP errors into user-facing strings.
- `AgentLocking`: prevents concurrent agent runs per project.
- `ChatHistory`, `SessionState`: account/app-state persistence backing `POST /api/session/state`.

## Token Cost Controls

The backend is the budget gatekeeper. Two levers:

1. **`max_completion_tokens` on every OpenRouter request** (`ChatEndpoint::chat`): `800` for plain chat, `3000` for build prompts. Without this OpenRouter reserves the model's full output window against credits, causing "requested up to N tokens" failures on small balances.
2. **Slim system prompt by default** (`ChatPrompting::systemPrompt`). The runnable-app instructions only ship when the prompt looks like a build request.

History window: 3 messages × 600 chars (chat) or 4 × 1200 (build). File body: only sent when build mode, capped at 1200 chars (frontend pre-trims too in `useAgentActions.ts`).

## Runnable App Protocol

`ChatPrompting` instructs the model to wrap generated apps in:

```
<vibyra-app title="Name">
<!doctype html>...
</vibyra-app>
```

`ChatEndpoint::extractRunnableApp` parses this, strips it from the assistant reply, and `ensureContentSecurityPolicy` injects a CSP `<meta>` allowing only the approved CDNs (`cdn.jsdelivr.net`, `unpkg.com`, `cdn.tailwindcss.com`, `fonts.googleapis.com`, `fonts.gstatic.com`). The phone renders the `app.html` in a sandboxed WebView.

## Account / Cloud Sync

`POST /api/session/state` accepts `{ onboardingComplete, rememberedDesktops, appState }` and persists per user. The mobile `useCloudSync` debounces calls; on failure it now backs off 30s before retrying (avoid console spam when the backend is down).

Auth: bearer token issued at login/signup; `authenticatedUser($request)` resolves it.

## Tests

`backend/tests/Feature/VibyraAppApiTest.php`:

- `test_chat_uses_openrouter_and_deducts_credits`
- session-state persistence tests

When changing OpenRouter request shape (`messages`, `max_completion_tokens`, model map), update fixtures here.

Desktop project ids now fail closed: `ProjectDiscovery::projectById` returns `null` for unknown ids instead of falling back to the first project. This prevents stale mobile chat/project state from running the desktop agent on a random old project.

## Token Hints

For backend tasks, start with this note plus `VibyraDesktopController.php` and only the relevant `Concerns/*.php` trait. Do not read `vendor/`. Use `rg` for route names and trait method names.

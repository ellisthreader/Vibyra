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

## Slash-Command Skills

`backend/config/skills.php` declares the chat skill registry (`id`, `slash`, `label`, `description`, `category`, `mode`, `prompt_template`, optional `system_prompt_addon`). `VibyraAppController::skills` exposes it over `GET /api/skills` (returns the public-safe subset — drops `prompt_template` and `system_prompt_addon`). The mobile app fetches it once on `AppProvider` mount and caches in `state.chatSkills`.

`ChatEndpoint::chat` reads the `skill` field from the request body and resolves it via `resolveSkill()`. If matched, `ChatPrompting::chatMessages` wraps the user prompt with `prompt_template` (placeholders: `{{prompt}}` for the body, `{{file}}` for the selected file path) and appends `system_prompt_addon` to the system prompt. `ChatEndpoint::resolveMaxTokens` uses `skill.mode` to pick `max_completion_tokens` (`build` → 3000, `chat` → 800), falling back to the `isBuildPrompt` regex when no skill is supplied.

To add a skill, edit `backend/config/skills.php` only — no controller or trait changes needed. Required fields: `id`, `slash` (must start with `/`), `label`, `description`, `category`, `mode` (`chat`|`build`), `prompt_template`. Optional: `system_prompt_addon`. Keep skills purely declarative; behavioral logic stays in the traits.

## Token Cost Controls

The backend is the budget gatekeeper. Levers all live in `ChatEndpoint::chat` plus `App\Services\Billing\*`:

1. **`max_completion_tokens` on every OpenRouter request**: `800` for plain chat, `3000` for build prompts. Without this OpenRouter reserves the model's full output window against credits.
2. **Slim system prompt by default** (`ChatPrompting::systemPrompt`). Build instructions only ship when the prompt looks like a build request.
3. **Input size caps at the controller boundary**: prompt `<= 8000` chars, `fileBody` `<= 20000` chars, `history` array `<= 20` items (consts `CHAT_PROMPT_MAX_CHARS`, `CHAT_FILE_BODY_MAX_CHARS`, `CHAT_HISTORY_MAX_ITEMS`). These cap *input* tokens, which `max_completion_tokens` does not.
4. **Per-plan rate limits** via `Illuminate\Support\Facades\RateLimiter` in `enforceChatRateLimit` — pulled from `billing.plans.{plan}.rate_per_minute` and `rate_per_hour`. Free `6/60`, Starter `12/200`, Builder `20/600`, Pro `40/1500`. Per-IP `30/min` is global. Each bucket is independent; tripping any one returns `429 { error, retryAfter }`.
5. **Locked model whitelist via tiers** (`CreditCalculator::planAllowsModel`): the model's tier (`free|budget|balanced|premium`) must be in the plan's `allowed_tiers`. Free→free+budget; Starter→+balanced; Builder/Pro→all. Mismatched tier returns `403 { error, requiredTier, plan }`. The legacy `ChatModelMap::resolveOpenRouterModel` slash-bypass remains gone — coerce unknown keys to `auto` via `CreditCalculator::modelConfig`.
6. **Real-usage credit metering**: `credits = ceil(openrouter_usd * 100 * effective_multiplier)`. The OpenRouter request now opts in to `usage: { include: true }` so `usage.cost` is returned per response. Pre-call `CreditCalculator::estimateCredits` rejects under-funded requests with `402 { estimatedCredits, creditsBalance }`. Post-call `CreditDeductor::chargeForChat` is the **only** place that writes `users.credits_balance` for chat — it does an atomic `lockForUpdate` + ledger insert in a single transaction. Effective multiplier = model's per-tier markup (1.0 / 1.15 / 1.35–1.5) × 1.25 if total tokens ≥ `surcharges.long_context_threshold_tokens` (100k) × 1.20 if `agentMode`. Minimum charge is 1 credit.
7. **Daily soft cap** per plan (`billing.plans.{plan}.daily_credit_cap`): Free 5, Starter 100, Builder 360, Pro 900. `CreditDeductor::maybeResetDaily` rolls the counter at the next stored `daily_credits_reset_at` (set to next-midnight on first hit of the day). Exceeding it returns `429 { dailyCap, dailyCreditsUsed }` — same status as rate limits but the error copy distinguishes them.

History window after caps: 3 messages × 600 chars (chat) or 4 × 1200 (build). File body: only sent when build mode, capped at 1200 chars inside `chatMessages`. The 20000-char fileBody cap is the *boundary* limit, the 1200-char cap is the *prompt-shape* limit.

## Membership / Billing

Source of truth: `backend/config/billing.php` — plans (Free £0, Starter £19, Builder £49, Pro £99 monthly; annual is `× 10` with +10% credits/month bonus), models with tier+multiplier, fallback per-million-token pricing, surcharges (long-context 1.25×, agent 1.20×), topup SKUs (500cr/£8, 1500cr/£20, 4000cr/£45), Stripe price env keys, IAP product map.

Two payment paths converge on the same DB writes:

- **Mobile (Apple/Google IAP)**: `expo-iap` requestPurchase → `onPurchaseSuccess` → frontend `reportIapReceipt` POSTs `/api/billing/iap-receipt {platform, productId, transactionId, receipt}` → `IapReceiptVerifier::verify` (Apple: real `verifyReceipt` with sandbox fallback on status 21007; Google: stubbed pending Play Developer API integration — `service_account_json` env required) → `iap_receipts.unique(platform, transaction_id)` ensures idempotency → `applySubscription()` or `CreditDeductor::grant()` for topups → frontend gets refreshed `RemoteUser`.
- **Web/Desktop (Stripe)**: `POST /api/billing/checkout {kind: subscription|topup, ...}` → Stripe Checkout session URL → frontend opens it. Stripe webhook (`POST /api/billing/webhook`) verifies signature with `STRIPE_WEBHOOK_SECRET`, handles `checkout.session.completed` (subscription or topup via session.metadata.userId/plan/cycle/topup), `customer.subscription.updated/deleted` (downgrades to free), `invoice.paid` (calls `CreditDeductor::refresh` with the plan allowance for monthly renewal). `POST /api/billing/portal` returns a Customer Portal URL for cancel/update.

Fallback safety net: `php artisan vibyra:refresh-credits` runs daily at 00:05 UTC (registered in `routes/console.php`). It refreshes every user with `plan_renews_at <= now()` to the current plan's monthly or annual allowance via `CreditDeductor::refresh`. This is what keeps IAP-only users (where Stripe `invoice.paid` will never fire) on the right credit budget.

`CreditDeductor` is the **only** writer for `credits_balance`. Chat spend, topup grants, refunds, and refresh all go through it; each call writes a `credit_ledger` row inside the same transaction (with `unique(user_id, reference)` for replay safety). `users.daily_credits_used` and `daily_credits_reset_at` track the rolling cap; `plan_renews_at` is the next refresh due date; `stripe_customer_id`/`stripe_subscription_id` are stamped on first Stripe interaction; `billing_provider` records `stripe` or `iap-apple` / `iap-google`.

`userPayload` exposes the plan view to the frontend: `plan`, `planBillingCycle`, `planRenewsAt`, `creditsBalance`, `creditsUsed`, `dailyCreditsUsed`, `dailyCreditsCap`, `monthlyCredits`, `allowedModelTiers`. The frontend mirror lives in `src/utils/persistence.ts::PersistedUser` and `src/utils/appApi.ts::RemoteUser`.

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

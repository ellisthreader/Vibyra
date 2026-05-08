# Decisions

## 2026-05-08: Membership System — Hybrid IAP+Stripe, Plan Tiers, Real-Usage Credit Math, Daily Cap

Decision: Vibyra ships a four-tier membership system (Free £0, Starter £19, Builder £49, Pro £99 — monthly, with a `× 10` annual price = "2 months free" plus +10% credits/month for annual). Mobile uses Apple/Google IAP via existing `expo-iap` flow; web/desktop uses Stripe Checkout. Both paths converge on `App\Services\Billing\CreditDeductor` which is the single writer for `users.credits_balance`, `credits_used`, `daily_credits_used`, `daily_credits_reset_at`, and the new `credit_ledger` table (one row per spend, grant, refresh). Source of truth for plan/model/multiplier/topup data is `backend/config/billing.php`.

Credit math: `credits = ceil(openrouter_usd * 100 * effective_multiplier)`, minimum 1. `effective_multiplier` starts at the model's per-tier markup (`auto`/budget = 1.0, balanced = 1.15, premium = 1.35–1.5) and stacks `× 1.25` for long-context (≥100k tokens) and `× 1.20` for agent-mode (build prompts or skill mode=build). `ChatEndpoint::chat` does a pre-call estimate via `CreditCalculator::estimateCredits` (using fallback per-million-token pricing in `billing.fallback_pricing_per_million_usd`) to reject under-funded requests with `402`, then deducts the *actual* cost from OpenRouter's `usage` payload (`usage.cost`, `prompt_tokens`, `completion_tokens`) post-call. The OpenRouter request now includes `usage: { include: true }` so cost is returned. If `usage.cost` is missing, deduction falls back to the same fallback-pricing estimate. The flat `ChatModelMap::creditCost(modelKey)` (1/2/4/6) is no longer authoritative for chat — it remains in the trait only as a vestigial helper for unrelated agent endpoints.

Plan gating happens in three layers: (1) **model whitelist** — `CreditCalculator::planAllowsModel($plan, $modelKey)` returns false if the model's tier is not in the plan's `allowed_tiers`. The ChatEndpoint returns `403 { error, requiredTier, plan }`. Free→`free,budget` only; Starter→`free,budget,balanced`; Builder/Pro→all four tiers. (2) **per-plan rate limits** read from `billing.plans.{plan}.rate_per_minute` and `rate_per_hour` (replacing the previous global `12/min`, `200/hour` constants). Free is `6/min`, `60/h`; Starter `12/200`; Builder `20/600`; Pro `40/1500`. (3) **daily soft cap** — `billing.plans.{plan}.daily_credit_cap` (Free 5, Starter 100, Builder 360, Pro 900). `CreditDeductor::maybeResetDaily` rolls the counter at the next `daily_credits_reset_at` (set on first hit of the day to next-midnight). Going over returns `429 { error, dailyCap, dailyCreditsUsed }`.

Billing endpoints (new `BillingController`):
- `GET /api/billing/plans` — public-friendly plan + topup catalogue.
- `POST /api/billing/checkout` — Stripe Checkout session for `subscription` (plan+cycle) or `topup`. Creates the Stripe Customer if missing, stamps `users.stripe_customer_id`.
- `POST /api/billing/portal` — Stripe Customer Portal for managing/cancelling.
- `POST /api/billing/iap-receipt` — accepts `{ platform: apple|google, productId, transactionId, receipt }` from mobile after a successful `expo-iap` purchase. Verifies via `IapReceiptVerifier` (Apple: real `verifyReceipt` call with sandbox fallback on status 21007; Google: stubbed pending Play Developer API config — receipts are recorded with unique-transaction protection but treated as opaque). Idempotent on `(platform, transaction_id)` via the new `iap_receipts` table. Resolves `billing.iap_products[productId]` to either a `subscription` (calls `applySubscription`) or `topup` (grants credits via ledger).
- `POST /api/billing/webhook` — Stripe webhook with HMAC signature verification (`STRIPE_WEBHOOK_SECRET`). Handles `checkout.session.completed` (subscriptions and one-time topups via session metadata), `customer.subscription.updated/deleted` (downgrades to free on cancel), `invoice.paid` (monthly renewal → `CreditDeductor::refresh` with the plan's monthly allowance).

Migrations: `2026_05_08_000001_add_billing_fields_to_users_table` (plan_billing_cycle, plan_renews_at, daily_credits_used, daily_credits_reset_at, stripe_customer_id, stripe_subscription_id, billing_provider with indexes); `…_000002_create_credit_ledger_table` (per-spend audit, unique on `(user_id, reference)` for idempotency); `…_000003_create_iap_receipts_table` (unique on `(platform, transaction_id)`).

Cron: `php artisan vibyra:refresh-credits` runs daily at 00:05 UTC (registered in `routes/console.php` via `Schedule::command(...)->dailyAt('00:05')->withoutOverlapping()`). Iterates users where `plan_renews_at <= now()`, computes the plan's monthly or annual-cycle allowance (annual cycle gets the +10% bonus, e.g. Starter 500→550), and calls `CreditDeductor::refresh`. Stripe `invoice.paid` webhooks also trigger refresh out-of-band.

Files: `backend/config/billing.php` (plan matrix, models, multipliers, topups, Stripe price env keys, IAP product map), `backend/app/Services/Billing/CreditCalculator.php`, `…/CreditDeductor.php`, `…/IapReceiptVerifier.php`, `backend/app/Http/Controllers/BillingController.php`, `backend/app/Http/Controllers/Concerns/ChatEndpoint.php` (rewritten), `backend/app/Http/Controllers/Concerns/UserPayloads.php` (userPayload now exposes planBillingCycle, planRenewsAt, dailyCreditsUsed, dailyCreditsCap, monthlyCredits, allowedModelTiers), `backend/app/Models/User.php` (fillable + casts), `backend/app/Models/CreditLedger.php`, `backend/app/Models/IapReceipt.php`, `backend/app/Console/Commands/RefreshCredits.php`, three migrations dated 2026_05_08, `backend/routes/web.php` (5 new billing routes), `backend/routes/console.php` (schedule), `backend/composer.json` (stripe/stripe-php ^20.1), `backend/.env.example` (Stripe + Apple/Google IAP keys), `backend/config/services.php` (stripe, apple_iap, google_iap blocks). Frontend: `src/utils/billingApi.ts` (new), `src/utils/appApi.ts` (RemoteUser + ChatResponse extended; new BillingPlan/Topup/Checkout/IapReceipt response types), `src/utils/persistence.ts` (PersistedUser extended, normalizer fills new fields), `src/screens/onboarding/data/plans.ts` (new spec ladder + topup SKUs + planKeyMap), `src/screens/onboarding/steps/usePricingPurchase.ts` (forwards purchase to `/api/billing/iap-receipt` before finishTransaction), `src/screens/workspace/data/chatModels.ts` (new modelTiers, planAllowedTiers, modelLockedForTiers helper — replaces blanket `model.locked`), `src/screens/workspace/inline/chunk10.tsx` (isModelLockedForPlan now tier-aware; added `modelLockReason` for accurate "Starter+/Builder+" pill labels), `src/screens/workspace/inline/profile/types.ts` (PLAN_TIERS rewritten to spec prices + features), `src/screens/workspace/inline/profile/BillingSheet.tsx` (Stripe checkout for plan upgrades, Stripe portal for "Manage payments"), `src/context/agentErrors.ts` (friendlier copy for 402/daily-cap/plan-locked-model errors), `src/context/AppContext.tsx` (new `applyRemoteUserFromIap` action), `src/context/appContextTypes.ts` (action signature), `src/context/useAppState.ts` (PersistedUser fill).

Reason: The pricing model spec (`/home/ellis/Downloads/vibyra_saas_token_pricing_model (1).txt`) demands credit-as-budget metering keyed off real OpenRouter cost — a flat per-call charge (the prior `creditCost(modelKey)` returning 1/2/4/6) under-charges premium model users and over-charges budget model users, and gives no way to enforce the spec's daily caps and per-plan AI cost ceilings ($0.50/$5/$18/$45 monthly). The hybrid IAP+Stripe path is forced by Apple/Google IAP rules: digital subscriptions on iOS/Android **must** go through native IAP or the app gets rejected on review; Stripe-only would block the mobile launch. The credit ledger is required so that (a) refunds and admin grants don't drift from reality, and (b) future cost analytics ("which plan is over-budget?") can be answered from one table instead of replaying webhook history.

How to apply: When adding a new model, edit `billing.models` (slug, tier, multiplier) and `fallback_pricing_per_million_usd` (input/output USD per 1M tokens — over-estimate slightly so estimates don't under-charge), then mirror the tier in `src/screens/workspace/data/chatModels.ts::modelTiers`. Don't add new lock checks based on plan name — always go through `modelLockedForTiers`. When adding a new plan, edit `billing.plans` (allowance, cap, allowed tiers, rate limits, max projects/agents) and add the Stripe price-env keys to both `billing.stripe_prices` and `.env.example`; the cron + webhook automatically pick it up. Never charge credits outside `CreditDeductor` (it's the only place that writes the ledger atomically with the balance update via `lockForUpdate`). The `vibyra:refresh-credits` cron is the safety net for users on the IAP path who don't generate Stripe `invoice.paid` events; it MUST keep running daily even after Stripe is fully wired.

## 2026-05-08: `/api/chat` Hardened Against Abuse — Rate Limits, Size Caps, Locked Model Whitelist

Decision: `backend/app/Http/Controllers/Concerns/ChatEndpoint.php` now enforces three rate-limit buckets per request via `Illuminate\Support\Facades\RateLimiter`: per-user `12/min` (`chat:user:{id}:1m`), per-user `200/hour` (`chat:user:{id}:1h`), per-IP `30/min` (`chat:ip:sha1(ip):1m`). All three are hit on every request; any one tripping returns `429` with `retryAfter` (seconds). Limits live as class consts (`CHAT_PER_USER_PER_MINUTE`, `CHAT_PER_USER_PER_HOUR`, `CHAT_PER_IP_PER_MINUTE`). The endpoint also caps inputs at the controller boundary: prompt `<= 8000` chars (`CHAT_PROMPT_MAX_CHARS` → 413), `fileBody` `<= 20000` chars (`CHAT_FILE_BODY_MAX_CHARS` → 413), and `history` must be an array of `<= 20` items (`CHAT_HISTORY_MAX_ITEMS` → 422). Unknown `model` keys now silently coerce to `auto` instead of being passed through — `ChatModelMap::resolveOpenRouterModel` no longer has the `if (str_contains($model, '/')) return $model;` slash-bypass that previously let any client request any OpenRouter model regardless of the whitelist; new helper `isKnownModelKey` validates membership against `MODEL_MAP` before resolution.

Files: `backend/app/Http/Controllers/Concerns/ChatEndpoint.php` (new `enforceChatRateLimit`, size + history validation, model-key normalisation), `backend/app/Http/Controllers/Concerns/ChatModelMap.php` (removed slash bypass, added `isKnownModelKey`).

Reason: Prior state — only auth + credit balance gated the endpoint. With unbounded prompt size, OpenRouter input-token cost (which is per-token, not per-call) was effectively uncapped: `max_completion_tokens` only caps *output*. The slash-bypass meant a client could send `model: "anthropic/claude-opus-4-1"` while `creditCost("anthropic/claude-opus-4-1")` matched the cheap "mini" branch via `str_contains` heuristics — full premium cost on a 1-credit charge. No rate limiter at all meant a single token (or signup-spammed account) could fan out hundreds of requests per second. The OpenRouter key lives in `backend/.env` and is shared across all users, so a single abusive client drains the org's spend.

How to apply: When adding new OpenRouter-touching endpoints (e.g. agent streaming, future skills), mirror the same three-bucket rate-limit pattern and the same size caps. Never re-introduce a "raw model passthrough" — every model selection must be a key in `ChatModelMap::MODEL_MAP`. If you need to whitelist a new model, add the key to the map and the appropriate cost branch in `creditCost()`. Per-user credit checks remain the secondary defence; rate limits are the primary defence against burst abuse, and size caps are the primary defence against per-request token-cost abuse. Background callers should NOT bypass these limits by routing through a different endpoint — extend the limits, don't sidestep them.

## 2026-05-08: Detached-Chat NLU Tolerates Typos, Filler, And Quoted-Only Intents

Decision: The detached-chat (no project attached) intent layer in `src/screens/workspace/helpers/chatPrompts.ts` is now noise-tolerant. The find-folder verb set expanded from `find|open|locate|use|switch|select|go to|work on|work in` to also include `connect(?: to)?`, `attach(?: to)?`, `load`, `pick`, `choose`, `show( me)?`, `view`, `get`, `grab`, `link( to)?`, `hook up`, `set( up)?`, `pull up`, `bring up`, `jump to/into`, `head to/into`. The target-noun set added `files?`, `path`, `workspace`, `src`, `source`, `dir`, plus typo variants `fodler|foler|floder`, `projct|projet`, `fiel`, `diretory|directry`. A `FILLER_PREFIX` regex strips leading `yes|yeah|yep|yup|ya|ok|okay|kk|sure|please|pls|plz|no|nope|not|nah|hi|hey|hello|yo|um|uh|so|well|maybe|just|actually|hmm|alright|right|cool` (chained) before extraction. `isFindFolderIntent` now also returns true when there is no verb but the prompt contains a target noun plus a quoted name OR a `called/named/titled/labelled` phrase, so `'no file "claude test"'` is recognised. `extractFolderName` gained two ordered passes: (3) `<verb> <noun> NAME` (e.g. `open folder claudetest`) and (5) `<noun> NAME` (e.g. `file "claude test"`); these run before the older `NAME <noun>` trailing pass that previously captured `"yes open"` from `"yes open folder claudetest"`. New helpers: `isGreeting`, `isSmallTalk`, `isBareName`/`bareNameCandidate`, plus reply strings `greetingReply`, `smallTalkReply`, `detachedFallbackReply`, `bareNameClarifyReply`. `useWorkspaceActions.onStartChat` now handles greeting and small-talk before the `awaitingFolderNameRef` branch (detached only), and falls through bare names to a clarify reply that suggests `open folder <name>` instead of the generic "I will keep this new chat blank" canned line.

Files: `src/screens/workspace/helpers/chatPrompts.ts` (rewrote intent + extraction; added `FIND_VERBS`, `FOLDER_NOUN`, `FILE_NOUN`, `TARGET_NOUN`, `FILLER_PREFIX`, `GREETING_RE`, `SMALL_TALK_RE`, `STOP_NAMES`; new exports listed above; preserved `extractFileName`, `isOpenFileIntent`, `cleanFileCandidate`), `src/screens/workspace/hooks/useWorkspaceActions.ts` (imports new helpers; `onStartChat` greeting/small-talk pre-branch in detached mode; bare-name clarify branch in the trailing detached fallback).

Reason: A user transcript showed five back-to-back detached-chat messages all hitting the same generic "Start by opening a project" canned reply: `hi`, `okay connect to file test1 on my desktop`, `yes open folder claudetest on my pc`, `no file "claude test"`, `open file "claude test"`. Root causes: greetings had no handler; `connect` and `attach` were not in the verb list; `file`/`path` were not in the noun list; the `<verb> <noun> NAME` shape had no extractor pass so the fallback `NAME <noun>` regex captured `"yes open"` from `"yes open folder claudetest"`; intent detection required a verb so a quoted name without a verb (like `'no file "claude test"'`) silently failed. Realism here is load-bearing — without it, the chat looks broken before a project is even attached.

How to apply: When adding new conversational gaps, prefer extending the centralised `FIND_VERBS`/`TARGET_NOUN`/`FILLER_PREFIX` constants over inlining new regexes in `useWorkspaceActions.ts`. The extractor passes are intentionally ordered most-specific → least-specific; insert new patterns near the matching specificity, not at the end. Quoted/`called`-named intents are valid even without a verb — keep that branch when extending `isFindFolderIntent`. Greeting and small-talk handlers run only when `detached` is true; do not promote them to attached chats (they would shadow real prompts to the agent). Typo lists are deliberately conservative — only add a typo variant when it appears in a real user transcript, not speculatively.

## 2026-05-08: `npm run dev` Runs Backend + Expo Together

Decision: Added `backend` and `dev` scripts to root `package.json`. `npm run backend` starts Laravel on `0.0.0.0:8000`. `npm run dev` runs Laravel and Expo together via a `bash -c 'trap "kill 0" EXIT; (cd backend && php artisan serve …) & expo start --host lan; wait'` wrapper so a single `Ctrl+C` kills both processes cleanly.

Files: `package.json` (`scripts.backend`, `scripts.dev`), `Vibyra/_ai/Runbook.md` (Local App section rewritten).

Reason: The "AI chat doesn't reply" symptom traced back, end-to-end, to the Laravel backend not running on `:8000`. Verified by `ss -tlnp` showing only `:4317` (the desktop bridge) listening, then `curl` confirming `/api/skills` and `/api/chat` work the moment the server is started. Without a single-command launcher, it's easy to forget the backend; the failure is silent because `appApiRequest`'s thrown error gets mapped to the friendly "I could not reach Vibyra from the app." chat reply via `src/context/agentErrors.ts::userFacingAgentError`, and the browser's native `ERR_CONNECTION_REFUSED` is the only loud signal — and that's in the dev console, not the app UI.

How to apply: Default to `npm run dev` for local work. If running processes separately, start `npm run backend` *before* `npm start` so the first cloud-sync / skills-fetch lands on a live backend (otherwise the shared backend-offline gate from `appApiRequest` will silence the next 60s of background polls). Liveness probe: `curl -s http://127.0.0.1:8000/api/skills | head -c 80` should return `{"ok":true,"skills":[...`.

## 2026-05-08: Shared Backend-Offline Gate For Background Requests

Decision: `src/utils/appApi.ts` exports a module-level `backendOfflineUntil` timestamp with `markBackendOffline()`, `markBackendOnline()`, `isBackendKnownOffline()` helpers and a 60s cooldown (`BACKEND_OFFLINE_COOLDOWN_MS`). `appApiRequest` accepts a fourth `meta?: AppApiRequestMeta` argument with `{ background?: boolean }`. When `background: true` and the gate is set, the request is short-circuited via a `BackendOfflineError` BEFORE the fetch is even attempted — so the browser never logs `ERR_CONNECTION_REFUSED` for skipped background calls. Network errors and 5xx responses set the gate; successful responses clear it. Foreground (user-initiated) requests still attempt regardless and let the user see the failure.

Files: `src/utils/appApi.ts` (gate state, helpers, `BackendOfflineError`, updated `appApiRequest` signature), `src/context/useCloudSync.ts` (passes `{ background: true }` to `/api/session/state`), `src/context/AppContext.tsx` (passes `{ background: true }` to `/api/skills`).

Reason: The previous per-effect cooldown in `useCloudSync` only suppressed *its own* repeats; every other background caller (skills fetch, future polls) emitted its own `ERR_CONNECTION_REFUSED` log when the backend was down, and any state change after the 30s window ticked over would log another. With multiple callers and the user typing, a single backend outage produced repeated console noise. Centralising the gate means: one log on first failure, then total silence for 60s across all background callers, then one probe attempt — repeat. User-initiated requests (chat, agent start, login) bypass the gate so failures still surface to the user.

How to apply: Any new background poll/sync call to the Laravel backend MUST pass `{ background: true }` as the fourth `appApiRequest` argument. User-initiated requests must NOT pass `background: true` — they need to fail loudly so the user understands the action didn't go through. The browser's native `ERR_CONNECTION_REFUSED` log cannot be suppressed once a request fires; the only way to silence it is to skip the request, which is what the gate does. If a foreground request needs the gate (rare — e.g. a "preflight" liveness probe), do it explicitly via `isBackendKnownOffline()` rather than weakening the foreground/background distinction.

## 2026-05-08: Conversational Folder-Search Flow With Pending-Name State

Decision: When the user expresses a "find a folder on my PC" intent without naming a folder, the bot asks "what's the folder called?" and stores `awaitingFolderNameRef = true`. The next message is treated as the folder name (with prefix-stripping for "yes/yeah/sure/please/its called/named X" tails). The actual folder-name extraction is consolidated in `extractFolderName(prompt)` in `src/screens/workspace/helpers/chatPrompts.ts`, which returns `null` (instead of a junk prompt fragment) when no clean name can be derived. `desktopProjectSearchQuery` is now a thin wrapper around `extractFolderName`. `isCurrentProjectQuestion` no longer treats `open` as a where-am-I trigger word — that was misclassifying "can you open test1 folder on the desktop" as a context question.

Files: `src/screens/workspace/helpers/chatPrompts.ts` (new `extractFolderName`, `isFindFolderIntent`, `cleanCandidateName`, `STOP_NAMES`; tightened `isCurrentProjectQuestion`; `isProjectLookupOnly` reuses the new intent helper), `src/screens/workspace/hooks/useWorkspaceActions.ts` (`awaitingFolderNameRef`, `runFolderSearch`, rewritten `onStartChat` decision tree; removed dead `promptReferencesPcFolder`).

Reason: Previously the bot's flow was a stack of brittle keyword regexes that failed on natural conversation. Examples that broke:
- "Can you find a project on my PC" — extractor returned the literal string `""` after stripping ` on my PC`, search fired with empty query.
- "Can you open test1 folder on the desktop" — `isCurrentProjectQuestion` matched on `open` + `folder` and replied with the new-chat fallback.
- "yes find it on my pc" — extractor returned the entire prompt as a search term, backend returned no matches.
- "no its called test 1" — no `(on|in) my pc` match in `promptReferencesPcFolder`, so the bot fell through to the generic "Start by opening a project" reply, losing the conversation thread.

The fix is two-pronged: (a) make extraction conservative — return `null` instead of leaking junk; (b) hold a one-message conversational state so the bot can ask for missing info and then accept the answer in any natural form.

How to apply: New conversational helpers should follow the same pattern — a *Ref-flagged "awaiting X" state, a single-purpose extractor that returns null on uncertainty, and a stripped-prefix fallback for the answering message. Don't extend the keyword regexes any further; if the next conversational gap appears, prefer adding another awaiting-state branch over loosening the regexes (which historically caused false positives like the `open` → where-am-I bug). The user-side regex for build-mode in `useAgentActions.ts` and the server `isBuildPrompt` are intentionally untouched — they have a different purpose (cost mode selection, not intent disambiguation).

## 2026-05-08: Folder Adoption Survives Re-pair And Cold Launch

Decision: When the desktop returns its project list (pairing approval, project creation, etc.) the mobile app **merges** the incoming list with the current `app.projects` instead of replacing it. Adopted folders that the desktop has not auto-discovered are preserved. Additionally, every project that becomes attached to a chat (`adoptProject`, `createProject`, `createLocalProject`) is upserted into `state.chatProjects: Record<id, Project>`, which is persisted via `useCloudSync` and re-merged into `app.projects` on `applyRemoteUser`. `openProjectPreview` now falls back to opening the chat directly when the project id is not in `app.projects`, so users never see the desktop's "Project not found" preview shell.

Files: `src/utils/files.ts` (`mergeProjects` helper), `src/context/usePairingActions.ts` (uses `mergeProjects` after pair approval), `src/context/useWorkspaceActions.ts` (uses `mergeProjects` in `createProject`; upserts `chatProjects` in `createProject`/`createLocalProject`/`adoptProject`; defensive `known` guard in `openProjectPreview`), `src/context/useAppState.ts` (`chatProjects` state + setter), `src/context/appContextTypes.ts`, `src/context/AppContext.tsx` (passes `chatProjects` to `useCloudSync`; restores + re-merges on `applyRemoteUser`), `src/context/useCloudSync.ts` (`chatProjects` in snapshot + payload + deps).

Reason: Previously `setProjects(result.projects)` replaced the list, so any folder the user adopted via "find X on my desktop" disappeared the next time desktop discovery ran (or after a cold launch where `starterProjects` seeded the list). Their chat thread (`chatThreads[id]`) was preserved but the project metadata was gone, so opening the chat triggered `openProjectPreview` → desktop `/preview/project/{id}/{token}/` → `ProjectPreview.php` 404 → "Vibyra Desktop could not find that workspace anymore" preview shell.

How to apply: Any new code that calls `setters.setProjects(result.projects)` from a desktop response must use `mergeProjects(current, result.projects)` instead. Whenever a project is freshly attached to a chat thread, also upsert into `chatProjects` so it persists across launches. `chatProjects` is the source of truth for "projects the user owns chats for"; `app.projects` is the live discovery list. The two are merged at restore time.

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

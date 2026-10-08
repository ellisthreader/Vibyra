# Vibyra iOS: Vibes economy plan

Reviewed 9 September 2026. Implementation has since been added to `mobile/`,
Laravel and Host. Read [implementation and acceptance](ios-vibes-implementation.md)
for delivered behaviour, tests, deliberate scope limits and remaining release gates.
The findings and recommendations below preserve the original pre-implementation
review; they are not a claim that every release acceptance item is complete.

## Recommended product

Call the currency **Vibes**, with “AI credits” in its first explanation. Keep one
balance, one model selector, and one upgrade sheet. Credits are usage units, not
model tokens, money, or a transferable currency.

| Offer | Vibes | Proposed behaviour |
| --- | ---: | --- |
| Free | 100 once | Two trial conversations, each with a maximum 50-Vibe budget |
| Starter | 350 added each paid month | £20/month; all approved model families; one running agent |
| Builder | 1,000 added each paid month | £49/month; same models; up to two running agents |
| Extra Vibes | 500 | £20 one-time purchase; show when a paying customer needs more |

Paid prices/amounts reuse current backend configuration as a starting point;
they are not a freshly validated commercial offer. Display localized StoreKit
prices in the app. Start with two monthly upgrade choices. Existing Pro/annual
customers retain their entitlements; leave their management available in account
settings without adding more launch paywall cards.

“Two chats” is interpreted here as two conversations, including follow-ups,
not two individual messages. Opening an empty chat costs nothing. Reserve a trial
slot atomically on its first accepted send; provider failure before any useful
response/tool effect releases the slot. Each conversation can continue until its
50-Vibe budget runs out. A third conversation requires a purchase. Deleting,
archiving, reinstalling, changing devices, signing out, or cancelling a later
subscription never restores trial slots. No daily/monthly free refill.

Use “100 free Vibes · 2 trial chats · up to 50 Vibes each” before trial use.
Show each trial chat's remaining allowance, so a user with 50 Vibes reserved for
their second chat understands why the first has stopped. Do not advertise two
unlimited chats or two guaranteed completed projects. Unused trial credit remains
restricted to its two slots and is spent before paid credit in those chats.

Require a Vibyra account for sponsored AI and purchases; preserve optional
account onboarding and account-free computer pairing. Trial eligibility is
server-owned and account-scoped, with verified identity, signup throttling and
abuse monitoring. These reduce repeated-account abuse; they do not eliminate it.
Referral/XP/login rewards must not add trial chats or bypass its budget. Do not
enable those extra earning systems in the initial economy.

After the trial, purchase unlocks further sponsored chats. Paid credit remains
usable after subscription cancellation; cancellation stops future grants and
reduces concurrency to one. History, files, drafts and export remain accessible
at zero balance. No automatic top-ups, overdraft, or surprise charges.

## What the source review found

| Finding | Source and consequence |
| --- | --- |
| Live mobile Chat is a terminal | `mobile/src/ui/SessionScreen.tsx` renders `TerminalSurface` for non-demo sessions; a wallet UI alone cannot meter these agent runs |
| Current session choices are Claude Code, Codex and shell | `mobile/src/ui/NewSessionSheet.tsx`; these are local runners, not an OpenRouter model catalogue |
| Account data loses wallet information | `mobile/src/account/accountApi.ts` maps only email/name/plan; `mobile/src/ui/types.ts` has the same small Account type |
| No native purchase library | `mobile/package.json`; historical Expo IAP documentation describes a retired client |
| Shared billing already exists | `backend/config/billing.php`, `backend/routes/web.php`, and `backend/app/Services/Billing/` provide plans, receipts, ledger, reservations and settlement |
| Existing Free differs from the request | Config grants 50 monthly credits, a $0.50 monthly provider cap, a 15-credit burst cap and zero terminal agents; these cannot be blindly reused for this trial |
| Refresh overwrites the whole balance | `CreditDeductor::refresh()` sets `credits_balance` to the monthly allowance; paid carryover needs a different grant path |
| Recovery can charge estimates | `ChatCostReservationService::recoverStale()` settles dispatched requests at the reserved estimate; settlement also falls back to a reservation when totals are zero |

The last two are implementation blockers for the proposed promises about saved
credits and actual-cost charging. Also cover the race between duplicate reservation
creation and dispatch, and actual settlement exceeding its reserved amount; the
existing services are useful foundations, not proof these new cases work.

## Model menu

Use **Auto** by default, meaning Vibyra's own deterministic choice from its approved
models. Start trials on a tested economical model. Paid customers can pick any
approved family; expensive choices consume Vibes faster. Put the five requested
families first, with the additional mainstream options below in the same sheet.

Catalogue examples verified on the review date:

| Family shown to the user | OpenRouter model ID to evaluate |
| --- | --- |
| OpenAI | `openai/gpt-6-astra` |
| Claude · Anthropic | `anthropic/claude-sonnet-5` |
| Gemini · Google | `google/gemini-3.8-flash` |
| Grok | `x-ai/grok-4.6` |
| Kimi · Moonshot AI | `moonshotai/kimi-k2.7-code` |
| DeepSeek | `deepseek/deepseek-v4-pro-0813` |
| Qwen | `qwen/qwen3.8-flash` |
| MiniMax | `minimax/minimax-m3` |
| Mistral | `mistralai/devstral-2512` |
| Llama · Meta | `meta-llama/llama-4-maverick` |

These IDs appeared with tool support in the [OpenRouter catalogue](https://openrouter.ai/api/v1/models).
They are candidates, not verified Vibyra agent integrations. “Kimi” is the assumed
meaning of the requested “kiiki”. Model authors and the companies hosting their
OpenRouter endpoints are separate concepts; the UI groups by model family.

Sync catalogue and pricing server-side daily, using the account-visible catalogue
where available. Reuse `OpenRouterPricingCatalog` and its normalizer. Maintain a
small approved list, one or two choices per family, rather than automatically
publishing every new model. Exclude batch/free/experimental variants from defaults.
Require text output, tool calling, supported request parameters, known pricing,
and a passing Vibyra tool-loop test. Missing/deprecated models become unavailable
without corrupting saved chats. Last-known pricing has a bounded freshness period;
unknown pricing fails before dispatch. A price ceiling and a same-model compatible
endpoint fallback prevent unexpectedly expensive routing. Never silently change
a manually selected model. [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection).

## Charging and economics

Use a versioned conversion of **1 Vibe per $0.01 of OpenRouter inference cost**
for this new economy. This is a proposal to simplify the existing stacked model,
agent and context markups; version it instead of silently changing old accounts.
Store provider money as integer micro-USD and credit subunits as integers. Aggregate
all billable requests in one user turn before rounding up to a whole Vibe, minimum
one for a successful billable turn. Tiny tool calls must not each incur a whole
extra credit. Include reasoning, cache, tool-loop and any enabled paid-tool costs.
Disable optional paid search/image tools at first until their costs are bounded.

Before Send, quote an estimated range and an enforced maximum spend for that turn.
Reserve against available wallet, trial-chat budget and account concurrency in one
transaction. Bound context, output/reasoning tokens, tool steps, retries and wall
time so the next call cannot exceed the reservation. Stop between calls with a
useful partial result when the remaining budget cannot fund another step. Let the
user explicitly continue with a new budget; never increase it automatically.

Settle from OpenRouter's reported `usage.cost`, keeping generation IDs and per-call
usage for reconciliation. Refund unused reservations. Cancellation charges only
confirmed work already billed; failure before dispatch costs zero. A known zero
cost must stay distinct from missing usage. If a stream disconnects after dispatch,
retain a pending hold and reconcile rather than resend or immediately charge the
maximum. Bound the reconciliation window; unresolved amounts are released to the
customer and booked as an operational loss, with late bills absorbed by Vibyra.
Do not promise failed runs are always free when they performed billable work.
[Usage accounting](https://openrouter.ai/docs/cookbook/administration/usage-accounting).

At this conversion, a full trial funds at most $1 of inference; Starter funds $3.50,
Builder $10 and the top-up $5. The present economics assumptions include 20% tax,
30% store deduction, GBP/USD 1.20, a 5.5% funding fee and operations reserves.
They are repository stress assumptions, not a tax ruling or current FX quote.
Under those assumptions, Starter has $14 proceeds and about $8.81 after funded
inference plus its $1.50 reserve: roughly 62.9% contribution margin. Builder is
about 60.5%; neither figure includes all company costs or the new trial subsidy.

Rerun and extend `php artisan vibyra:audit-billing-economics` before release. Model
full credit redemption, paid carryover liability, funding fees, failed requests,
refunds, new Host/orchestration overhead, and free-user conversion. Keep at least
the existing 60% conservative contribution-margin floor. The 100-Vibe trial is a
separate acquisition expense: at 10% conversion, ten fully used trials cost about
$10.55 including the configured funding fee per acquired payer. Validate retention
and payback in a capped pilot before opening unrestricted signup.

## Runtime and API implementation

Build in this order; each checkpoint must pass before enabling the next.

1. **Version the wallet and trial policy.** Add grant buckets for promotional,
   subscription and top-up credits, plus an append-only ledger and unique grant
   references. Keep paid credits non-expiring and add renewal grants instead of
   replacing the balance. Track trial slots/budgets and outstanding reservations.
   Make the account wallet common across devices and enforce policy at every
   Vibyra-funded inference entry point. Older clients must not bypass it through
   `/api/chat`, streaming or terminal proxy endpoints. Preserve existing paid
   entitlements; reconcile existing balances from ledger history before migrating.
   Never invent a purchased/promotional split when provenance is unknown.
2. **Expose contracts.** Reuse `/api/session`, `/api/billing/plans` and the receipt
   route where compatible. Add versioned wallet/catalogue, quote, turn submit,
   status/events and cancellation contracts. Wallet includes total/available/held,
   trial chats remaining, current chat budget, grants and next grant date. Quotes
   bind account, chat, model, pricing version, request digest, maximum spend and
   expiry. Submit uses an idempotency key; duplicates return the same turn and
   charge. Persist dispatch state; uncertain delivery is not retried blindly.
3. **Connect a real OpenRouter agent.** Backend owns the secret and metered
   inference; a new structured Host runner handles project tools locally. Exchange
   tools/results over authenticated, account-authorized, project/session/turn-bound
   transport. A server-issued short-lived grant permits only this budget and
   session; never distribute the master OpenRouter key. Host pairing is currently
   account-independent, so add explicit account authorization for sponsored runs.
   Preserve controller leases, permission decisions and reconnect rules from
   `docs/ios-conversation-experience-plan.md`. OpenRouter produces tool calls;
   Vibyra must execute and return results through its own runner. [Tool calling](https://openrouter.ai/docs/guides/features/tool-calling).
4. **Keep runtime labels honest.** Vibyra-sponsored Chat is the economy's default.
   Existing user-authenticated Codex/Claude Code sessions remain clearly labeled
   computer/provider-account sessions and consume no Vibes. They do not receive
   Vibyra-funded API access. A global restriction on users' own CLI accounts would
   be a separate product change. Chat can offer hosted text assistance without a
   computer, but file editing/commands require the authorized Host. A phone-only
   cloud coding workspace requires a separate execution service and is not implied
   by adding an OpenRouter model picker.
5. **Add iOS purchases.** Integrate a StoreKit-compatible Expo native purchase
   bridge in a development build. Verify signed transactions server-side, binding
   bundle, environment, product, account and canonical transaction identities.
   Reuse purchase ownership protections, adding signed server notifications and
   reconciliation for renewals, expiry, refunds and revocations. Grant each paid
   renewal exactly once, including notification-before-client and restore races.
   Finish a client transaction after durable server acceptance. Pending/declined
   purchases grant nothing. Restore subscription state through StoreKit and spent
   consumable history/balance through the authenticated backend ledger.
6. **Wire the calm iPhone UI.** Extend account parsing; add focused billing and
   model modules under `mobile/src/`, each source file at most 200 lines. Use the
   existing composer/sheets/theme. Add “100 Vibes” in the account/menu area; model
   and spend estimate beside the composer; compact usage beneath completed turns.
   At trial/credit exhaustion, preserve the typed draft and show one sheet with
   Starter, Builder, Restore Purchases and a visible dismissal. Tapping buy invokes
   Apple's purchase confirmation; after verification restore the draft, requiring
   Send to start work. Refresh balance after settlement, purchase and reconnect.

Apple's rules require in-app purchase for this default digital-credit sales flow,
say purchased credits must not expire, and require explicit permission before
sharing personal data with third-party AI. Plan non-expiring paid grants, in-app
subscription management, and a first-use disclosure covering prompts, selected
project context, OpenRouter and selected providers. Existing pairing consent does
not itself authorize this new data transfer. [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).

Carryover also requires replacing calendar USD caps that would prevent spending
legitimately saved credit. Reserve provider liability per paid grant; enforce
remaining funded liability plus visible concurrency/rate limits when spending.
Cancellation must not make already purchased credit unusable. Refunds reverse the
specific grant's unspent balance; previously consumed credit becomes an auditable
loss/abuse-review event rather than an automatic charge to a payment method.

## Release acceptance

- Fresh account receives exactly 100 once; two simultaneous first sends cannot
  create a third trial chat or exceed either 50-credit budget. Test retries,
  deletion, reinstalls, account switching, reward grants and legacy API bypasses.
- Real tool-loop smoke test for every enabled family: text, tool result, project
  edit, decline, cancellation, provider failure and reconnect. Never label demo
  cards or catalogue support as proof of live agent capability.
- Concurrent spend never creates a negative available balance; costs above quote,
  price changes, retry/fallback bills, zero/missing usage, duplicate settlement,
  stale holds and server crashes have explicit deterministic outcomes.
- Apple sandbox on an actual iPhone development/TestFlight build: buy, pending,
  cancel purchase, interrupted verification, renewal, duplicate/out-of-order
  notification, restore, wrong account/product, expiration and refund. Paid credit
  survives renewal/cancellation. Expo Go/export alone does not prove IAP works.
- iOS small/large screens, keyboard open, Dynamic Type, VoiceOver, both themes,
  offline wallet and draft recovery. No inaccessible dismissal or stale balance
  permits an unaffordable send.
- Extend existing Billing/Reservation/IAP/Economics backend tests; run focused
  suites, `npm run check:mobile`, mobile export, and relevant Host contract tests.
  Re-run the economics audit for the final policy. These checks are planned, not
  reported as passed by this review.
- Roll out behind a backend cohort flag with global/model spend limits and
  dashboards for actual cost, refunds, stuck holds, trial conversion and margin.
  Rollback stops new sponsored turns/purchases while preserving paid balances,
  histories and safe settlement of work already started.

# Backend - Billing Credits And Levels

Read this for membership plans, Stripe/IAP, credits, topups, daily caps, and account XP/levels.

## Files

- `backend/config/billing.php`
- `backend/config/levels.php`
- `backend/app/Services/Billing/`
- `backend/app/Services/IapReceiptVerifier.php`
- `backend/routes/web.php`
- Frontend mirrors: `src/utils/appApiTypes.ts`, `src/utils/persistence.ts`, `src/context/useAppState.ts`

## Billing Source Of Truth

`backend/config/billing.php` owns plans, model tiers/multipliers, fallback token pricing, surcharges, topup SKUs, Stripe price env keys, and IAP product map.

Plans: Free, Starter, Builder, Pro. Annual users receive the same monthly credits and USD cap as monthly users. Annual prices are rounded to the lowest values that still satisfy the conservative margin floor; do not restore a large annual discount without rerunning the audit.

Current paid allowances/caps are Starter £20 with 350/$3.50, Builder £49 with 1000/$10, and Pro £99 with 2000/$20 per month. Annual prices are £225/£585/£1170 with the same monthly allowances. Top-ups are 500/1500/4000 credits at £20/£58/£152.

`vibyra:audit-billing-economics` enforces at least 60% conservative contribution margin after 20% VAT, 30% store commission, stressed GBP/USD conversion, OpenRouter's funding fee, and configured operations reserves. It must pass before plan, cap, annual, top-up, VAT, store-fee, FX, OpenRouter-fee, or operations-reserve changes ship. This is a contribution-margin policy, not a guarantee of whole-company net profit after support, refunds, hosting, marketing, or corporation tax.

`userPayload` exposes `plan`, `planBillingCycle`, the legacy `planRenewsAt`, `creditsResetAt`, `membershipEndsAt`, `membershipCancelAtPeriodEnd`, `billingProvider`, `canManageStripeBilling`, backend-owned `planPricePence`, `billingCurrency`, `billingVatInclusive`, credit counters, and `allowedModelTiers`. Treat `plan_renews_at`/`creditsResetAt` as the next monthly credit refresh. `membership_ends_at` is the separate paid-through date and must control period-end cancellation.

New auth accounts must start on the Free plan with `billing.plans.free.monthly_credits`; paid plan credits should only come from IAP/Stripe/topup paths.

## Payment Paths

Mobile IAP: `expo-iap` purchase -> shared `reportNativeIapPurchase` ->
`/api/billing/iap-receipt` -> `IapReceiptVerifier` -> idempotent
`iap_receipts` row -> subscription/topup credit writes. Onboarding and profile
billing both expose Restore Purchases through `getAvailablePurchases`.
Verification must return canonical store transaction, original transaction,
product, environment, state, and expiry values. The client transaction and
product IDs must exactly match those verified values. `IapPurchaseClaimer`
locks the account, assigns canonical purchase ownership, and writes the receipt
plus entitlement/ledger change in one transaction. Cross-account ownership and
wrong-product reuse return conflict responses. Database uniqueness on
`(platform, original_transaction_id)` is the final concurrent-claim boundary;
the migration refuses to add it while duplicate canonical identities exist.

Stripe web/desktop: `/api/billing/checkout` returns Checkout URL for new purchases, `/api/billing/webhook` handles checkout completion, subscription updates/deletes, invoice paid, and payment failure, and `/api/billing/portal` returns a Customer Portal URL only when Stripe is configured and the user has a Stripe customer. `past_due`, `unpaid`, `paused`, incomplete, canceled, deleted, and failed-payment subscriptions revert to Free. Promotion codes are disabled by default because discounts must be included in the economics audit. Do not use a second Checkout as a paid plan-change flow; add an explicit subscription-update contract first.
`StripeWebhookProcessor` persists every Stripe event ID, retries failed events,
deduplicates completed events, and orders subscription-related checkout,
invoice, and subscription events against a per-subscription timestamp. Older
events are recorded as stale and cannot reverse newer state. Signed event
customer IDs must match the account's stored Stripe customer before mutation;
invoice and subscription ledger references use canonical Stripe object IDs.

`POST /api/billing/cancel` requires an authenticated paid user, a normalized cancellation reason, and `confirmed: true`. It records `membership_cancellation_feedback` before any provider action. Manual test memberships set `membership_cancel_at_period_end`, remain paid through `membership_ends_at`, and return `status: scheduled` plus `effectiveAt`; `vibyra:refresh-credits` downgrades them to Free and completes feedback only after that timestamp. Stripe/Apple/Google responses return the secure provider management URL and remain `provider_action_required` until provider webhooks confirm a real subscription change. Unknown or unavailable providers retain the feedback row with a failure status instead of claiming cancellation.

Google Play subscriptions use
`purchases.subscriptionsv2.get`; topups use `purchases.products.get`.
`GooglePlayAccessTokenProvider` signs a service-account JWT for the
`androidpublisher` scope and caches the access token. Configure
`GOOGLE_IAP_PACKAGE_NAME` plus JSON, base64 JSON, or a file path in
`GOOGLE_IAP_SERVICE_ACCOUNT_JSON`, and grant the service account Play Console
order/subscription access. Verification fails closed for wrong products,
non-entitled states, expired subscriptions, pending purchases, or API/auth
failure. Apple subscription receipts are rejected when expired. Trusted
`original_transaction_id`/Google order IDs deduplicate restores and forged
client transaction-ID replays on both platforms. `php artisan
vibyra:refresh-credits` runs daily as a safety net and revokes expired IAP plans
before granting a new monthly allowance.

## Referrals

Referral rewards are config-driven in `backend/config/referrals.php`. Users get a stable `referral_code`; `GET /api/referrals/me` returns `{ code, link, rewards, stats }`. Signup accepts `referralCode` or `ref`, creates one `referrals` row per referred account, grants signup rewards through `CreditDeductor`, and rejects invalid invite codes before account creation.

Default economics are conservative: referred signup +25 credits, referrer signup +50 credits, referred first paid membership +100 credits, referrer first paid membership +150 credits. Stripe and IAP subscription application call `ReferralService::recordPaidConversion()` only when a referred user moves from Free to a paid plan. Ledger references make both signup and paid rewards idempotent.

If local/dev logs show `SQLSTATE` missing `users.referral_code` or the `referrals` table, run `php artisan migrate` in `backend/`; referral code reads depend on migration `2026_05_18_000001_create_referrals_table`.

## Credit Ledger

`CreditDeductor` handles ordinary grants/refreshes, while provider-funded chat, research plans, terminal calls, retries, and publish images use `ChatCostReservationService` plus `ChatCostSettlementService` for transactional pre-dispatch reservations and actual-cost settlement.

Daily counters use `users.daily_credits_used` and `daily_credits_reset_at`, but AI chat no longer enforces a visible daily cap. 5-hour burst and weekly caps use `users.burst_credits_used`, `burst_credits_reset_at`, `weekly_credits_used`, and `weekly_credits_reset_at` and are the enforced chat quota windows. If live SQLite reports a missing burst/weekly cap column, run pending backend migrations against `backend/database/database.sqlite`. `plan_renews_at` is the next refresh due date. Billing provider records `stripe` or `iap-apple` / `iap-google`.

Manual production test memberships use `billing_provider=manual`, explicit
membership period fields, and `CreditDeductor::refresh()` so the allowance,
usage windows, renewal timestamp, and ledger remain consistent. Run production
mutations inside the deployed Railway service with `railway ssh`; `railway run`
uses the local PHP binary and may lack the production PostgreSQL driver. Match
the target account exactly, mutate one user inside a transaction, use a unique
ledger reference, verify the public `/api/session` payload afterward, and never
record bearer tokens or provider keys. The June 11, 2026 operational details
are in `Runs/2026-06-11 Native CLI Billing And Pro Grants.md`.

## Levels

Backend owns XP/levels and exposes `userPayload.level`. `backend/config/levels.php` defines supported actions and conservative milestone credit rewards.

Daily login XP is recorded during session payload creation. Coding chat completion is awarded inside `ChatEndpoint` after credit charge. Desktop-originated coding and community activity are reported by mobile with the user bearer token; the desktop bridge must not write billing/level rewards directly.

When `/api/chat` crosses a level milestone, `LevelProgression` grants `level_reward` credits through `CreditDeductor`, then `ChatEndpoint` must refresh the `User` before returning `creditsBalance` and `user`; mobile should prefer returned `user.creditsBalance` when present. Regression coverage: `VibyraAppApiTest::test_chat_level_reward_is_returned_in_account_balance`.

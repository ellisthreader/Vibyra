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

Plans: Free, Starter, Builder, Pro. Annual pricing is monthly x 10 with +10% credits/month bonus.

`userPayload` exposes `plan`, `planBillingCycle`, `planRenewsAt`, `creditsBalance`, `creditsUsed`, `dailyCreditsUsed`, `dailyCreditsCap`, `monthlyCredits`, and `allowedModelTiers`.

## Payment Paths

Mobile IAP: `expo-iap` purchase -> `reportIapReceipt` -> `/api/billing/iap-receipt` -> `IapReceiptVerifier` -> idempotent `iap_receipts` row -> subscription/topup credit writes.

Stripe web/desktop: `/api/billing/checkout` returns Checkout URL, `/api/billing/webhook` handles checkout completion, subscription updates/deletes, and invoice paid, and `/api/billing/portal` returns a Customer Portal URL.

`php artisan vibyra:refresh-credits` runs daily as a safety net for plan renewals, especially IAP-only users.

## Credit Ledger

`CreditDeductor` is the only writer for `credits_balance`. Chat spend, topups, refunds, refreshes, and level rewards all go through it and write `credit_ledger` rows transactionally.

Daily caps use `users.daily_credits_used` and `daily_credits_reset_at`. `plan_renews_at` is the next refresh due date. Billing provider records `stripe` or `iap-apple` / `iap-google`.

## Levels

Backend owns XP/levels and exposes `userPayload.level`. `backend/config/levels.php` defines supported actions and conservative milestone credit rewards.

Daily login XP is recorded during session payload creation. Coding chat completion is awarded inside `ChatEndpoint` after credit charge. Desktop-originated coding and community activity are reported by mobile with the user bearer token; the desktop bridge must not write billing/level rewards directly.

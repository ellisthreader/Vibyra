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

New auth accounts must start on the Free plan with `billing.plans.free.monthly_credits`; paid plan credits should only come from IAP/Stripe/topup paths.

## Payment Paths

Mobile IAP: `expo-iap` purchase -> `reportIapReceipt` -> `/api/billing/iap-receipt` -> `IapReceiptVerifier` -> idempotent `iap_receipts` row -> subscription/topup credit writes.

Stripe web/desktop: `/api/billing/checkout` returns Checkout URL, `/api/billing/webhook` handles checkout completion, subscription updates/deletes, and invoice paid, and `/api/billing/portal` returns a Customer Portal URL.

`php artisan vibyra:refresh-credits` runs daily as a safety net for plan renewals, especially IAP-only users.

## Referrals

Referral rewards are config-driven in `backend/config/referrals.php`. Users get a stable `referral_code`; `GET /api/referrals/me` returns `{ code, link, rewards, stats }`. Signup accepts `referralCode` or `ref`, creates one `referrals` row per referred account, grants signup rewards through `CreditDeductor`, and rejects invalid invite codes before account creation.

Default economics are conservative: referred signup +25 credits, referrer signup +50 credits, referred first paid membership +100 credits, referrer first paid membership +150 credits. Stripe and IAP subscription application call `ReferralService::recordPaidConversion()` only when a referred user moves from Free to a paid plan. Ledger references make both signup and paid rewards idempotent.

If local/dev logs show `SQLSTATE` missing `users.referral_code` or the `referrals` table, run `php artisan migrate` in `backend/`; referral code reads depend on migration `2026_05_18_000001_create_referrals_table`.

## Credit Ledger

`CreditDeductor` is the only writer for `credits_balance`. Chat spend, topups, refunds, refreshes, and level rewards all go through it and write `credit_ledger` rows transactionally.

Daily caps use `users.daily_credits_used` and `daily_credits_reset_at`; 5-hour burst and weekly caps use `users.burst_credits_used`, `burst_credits_reset_at`, `weekly_credits_used`, and `weekly_credits_reset_at`. If live SQLite reports a missing burst/weekly cap column, run pending backend migrations against `backend/database/database.sqlite`. `plan_renews_at` is the next refresh due date. Billing provider records `stripe` or `iap-apple` / `iap-google`.

## Levels

Backend owns XP/levels and exposes `userPayload.level`. `backend/config/levels.php` defines supported actions and conservative milestone credit rewards.

Daily login XP is recorded during session payload creation. Coding chat completion is awarded inside `ChatEndpoint` after credit charge. Desktop-originated coding and community activity are reported by mobile with the user bearer token; the desktop bridge must not write billing/level rewards directly.

When `/api/chat` crosses a level milestone, `LevelProgression` grants `level_reward` credits through `CreditDeductor`, then `ChatEndpoint` must refresh the `User` before returning `creditsBalance` and `user`; mobile should prefer returned `user.creditsBalance` when present. Regression coverage: `VibyraAppApiTest::test_chat_level_reward_is_returned_in_account_balance`.

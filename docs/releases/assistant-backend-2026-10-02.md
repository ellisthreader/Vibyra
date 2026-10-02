# Token-funded assistant backend release

Candidate baseline is live commit `75b72b1018162b4c03d0263bfea35982321cc84c`, observed running successfully as deployment `abbd1488-81b9-4b7d-857f-157ba3844eb5` on 2 October. This branch ports only the shared assistant service and its wallet boundaries; all existing website security, Stripe reconciliation/cancellation, passkey and scheduler changes are preserved. No feature from excluded readiness item 4 is implemented or enabled.

## Verified candidate

- Recursive Feature/Unit suite: 283 files, 1,592 tests, 13,106 assertions, no failures; three existing gated skips (infrastructure, publish bridge, native model parity). Existing CreditCalculator notices remain.
- Real PostgreSQL: eight assistant race assertions and six membership race assertions; neither harness detected deadlocks.
- Restored private production snapshot on a disposable socket-only PostgreSQL17 instance: assistant migration up/down/up passed. All 112 pre-existing business tables, 5,220 business rows and per-table data fingerprints stayed identical; migration ledger changed exactly once. Original PG18 snapshot is retained privately. This does not prove a same-version PG18 full disaster recovery.
- Real OpenAI through this candidate's local HTTP kernel and ephemeral in-memory customer: chat, the actual desktop tool schemas, speech and synthetic dictation passed. Four accounting receipts completed; total measured charge1,420microUSD. No real customer balance changed.
- Route caching and scheduled recovery registration pass. No owner key is included in source or patches.

## Coordinated deployment

1. Refresh `origin/railway-production` and compare it with the tested baseline. Preserve any concurrent changes and rerun affected/full gates before merging. Never deploy the dirty development checkout.
2. Retain a verified database/config backup. Set the server's `OPENAI_API_KEY` privately from the already-authorized environment if absent. Keep `VIBYRA_ASSISTANT_ENABLED=false` through deployment/migration acceptance. The default independent operator monthly guard is USD50; customer payment remains their Vibyra tokens.
3. Deploy the exact reviewed commit using explicit project `4e292f83-b6e3-4556-a1db-69a39a2be3b2`, production environment `8d678e46-a6f9-43a7-b192-3da614d82471`, service `17d27bf4-6506-4545-93e3-221065d921b0`. Startup `VIBYRA_RUN_MIGRATIONS=1` applies the additive assistant migration before the web service. Require that exact deployment SUCCESS and compare runtime source hashes.
4. Verify the three new tables, singleton control row, all four authenticated routes, bearer-only authentication, scheduler process and an ordinary `vibyra:recover-assistant` execution. Use a synthetic QA account for bounded funded acceptance only if separately authorized; do not change customer balances. Keep paid-sales/membership flags unchanged until separate Stripe lifecycle acceptance finishes.
5. Coordinate a compatible notarized Mac release. Enable assistant only after backend acceptance and token availability have been established. Verify packaged microphone, network interruption, account switching and exhausted tokens independently from these source tests.

For rollback, disable `VIBYRA_ASSISTANT_ENABLED` first. Preserve accounting tables and the recovery task so existing reservations settle; never drop accounting tables after real requests. Recovery releases abandoned customer holds once but retains uncertain operator risk. Pricing overrun trips the singleton and needs investigation before reset.

## Billing status

The current live backend already contains the cancellation and reversal-recovery fixes. Read-only readiness on2October confirms all five price IDs and return URLs, but live Stripe key/webhook/portal, membership enrollment and paid-sales flags are not configured/enabled. Prior real sandbox purchases, refunds, duplicate grants and cancellation passed. Dispute outcomes and clock-driven renewals, failed renewal and expiry still require a full sandbox credential; the previous claimable key cannot perform those operations. No live purchase or customer billing mutation was made here.

Evidence is retained in the main workspace at `output/production-remediation-2026-10-02/backend-*`. This file records candidate acceptance, not deployment or commercial launch approval.

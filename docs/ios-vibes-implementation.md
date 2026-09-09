# Vibes economy implementation

Implemented in the maintained `mobile/` application, shared Laravel backend and
standalone Rust Host on 9 September 2026. Source integration and automated checks
are complete; production activation and physical iPhone purchase acceptance are
still open. No production database migration, App Store change or deployment was
performed by this implementation.

## Product behaviour

- New accounts receive 100 Vibes once. Verified email and explicit AI-processing
  consent are required to spend them. Two lifetime trial conversations share that
  grant, with at most 50 Vibes in each conversation, including follow-ups.
- Opening a chat is free. An unsuccessful first turn with no charge or useful
  response returns its trial slot. There is no monthly free refill.
- Starter adds 350 Vibes per paid month; Builder adds 1,000. The proposed UK prices
  are £20 and £49. A 500-Vibe top-up is £20. The phone displays StoreKit's localized
  prices; it never presents a hardcoded price as an available Apple purchase.
- Purchased grants carry over and remain spendable after subscription expiry.
  Overlapping subscription plan changes grant the allowance difference, preventing
  repeated full grants during upgrades. Configure both plans in one Apple
  subscription group and verify its upgrade/downgrade behaviour in sandbox.
- One Vibe covers $0.01 of confirmed OpenRouter inference. Each turn reserves a
  displayed maximum; actual usage is aggregated before rounding and unused Vibes
  return to the account. Duplicate submissions, jobs, grants and settlements are
  idempotent. Uncertain inference is reconciled without replaying the request.
- The picker includes Auto, OpenAI, Claude, Gemini, Grok, Kimi, DeepSeek, Qwen,
  MiniMax, Mistral and Llama. A curated server list uses fresh OpenRouter pricing;
  missing models are unavailable. Attached projects require catalogue tool support.
- The Graphite/Cobalt interface includes balance and upgrade sheets, model choice,
  per-turn usage, a per-chat trial remainder, preserved drafts and AI consent.
  Existing computer/provider-account agents remain accessible separately.

## Implementation boundaries

`mobile/src/vibes/` owns UI, API transport, account-scoped state and purchases.
`VibesProvider` remounts on account change. Pending submission identity is stored
before POST; a lost response is checked by ID and never automatically resubmitted.
Five-second foreground polling stays below the API request limit.

`mobile/modules/vibyra-purchases/` is an Expo local StoreKit 2 module. It supports
localized products, account-bound purchase, pending transactions, transaction
updates, restore and finish. Transactions finish only after server acceptance.
Restoration leaves another Vibyra account's unfinished transactions untouched.
Expo Go cannot provide this module; a native development/TestFlight build is needed.

`backend/routes/vibes.php`, `app/Services/Vibes/`, `RunVibesTurn` and the Vibes
controllers own sponsored inference. The new `vibes_*` tables isolate grants and
settlement from legacy refresh logic that overwrites balances. No legacy paid
credit migration is attempted. Enrolled legacy-free accounts cannot bypass the
trial through chat, Codex responses or terminal proxy routes; existing legacy
paid accounts retain their service.

The Apple adapter retrieves transaction claims from Apple's authenticated HTTPS
server API and validates application/environment, canonical IDs, product and
account ownership. It does not accept decoded phone claims. Notification payloads
are untrusted lookup hints; authoritative transaction data is fetched independently
before any grant. Paginated history v2 recovers missed renewals and consumables.
See [Apple transaction history](https://developer.apple.com/documentation/appstoreserverapi/get-transaction-history)
and [pagination](https://developer.apple.com/documentation/appstoreserverapi/hasmore).

`host/crates/engine/src/vibes_tools.rs` and `vibes_write.rs` provide scoped file
list/read/write operations. Explicit project sharing binds account, chat, project
and paired device for 24 hours. Each write requires an explicit decision and a
15-minute tool deadline. Durable receipts prevent replay; hash checks reject stale
edits. Traversal, symlinks, hard-linked writes and named secret/dependency paths are
rejected. Reads/writes are limited to 8 KB. The phone relays these tools while
connected; a background-independent cloud workspace is not included.

This initial agent has four bounded model steps and file tools only. It cannot run
shell commands or tests, and its system instructions prohibit claiming otherwise.
Already approved work may finish after Stop. History currently shows the latest
200 turns; older rows remain stored, with earlier-history pagination still a future
UI extension. This is not the full command-running Host agent proposed in the plan.

## Validation evidence

- Mobile: TypeScript, bundled transport generation, 70 tests and the 200-line gate.
- Backend: 58 focused economy, Apple, existing billing and core chat tests, including
  renewal recovery, upgrade caps, refunds, trial limits, replay, cancellation and
  disabled-feature access. Tests use an isolated SQLite database and mocked providers.
- Host: 17 engine unit tests plus 3 Vibes integration tests using real temporary
  files and persisted SQLite recovery, including rejection and replay cases.
- Browser UI: both themes at 375×667 and 430×932; compact keyboard space, purchase
  verification order, cancellation, consent, failed-send drafts, model choice,
  explicit file-edit allow/decline and disconnected approvals.
- iOS and web JavaScript/Hermes export succeeds. Expo autolinking discovers
  VibyraPurchases. `StoreKitPurchases.swift` typechecks against the iOS Simulator SDK.
- Added the missing React DOM type dependency required by the current mobile tests.
  npm reports 10 moderate dependency advisories; no automatic breaking dependency
  upgrades were applied as part of the economy feature.
- Both billing economics audits pass. Under repository stress assumptions and
  full credit redemption: Starter 62.91%, Builder 60.50%, top-up 60.54% contribution.
  Trial subsidy, refunds and unconfirmed provider costs require operational monitoring.

UI evidence is generated with `node mobile/scripts/verify-vibes-ui.mjs` in
`/tmp/vibyra-vibes-screenshots`. These are labelled test fixtures, not live purchases
or live provider runs. Saved previews: [wallet](vibes-ui/wallet.png),
[chat](vibes-ui/chat.png), [file approval](vibes-ui/project-approval.png).
The full Xcode app build remains unverified: CocoaPods could
not be downloaded because RubyGems DNS failed, including outside the sandbox.

## Release configuration and remaining acceptance

1. Use `backend/.env.vibes.example` as configuration guidance. The inspected local
   backend has no OpenRouter key or Apple IAP credentials. Keep both feature flags
   false until a configured staging run succeeds. Preserve the existing app key.
2. Apply the new migration in staging; run a dedicated database queue worker with
   queue `vibes`, one attempt and an 80-second timeout. Set `retry_after` above the
   timeout and enable Laravel's scheduler. Recovery runs minutely; purchase history
   reconciliation runs hourly. The initial global provider cap is $25/day.
3. Create the three exact product IDs in `backend/config/vibes.php` in App Store
   Connect for bundle `app.vibyra.mobile`. Supply Apple server API credentials and
   configure `/api/vibes/apple-notifications` for notifications. Use Sandbox first.
4. Complete a real native build and physical iPhone acceptance: buy, pending,
   cancellation, interrupted verification, restore, renewal, plan change, refund,
   wrong-account recovery, VoiceOver, Dynamic Type, safe areas and keyboard.
5. Run a harmless text/tool/edit/decline/failure/reconnect smoke task with every
   enabled OpenRouter family. Catalogue availability and mocked tests do not prove
   every provider's real tool behaviour. Exercise production-database concurrency.
6. Deploy only after those checks, then enable a capped pilot and monitor stuck
   turns, actual costs, refunds and trial conversion. Feature disable blocks new
   work/purchase offers while preserving wallet/history, cancellation, restore and
   server settlement. Keep the paid ledger and recovery workers during rollback.

Useful commands: `npm --prefix mobile run check`, `npm --prefix mobile run export`,
`cargo test --manifest-path host/Cargo.toml -p vibyra-host-engine --lib --test vibes_tools`,
`php vendor/bin/phpunit --filter 'Vibes.*Test|Billing.*Test|VibyraChatCoreApiTest'`
from `backend/` with a test-only 32-byte APP_KEY, and the Artisan commands
`vibyra:audit-vibes-economics` / `vibyra:audit-billing-economics`.

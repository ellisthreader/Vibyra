# AI Credits

The Vibes economy is implemented in `mobile/src/vibes/`, the Expo local module
`mobile/modules/vibyra-purchases/`, Laravel `app/Services/Vibes/` and
`routes/vibes.php`, plus the standalone Host's `vibes_tools.rs` / `vibes_write.rs`.
Read `docs/ios-vibes-implementation.md` for acceptance evidence and release setup.
The original proposal is `docs/ios-vibes-economy-plan.md`.

Policy: 100 once, two lifetime trial chats, at most 50 Vibes per chat including
follow-ups. Verified email and AI consent precede sponsored inference. Starter
350/month, Builder 1,000/month, Pro 2,000/month at £99, top-up 500; StoreKit
supplies localized prices.
Paid credits carry over. Overlapping plan changes add the allowance difference.
V1 conversion is 1 Vibe per $0.01, rounding the whole turn once. Server-held
reservations and canonical purchase/turn IDs prevent duplicate spending/grants.

## Plan Entitlements

`config/vibes.plans` is the only source of plan limits: `maxProjects` (null is
unlimited), `concurrentReplies`, `fullCatalogue` and `remoteAccess`. `Plans`
resolves them behind a floor, so an unknown plan never widens access. Every one
is enforced in backend source: `Turns::submit` reads `concurrentReplies` (this
replaced a hardcoded Builder check), `VibesToolsController::attach` counts the
distinct host/project pairs the account would hold *after* the change, and
`Catalog` gates the model list. `Wallet::payload` publishes `entitlements`,
`planEntitlements`, `remoteAccessLive` and `usedProjects`; the phone renders
wording from those numbers and invents none of its own.

`fullCatalogue` plans receive every priced model in the live OpenRouter snapshot
(`catalogue_limit`, default 400) on top of the curated list, and `Catalog::resolve`
accepts any snapshot slug for them. Catalogue models carry no tier, so the picker
groups them under "More from OpenRouter", and they are always `trial => false`:
trial credit can never buy them. Remote computer access is a real Pro entitlement
but the relay is not qualified (`host/docs/protocol.md`), so `remote_access_live`
stays false and the upgrade screen marks that benefit "Coming soon". Never present
it as ready before that flag flips.

Upgrade UI ownership is `mobile/src/vibes/WalletSheet.tsx` (the single upgrade
place), with
`plans.ts` for copy derived from entitlements, `PlanCard`, `PlanBenefits` and
`WalletBalance`. `offers()` hides plans at or below the account's own, so the top
plan sells top-ups instead of itself.

The balance has two entry points. `VibesScreen`'s chip only exists on the AI
home, so it disappears inside a session, on Projects/Computers/Settings, and
after "Computer agents" sets `aiHome` false. `VibesBalanceRow` in the navigation
rail's footer (above Settings, via `NavigationDrawer`'s `balance` prop) is the
one that is reachable everywhere. `WorkspaceApp` owns that sheet's state so it
opens outside the drawer's Modal rather than nested inside it.

`signedIn` (the workspace account), never the wallet, decides that row's wording
and destination. A missing wallet also means "not loaded yet", so reading it as
"signed out" told signed-in people to sign in. The sample workspace hit exactly
that: it forced `identity` to null, so no wallet ever loaded. It now has
`src/demo/sampleVibes.ts`, a sample wallet with the three plans and
`purchasesEnabled: false` — the sample can show what a plan includes, never sell
one, and its chat/quote/purchase calls reject. Keep the rail row one line, no
taller than the Settings row and sharing its icon column; the verification
asserts that alignment.

Do not gate that rail card on `vibesEnabled`. That flag is
`!demo && (ios || EXPO_PUBLIC_VIBES_WEB_PREVIEW)`, so gating it hid the balance
entirely in the browser preview and in the sample workspace — the reported
"cannot see it anywhere". Plans must stay readable on every runtime; only the
purchase button needs the native bridge, and `WalletSheet` already says so.

New `vibes_*` tables deliberately isolate the economy from legacy balance refresh
and estimated-cost settlement. Do not route new Vibes through `CreditDeductor`.
Enrolled legacy-free accounts are guarded on chat, Codex responses and terminal
proxy routes; legacy paid entitlements are preserved without invented migration.
Apple claims come from authenticated Apple server API responses. Notification
content is only an untrusted transaction lookup hint, never grant authority.
History v2 pagination recovers missed renewals/finished consumables.

File tools use explicit project sharing and account/chat/project/device binding,
short tool deadlines, explicit writes, content hashes and durable receipts. The
initial runner lists/reads/writes small files; it cannot run commands/tests. It
needs the phone connected. Existing own-account computer agents use no Vibes.

Client state remounts per account; persist submission identity before POST and
reconcile unknown delivery without resend. Poll at five seconds (four API reads
per refresh); faster full refreshes exceed the route's 90/minute limit. Project
approvals belong in the scrolling transcript so they cannot crowd out the composer.
Shared Sheet reads safe-area insets outside its Modal and applies explicit padding.

Validation route: local `plan` skill, mobile check/export and
`mobile/scripts/verify-vibes-ui.mjs` (it asserts the three offers, the Pro
benefits and the "Coming soon" status); Vibes/Billing/core-chat PHPUnit tests
including `VibesEntitlementsTest`;
Host engine and `vibes_tools` tests; both billing economics audits. Current source
checks pass. Mocked UI/provider checks do not prove StoreKit or live model execution.
Native StoreKit service typecheck/autolinking pass; full Xcode and physical-iPhone
acceptance remain open, as do configured provider smoke tests and production DB
concurrency. No paid rollout is established by this work. Feature flags default off;
disabling new work preserves wallet/history, cancellation and purchase settlement.

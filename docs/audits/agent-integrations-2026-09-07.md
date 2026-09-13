# Main integration implementation evidence

Implementation branch: `feature/agent-integrations`, based on the teammate modal
and save reliability fix `cfd2f94`. Working directory: sibling `agent-integrations`.
This is local implementation evidence. Neither the installed AppImage nor the
production backend has been replaced. No real provider account has been connected
through this new flow yet. No user account data was used in tests.

## Delivered

- Agent header Integrations button; searchable modal, compact service rows, per-account
  read-access toggles, explicit browser consent, Shopify store input, check, reconnect,
  cancellation and all-teammate disconnect confirmation.
- Nine services: Gmail, Google Calendar, Google Drive, Outlook, Microsoft Calendar,
  OneDrive, Stripe Apps, Shopify and GitHub. Exact bounded reads are in the runbook.
- Authenticated broker with expiring one-use state, PKCE for Google/Microsoft/GitHub,
  Shopify HMAC and strict host checking, encrypted credentials, rotating refresh tokens,
  verified identity plus useful read before Connected, and explicit account/device/agent grants.
- Shared provider locks and DB row locks; refreshed tokens survive later read outages.
  Shopify installation ownership prevents another Vibyra account retiring its refresh token.
- Both Claude MCP and Codex dynamic tools reach the existing active-turn permission gate.
  Integration tools cannot grant themselves access, use arbitrary provider URLs or write data.
- Shopify signed uninstall/privacy handling; body identity and event-time checks prevent
  wrong-store deletion and stale events removing a newly reconnected account.
- Secret-free `php artisan integrations:check`; exact setup/callback runbook; daily
  pruning of old OAuth attempts through the existing Laravel scheduler.

## Measured validation

| Check | Result |
| --- | --- |
| Frontend regression tests | 777 passed |
| Native workspace tests | 342 core + 250 desktop library + 6 helper/updater tests passed; 2 existing ignored tests |
| Additional integration/native wire tests | 17 passed, including actual MCP request forwarding and Codex dynamic-tool TCP forwarding |
| Backend integration + auth/report regression | 40 tests, 353 assertions passed, isolated SQLite and fake provider HTTP |
| Chromium interaction scenarios | 6 scenarios passed: load/search, modal inert boundary, store validation, single connect, cancellation, grant/revoke, check/failure, keyboard/focus, themes/narrow, missing setup |
| Native WebKitGTK | Real keyboard typed Shopify, filtered to one service; dialog was not inert; Escape closed, workspace reactivated, opener focus restored |
| Frontend build and backend website asset build | Passed; existing frontend large-chunk warning remains |
| Strict Rust Clippy | Passed workspace/all targets with warnings denied |
| TypeScript and dead-code checks | Passed |
| Desktop 200-line source gate and diff whitespace | Passed |

Browser captures: `agent-integrations-2026-09-07/dark.png`, `light.png`, `narrow.png`.
Native evidence: `agent-integrations-2026-09-07/native.png` and `native-results.json`.

The initial native test opened the dialog programmatically without focusing its
opener, making its focus-restoration assertion invalid; the corrected test establishes
opener focus first and uses real native keystrokes. A broader backend test needed
website assets in this fresh checkout; those were built and the final 40-test run passed.

## Required before a usable public release

| Gate | Current evidence |
| --- | --- |
| Real provider registrations and secret configuration | Not found locally; secure location requested from Ellis, no response yet. Local readiness reports Setup needed for all nine. Hosted configuration was not inspected. |
| Google/Microsoft/Stripe/Shopify/GitHub account sign-in and consent | Not performed with real accounts; fixtures are not live evidence. |
| Real account reads through Claude and Codex | Not performed; engine forwarding and broker permission contracts were tested independently. |
| Shared production cache/database concurrency and MySQL migration | Code locks present; deployment/database-specific concurrency unmeasured. SQLite tests do not prove MySQL runtime compatibility. |
| Provider distribution approvals and production scopes | Not verified. Stripe public app distribution, Google scopes, tenant consent and Shopify distribution are external gates. |
| Packaged Linux/Windows account journeys | Not run. Native WebKit fixture is Linux UI evidence, not installed provider OAuth evidence. |
| Publication/installation | Not performed. Running Vibyra and production data preserved. |

Follow `docs/runbooks/agent-integrations.md` to configure and run live acceptance.
Do not change Setup needed to Connected merely because a provider registration exists.
Do not promise external writes, full document ingestion, private repository automation,
background workflow intake or the remaining broad catalogue in this initial phase.

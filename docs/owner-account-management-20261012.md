# Owner account management

The owner approved the dashboard redesign and requested account search, credit
grants, bans and warnings, with the existing security preserved.

## Behaviour

- Search all accounts by name, email or exact account ID; paginate on the server.
- Open a profile with current balances, account status and dated action history.
- Grant an explicit amount to the existing wallet. Never migrate billing or
  change paid subscriptions as a side effect.
- Record a warning visible in that user's website account. Do not send email
  or push notifications from this flow.
- Ban and unban accounts with a reason. A ban blocks authenticated service
  access and revokes existing sessions; it does not cancel subscriptions or
  erase data. Offline local software is outside the server's control.

## Security contract

All named reads and writes require a verified allowlisted owner web session and
the existing ten-minute second-factor verification. Keep CSRF, no-store and
rate limits. Reject actions against owner accounts and the acting account.
Actions require an explicit review, reason, expected account revision and UUID.
Persist the action receipt and mutation atomically. Replays with the same UUID
must return the original result; changed payloads must fail. Unknown browser
outcomes retain the same request until reconciled. Clear private views on
verification expiry or authorization loss.

## Verification and release

Exercise owner/non-owner/bearer boundaries, real CSRF, stale/expired verification,
literal search, wallet scale, duplicate requests, stale revisions, ban/re-login,
warning visibility and rollback. Review new code adversarially, test the actual
UI using isolated fixtures, and retain the production release gates.

## Data and concurrency

Tokens use 10,000 stored units per displayed token. Legacy Vibes use one unit;
legacy credits remain a separate balance. A grant selects the existing currency,
adds 1–10,000 whole units with ledger kind `owner`, and never initializes a wallet,
starts a trial or alters a subscription. Profiles lock a fresh User then wallet so
revision, currency, available funds and reserved funds form a coherent snapshot.

Writes and cancellation bind the browser's `X-Owner-Account` to the authenticated
owner. Receipts include actor, target and exact result; the frontend validates all
of them. An open review freezes its revision. A cancellation tombstone fences a
late submission; cancellation after commit returns the original receipt. Browser
storage contains only request/target/action references, scoped to owner and target.

Bans increment a durable web-session epoch as well as revoking native sessions.
Unban never restores old cookies, remember tokens or revoked sessions. Current
account checks cover API keys, relay, Cloud runtime and queued AI/connector/publish
work. Work already dispatched to an external provider cannot be recalled; confirmed
usage and factual cleanup receipts are retained. Cloud cleanup and shutdown paths
remain available to existing runtime identities. Offline local software cannot be
remotely disabled by these controls.

## Validation

Run `python3 preview/checkOwnerBackend.py` from `backend/`. The PostgreSQL harness
is opt-in (`OWNER_POSTGRES_QA=1`) and only accepts a loopback database named
`vibyra_owner_qa_*`; it destroys that disposable schema between tests. Run it with
`python3 preview/checkOwnerBackend.py --postgres`. Never point it at production.

Browser checks used synthetic accounts: cross-page search, grant and history,
warning, ban/unban, lost-response recovery across reload, verification expiry and
390px/768px light/dark layouts. Three independent scoped code reviews were followed
by adversarial retests; their concrete findings were fixed and regression-tested.
No live user was credited, warned or banned during development.

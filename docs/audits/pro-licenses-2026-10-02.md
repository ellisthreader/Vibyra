# Pro licenses implementation and security review — 2 October 2026

Status: implemented in maintained backend, desktop and mobile source. A separate
website/backend candidate preserves the exact production baseline
`dccf0115d404dc1116d9b835207afc9893b27f6b` on branch
`codex/pro-licenses-20261002`. This work has **not deployed the feature or published
a signed desktop update**. Issuance/redemption defaults off.

## Behavior

- Owner dashboard → Licenses, protected by owner authorization and fresh 2FA.
- Choose an internal label, 0–10,000 tokens, one-time or monthly allowance,
  1–36 months from redemption or a fixed UTC end, and a separate claim deadline.
- Single-use bearer keys; anyone holding one can claim it. Terms are immutable.
  Revoke/replace to change them. Full keys appear once; only SHA-256 hashes persist.
- Website and desktop signup have a compact optional license field. Email signup
  applies the license after email verification. Verified provider signup applies
  it during completion. Invalid/unavailable keys never prevent account creation.
- Existing verified accounts can redeem from website/desktop account settings.
  Existing paid memberships, active licenses, pending subscription checkout and
  unreconciled legacy wallets reject redemption without consuming the key.
- Monthly allowances reset at redemption anniversaries, with no rollover or
  accumulation of missed months. One-time allowances expire with the license.
- Membership, model spending, project/agent access and Cloud use the existing
  server entitlement/wallet system. iPhone recognizes license memberships and
  does not mislabel them as App Store subscriptions; no mobile redemption UI.
- Revocation/expiry removes license access and unused license tokens. Purchased
  tokens remain. Work already reserved may settle once, without resurrecting
  revoked or expired tokens. Native offline expiry is checked locally; offline
  owner revocation requires account refresh, while server spending is authoritative.

## Security findings and fixes

| Risk | Problem | Consequence | Fix and evidence |
| --- | --- | --- | --- |
| Medium | Mixed trial/paid balances bypassed the dedicated free AI cost cap | A tiny nontrial grant could permit excess free spending | Vibes reserves the free budget for actual trial allocations; regression test |
| Medium | Assistant admitted spending during pending refunds/disputes | Additional token spend while refunds awaited outstanding holds | Guard under wallet lock; refusal leaves balances unchanged and prior holds can settle |
| Medium | PostgreSQL User/FK lock ordering could deadlock paid grants against claims | Concurrent legitimate operations could fail/retry | No-key User locks retain serialization without blocking FK key-share; PostgreSQL race tests and deadlock-log check |
| Low | Owner screen could retain a displayed secret beyond step-up expiry | Sensitive details remained visible in an idle page | Server expiry timestamp, timed state clearing, authorization-loss clearing and account-keyed remount |

Additional preventive controls: 256-bit random keys, constant-shape unavailable
errors, authenticated account/IP rate limits, actual CSRF enforcement for cookie
routes, bearer-only native route, account-scoped redemption, atomic native profile
application, idempotent issuance/redeem/revoke, immutable audit events, no raw key
in parsed request/session flash or OAuth cache, no key in browser storage, and
private/no-store responses. Independent reviewers performed an adversarial round.

## Verification

- Maintained backend: full 292-file run initially passed 289; three stale password/
  CORS fixtures were corrected and their focused rerun passed. Subsequent license,
  OAuth, CSRF, Assistant and settlement tests passed.
- Production candidate: 286-file full suite passed 285. The existing encoded-folder
  preview test also fails on untouched production baseline (see baseline evidence).
  Three opt-in tests were skipped: infrastructure, publish bridge and live provider
  guardrails. Two additional settlement files pass, plus the final focused rerun.
- Disposable PostgreSQL license suite: 4 tests / 75 assertions, no deadlocks.
  Assistant concurrency harness passed duplicate, settlement, shared-wallet,
  monthly-cap and recovery races with no deadlocks.
- Real built website browser fixture: signup, pending verification, account-scoped
  redemption, owner 2FA, exact lost-response retry, revoke, expiry clearing, no
  browser storage of keys, desktop and narrow phone layouts. Native signup UI
  fixture passed Chromium and WebKit. Browser APIs use fixtures, not real users.
- Desktop TypeScript/Vite build passed; 63 Rust account-related tests passed,
  including expiry and account-switch checks; signup serialization rerun passed.
  Desktop membership/signup unit tests and mobile license presentation test passed.
- Composer audit and production npm audit report zero known advisories.
- Read-only live probes of vibyra.net and the Railway origin passed headers,
  cookie flags, sensitive-file denial, private endpoint authentication, CORS,
  TLS and human-check checks. These probe the existing deployment, not this feature.

Evidence logs: `/private/tmp/vibyra-license-candidate-tests.txt`,
`/private/tmp/vibyra-license-candidate-extra.txt`,
`/private/tmp/vibyra-license-baseline-tests.txt`,
`/private/tmp/vibyra-license-settlement-tests.txt`.
Screenshots: candidate `output/license-review/`; maintained source equivalent
under the repository's `output/license-review/`.

## Release boundary

Before activation: back up production PostgreSQL, rehearse the additive migration
against a separate restore, deploy the reviewed exact backend commit, then enable
`MEMBERSHIP_LICENSES_ENABLED=true` with membership v2 enabled and verify the owner
flow. Use only synthetic accounts for live acceptance. Do not deploy the dirty
maintained tree or overwrite the current website snapshot with its older UI.
Publish the separately built/signed desktop client to expose its signup field;
existing clients still obtain account entitlements through the server profile.
Production enablement, restore rehearsal, signed client publication and real
provider/device acceptance are not established by local fixtures.

Emergency disable: set `MEMBERSHIP_LICENSES_ENABLED=false`; expiry, allowance
lifecycle and owner revocation continue. Do not roll back/drop license tables or
historical grants. The migration deliberately refuses destructive rollback.

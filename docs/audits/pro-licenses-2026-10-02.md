# Pro licenses implementation and security review — 2 October 2026

Status: website/backend **live and enabled on vibyra.net**. Reviewed commit
`07c8d918c1b4372fd90598b31bbec0548fe5a76d` deployed successfully as Railway
`b5892c6d-04de-4d15-b48a-80de7e94791a`, based on the exact prior production
`dccf0115d404dc1116d9b835207afc9893b27f6b`. Owner entry: `/owner` → **08 Licenses**
→ fresh two-factor verification → **Create license**. A signed desktop update
has **not** been published; the website signup flow is available now.

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
| High | Desktop rustls 0.23.44 TLS handshake advisory | Incorrect encryption-level validation | Updated maintained Cargo lock to 0.23.45; Cargo audit rerun |
| High | Mobile brace-expansion denial-of-service advisories | Excessive expansion work/recursion | Updated maintained npm lock to 5.0.12 |
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
- Final production candidate: 289-file full suite passed 288. The sole encoded-folder
  preview failure is identical on untouched production baseline. Infrastructure,
  publish bridge and live provider guardrails remain opt-in skips. Scoped rollout,
  referral ordering and actual OAuth signup tests pass with general membership off.
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
- Candidate Composer/production npm audit and maintained desktop production npm
  audit report zero known advisories. Native Cargo audit after the rustls patch has
  no vulnerability findings; six upstream unmaintained-package warnings remain.
- Remaining adjacent mobile finding: Expo signing tooling depends on `node-forge`
  affected by GHSA-86w9-cpqp-85rv (RSA signature validation). Registry latest is
  1.4.0 and the advisory affects <=1.4.0; no patched release was available during
  this review. Do not downgrade Expo to the audit tool's suggested 44.x workaround.
  Treat this as an outstanding high dependency advisory; it is outside the license
  API/server path. Mobile npm reports it through four affected package entries.
  GitHub default-branch alerts also refer to older locks; tested backend versions
  are Laravel 13.34.0, CommonMark 2.10.3, Flysystem 3.36.0; uuid is already 11.1.1.
- Read-only live probes of vibyra.net and the Railway origin passed headers,
  cookie flags, sensitive-file denial, private endpoint authentication, CORS,
  TLS and human-check checks; repeated after the exact license deployment.

Evidence logs: `/private/tmp/vibyra-license-candidate-tests.txt`,
`/private/tmp/vibyra-license-candidate-extra.txt`,
`/private/tmp/vibyra-license-baseline-tests.txt`,
`/private/tmp/vibyra-license-settlement-tests.txt`.
Screenshots: candidate `output/license-review/`; maintained source equivalent
under the repository's `output/license-review/`.

## Release boundary

Deployment and recovery evidence:

- Private PostgreSQL archive: 8,438,418 bytes, SHA-256
  `e818226f09985ede393d1cb571dbbd66abfdfc6f665082eadb9e28859e2ab4dc`, retained in
  `~/Library/Application Support/vibyra-backend-backups/licenses-20261002T104250Z/`.
- Restored into an isolated local PostgreSQL cluster before migration. All 115
  original business tables / 15,543 rows retained their fingerprints. Synthetic
  issuance/redemption/revocation passed; the disposable cluster was removed.
- All 925 immutable deployed source/build hashes match the reviewed candidate.
  `2026_10_02_180000_create_membership_licenses` is applied.
- Only `MEMBERSHIP_LICENSES_ENABLED=true` was activated. General membership v2,
  free trial and existing payment rollout gates were preserved. Licenses enroll
  eligible brand-new accounts independently; ordinary signup remains unchanged.
- Live runtime HTTP-kernel acceptance passed ten checks: owner 2FA, real CSRF,
  issuance, secret-free idempotent retry/list, pending signup, zero pre-verification
  tokens, verified allocation, native Pro profile, and revocation. Synthetic owner
  allowlist and fake mail/queue were CLI-process-only; all test database writes
  rolled back. This establishes server route behavior, not real provider/device UI.
- Live authenticated browser shows **08 Licenses**, the Pro licenses page and
  Create license control. No real customer license was issued during verification.
- Public license endpoints reject anonymous requests (401); queue workers and
  scheduler are running. Both public-domain and Railway-origin security probes pass.
- Runtime/public evidence is in `output/license-release/`; final suite evidence is
  `/private/tmp/vibyra-license-release-final-suite.txt` and its failure companion.

Scoped enrollment uses `Pending::createUser` in the trusted new-account transaction
before referral rewards. Never expose the new-account flag as client input or
convert an existing legacy wallet. Existing legacy accounts require reconciliation.
Publish a separately built/signed desktop client to expose its new signup field;
existing clients obtain account entitlements through the server profile. Real
provider and physical-device acceptance remain separate from these checks.

Emergency disable: set `MEMBERSHIP_LICENSES_ENABLED=false`; expiry, allowance
lifecycle and owner revocation continue. Do not roll back/drop license tables or
historical grants. The migration deliberately refuses destructive rollback.

## Owner enrollment feedback correction — 2 October 2026

Live request logs showed five password-check403 responses followed by throttle429,
not a server exception. The deployed API parser hid Laravel's throttle message behind
“Vibyra could not complete that request.” Authentication remained fail-closed.
The correction uses safe status/validation feedback, explicit password-mismatch copy,
a password visibility control and `/forgot-password` in the owner setup form.
No password, owner, CSRF, session binding, TOTP or rate-limit requirements changed.

Verification: all five focused security files passed; both maintained-source enrollment
files passed. The 289-file candidate suite passed 288 with the same known baseline
preview failure. Built website fixture exercises wrong-password403, throttle429,
recovery link, password visibility, successful enrollment and the full license flow.
Independent adversarial review found no blocker; timing-neutral throttle wording
avoids a false one-minute promise on endpoints with longer limits. Live synthetic
server enrollment/start/confirm plus license flow passed 12 checks with rollback.
The real owner's password/authenticator setup remains theirs to complete.

Feedback correction is live: commit `b186ac583d3fe88413aca4f8bf35248b3591ee60`,
Railway deployment `0cba8b30-2859-40da-9ad2-5000df74359d` SUCCESS. All 925 immutable
runtime hashes and the public portal bundle match. Post-deploy synthetic acceptance
passed 14 checks, including rejected passwords leaving enrollment unchanged, real
CSRF, successful setup/confirmation and license creation/activation/revocation;
all synthetic writes rolled back. Public security probes passed. No real password,
authenticator setting or customer license was changed during diagnosis.

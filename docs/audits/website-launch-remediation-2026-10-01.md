# Website launch remediation — 1 October 2026

Authorized scope: fix the live website audit, test, and deploy reviewed changes to Railway. Preserve customer records and the analytics reset. iOS public availability is **Coming October 2026**, as confirmed by the owner; do not imply it is downloadable today.

Baseline: production SHA `0a02f32a5a6244ac942903d97d9bb69d226ed486`, deployment `0b32c7bc-d307-4697-a4bc-f9d142d22bb2`.

Concurrent production update detected at 15:02 UTC: SHA `e16bcd3fb9fb3bec7f091b81a04994c7fbfb3570`, deployment `71575721-1fea-49d1-950b-df4283c6f13f`, adds cloud-computer functionality. Preserve this commit in the website release ancestry and rerun the complete integrated suite; the earlier baseline is no longer the deployment target.

Checkpoints:
1. Repair authentication/session/2FA and hosted-content boundaries with regression coverage.
2. Complete billing safeguards, bounded FAQ, browser recovery, accurate availability/contact copy and analytics refresh/tracking.
3. Diagnose scheduled failures and the failed test baseline; configure existing mail/payment services where verified credentials and ownership permit.
4. Build the exact candidate, run tests file by file and independent adversarial review; address regressions before release.
5. Deploy the reviewed SHA, verify exact runtime/source, routes, headers, workers and live browser journeys. Record any external enrollment, payment or owner-only step that cannot be truthfully completed.

Implementation uses an isolated worktree; unrelated development changes remain outside the release. Customer purchases and legal/provider enrollment are separate from software deployment and require their actual provider acceptance evidence.

## Email setup and delivery verified

Resend SDK v1.16 installed, native Laravel transport present, canonical sender/reply defaults on vibyra.net. Domain `vibyra.net` created in Resend (Ireland, eu-west-1), ID `75760d9d-1b79-4fb5-a752-aac0d44f6969`; verification pending. Three displayed provider records: TXT `resend._domainkey` (provider-generated public DKIM key), CNAME `rsend` → `rsend-euw1.forge.rmta.net`, CNAME `send` → `send.forge.rmta.net`. Use current provider values, not older SES/MX examples. Root MX/SPF already point to Namecheap email forwarding and must remain intact. No private API key belongs in this report.

Owner approved domain DNS and a sending-only Vibyra-scoped API key. All three records saved and independently resolved publicly at 15:00 UTC; Resend domain verification remained pending at 15:03 UTC. No key created or mailer switched until domain scope is available. Namecheap initially had no incoming-mail forwarders; the owner subsequently approved support/privacy/refunds/hello forwarding to their Gmail and one delivery test.

Resend domain became **Verified** at approximately 15:07 UTC. Created `Vibyra Railway Production` with Sending access limited to `vibyra.net`; transferred directly into Railway's `RESEND_API_KEY`, applied with `skipDeploys:true`. Tracking remains unconfigured; receiving remains disabled so existing root MX is preserved.

## Integrated validation

Merged concurrent cloud release without conflicts. All 253 top-level and 20 nested Feature/Unit test files pass in individual PHP processes. Snapshot-only native model parity remains an explicit gated skip; server ladder invariants run independently. Opt-in real PostgreSQL atomic-2FA tests passed separately. Browser telemetry and account-identity Node tests pass; Vite build passes; Composer audit reports no known advisories. A passkey enrollment race discovered in the concurrent release now rechecks authorization under an account lock at completion; its regression failed before the fix and passes after. Independent reviewers checked auth/billing fixes, community enforcement, static router and the passkey fix.

Main and active website sources received selective ports with private before-snapshots, preserving stronger existing policies and unrelated development. Both maintained Composer graphs now include Resend and Laravel 13.34; existing Flysystem/CommonMark advisories were patched, with clean Composer audits.

Current availability limitation: published desktop versions predate mandatory native OAuth flow-secret support. Keep secure binding and explicit update-required refusal; compatible signed client release remains separate acceptance work. Production read-only checks found no current memory/CPU exhaustion or reproduced 502; PHP 8.3.15 poll warnings are a known log defect, not established evidence of the timeout cause.

Rollback: previous live source is `e16bcd3fb9fb3bec7f091b81a04994c7fbfb3570`. If reverting to that source, also set `MAIL_MAILER=log` until its Resend SDK is present; that disables external mail delivery. Do not revert database/customer state or repeat analytics reset.

## Live acceptance

Release `9a4db56f2699ad08423f7ecf130df758cae969d9` successfully deployed as `2ed88095-78c4-487d-8e32-a6d5e8e2ffca`. All 1,236 immutable runtime files matched the reviewed source. Health, anonymous authorization, crawler spoof rejection, HTTPS/TLS and security headers pass; scheduler and three queue workers are present. The owner Website report loaded in Chrome and refreshed its timestamp. Its normal polling interval is 60 seconds, with 15-second retries after transient failures. Detailed non-secret evidence is in `website-launch-20261001/live-verification.json`.

Resend reports the authorized Laravel verification email delivered, and its signed link reached the live “Your email is verified” page. All four Namecheap contact forwarders are saved and visually verified; actual incoming forwarding delivery has not been tested. Stripe restricted-key creation is currently waiting for the owner’s provider email verification. Paid sales flags remain off until Stripe setup and lifecycle acceptance are complete. No customer data or analytics were reset again.

## Original findings after remediation

| Original findings | Current status | Remaining acceptance |
|---|---|---|
| 1–3: provider flow binding, email change, hosted content | Fixed and deployed; regression tests and independent review pass | Compatible public native OAuth clients must be released; old clients fail closed |
| 4: outbound mail | Resend configured; authorized verification delivered and browser link passed | Incoming forwarding delivery and actual password-reset delivery remain separate checks |
| 5: paid billing | Production safeguards deployed; public sale flags remain disabled | Finish Stripe key/annual price/webhook/portal and real sandbox lifecycle tests before activation |
| 6: owned return URLs and contacts | Canonical origin, Stripe return URLs and public contacts use vibyra.net; four forwarders saved | Incoming forwarding has configuration evidence only |
| 7–8: reset revocation and atomic 2FA | Fixed and deployed; real PostgreSQL concurrency check passed | Owner must enroll their own authenticator |
| 9–10: manual entitlement mutation and legacy store guards | Fixed and deployed | Store purchase and App Review acceptance are not completed by backend tests |
| 11–13: headers, human checks and FAQ spending | Fixed and deployed; public probes reject fake crawler and anonymous access | Normal monitoring remains operational work |
| 14–15: /app error and browser recovery | /app redirects to downloads; browser recovery/verification UI deployed | Delivered verification passed; no extra reset email sent without the owner's requested test scope |
| 16: scheduler prerequisites | Replay scheduled only when configured; scheduler and workers present | Cloud-provider audit recovered separately; do not attribute it to this release |
| 17–18: checkout analytics and FAQ catalogue | Modern offer dimensions, checkout allowlist and catalogue-backed answers deployed | A real customer purchase funnel awaits billing activation |
| 19: owner refresh and enrollment UI | Manual refresh, timestamp, 60-second polling, 15-second retry and browser enrollment deployed | Authenticator enrollment requires owner action |
| 20: release clarity | iOS explicitly Coming October 2026; platform download endpoints reachable | Signed installer installation and compatible native release remain outstanding |
| 21: vulnerable framework version | Laravel 13.34 deployed; Composer audits clean | No known dependency advisory at verification time |

These checks establish the deployed protections and working email/analytics journeys. They do not establish that paid commerce, every store purchase, native installers, backup restoration or monitoring delivery has passed acceptance.

## Subsequent production changes preserved and reviewed

Concurrent release `5bcd787b` corrected country lookup against the installed GeoLite2-City database (4 tests / 7 assertions pass). Concurrent release `016d1035` enabled Google/Apple sign-in to an existing verified account by provider email, but trusted non-authoritative Google email. The reviewed follow-up `3c01e08dcd328dce031490fd78367789b3f92f23` requires authority derived only from signed provider claims, preserving Gmail/Workspace convenience without accepting stale external Google mailboxes. Its regression reproduced the unsafe cases before the fix; 43 tests / 290 assertions pass, with independent review and selective maintained-source ports.

This follow-up is live as deployment `5c521595-505e-49a6-8f96-38bfd81db460`; all 1,236 immutable runtime files match. Health and anonymous Agent boundaries pass. Annual Stripe price `price_1ULmGGFpWKUenh5gbkrtSSEi` is saved at GBP 199.99/year, inclusive tax behavior, quantity one. Product description now distinguishes monthly 300 tokens from annual 3,600 tokens; the price variable is installed and paid flags remain off.

The pre-existing Stripe webhook host belongs to the owner's active HKE Railway project, so it must not be removed as an assumed obsolete Vibyra endpoint. The Vibyra destination is separate. Provider email verification progressed to the Stripe authenticator-code challenge; key transfer is not complete yet.

## Reversal reconciliation and recovery follow-up

Runtime fix `268e9b35` and guarded acceptance tooling `327f43d8` are deployed as `c6be555e-12a0-40fe-81df-4c385ddeb82f`. All 1,242 immutable files match; the nullable/indexed event order association migration is installed. Health, anonymous Agent authorization and security-header smoke checks pass. Paid sales, membership v2 and Stripe flags remain false; no modern production orders or reconciliation holds existed at verification.

The reproduced dispute ordering bug left funded work blocked after a won dispute delivered before its paid invoice. The fix associates individual reversal events, preserves other unresolved payment reversals on the same order, repairs older unmapped events through canonical replay, prevents stale duplicate handlers from downgrading completed events, and isolates test/live backlogs. Seven targeted regressions pass (34 assertions), with independent adversarial review. The complete recursive per-file suite passes 277 files with three documented gated skips. The exact migration passed up/down/up on an isolated restored PostgreSQL database, preserving all archived business-table counts. See `stripe-reconciliation-migration-rehearsal.json` and the recovery runbook.

An interim private database dump is retained on the owner's Desktop and passed a full restore check: 113 tables/5,313 rows. Its original APP_KEY and external configuration remain separate recovery dependencies. Six verified obsolete installer copies were archived before removal, restoring 630 MiB free space; all current downloads passed HEAD checks. Native Railway backup schedules and a 10 GB allocation remain unconfigured: the actual workspace is Hobby with an insufficient-funds invoice, and the owner explicitly deferred payment resolution. Do not retry the unconfirmed separate workspace upgrade blindly.

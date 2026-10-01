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

## Email setup prepared

Resend SDK v1.16 installed, native Laravel transport present, canonical sender/reply defaults on vibyra.net. Domain `vibyra.net` created in Resend (Ireland, eu-west-1), ID `75760d9d-1b79-4fb5-a752-aac0d44f6969`; verification pending. Three displayed provider records: TXT `resend._domainkey` (provider-generated public DKIM key), CNAME `rsend` → `rsend-euw1.forge.rmta.net`, CNAME `send` → `send.forge.rmta.net`. Use current provider values, not older SES/MX examples. Root MX/SPF already point to Namecheap email forwarding and must remain intact. No private API key belongs in this report.

Owner approved domain DNS and a sending-only Vibyra-scoped API key. All three records saved and independently resolved publicly at 15:00 UTC; Resend domain verification remained pending at 15:03 UTC. No key created or mailer switched until domain scope is available. Namecheap currently has no incoming-mail forwarders; owner asked to approve named support/privacy/refunds/hello forwarding to their existing Gmail and one delivery test.

Resend domain became **Verified** at approximately 15:07 UTC. Created `Vibyra Railway Production` with Sending access limited to `vibyra.net`; transferred directly into Railway's `RESEND_API_KEY`, applied with `skipDeploys:true`. Tracking remains unconfigured; receiving remains disabled so existing root MX is preserved.

## Integrated validation

Merged concurrent cloud release without conflicts. All 253 top-level and 20 nested Feature/Unit test files pass in individual PHP processes. Snapshot-only native model parity remains an explicit gated skip; server ladder invariants run independently. Opt-in real PostgreSQL atomic-2FA tests passed separately. Browser telemetry and account-identity Node tests pass; Vite build passes; Composer audit reports no known advisories. A passkey enrollment race discovered in the concurrent release now rechecks authorization under an account lock at completion; its regression failed before the fix and passes after. Independent reviewers checked auth/billing fixes, community enforcement, static router and the passkey fix.

Main and active website sources received selective ports with private before-snapshots, preserving stronger existing policies and unrelated development. Both maintained Composer graphs now include Resend and Laravel 13.34; existing Flysystem/CommonMark advisories were patched, with clean Composer audits.

Current availability limitation: published desktop versions predate mandatory native OAuth flow-secret support. Keep secure binding and explicit update-required refusal; compatible signed client release remains separate acceptance work. Production read-only checks found no current memory/CPU exhaustion or reproduced 502; PHP 8.3.15 poll warnings are a known log defect, not established evidence of the timeout cause.

Rollback: previous live source is `e16bcd3fb9fb3bec7f091b81a04994c7fbfb3570`. If reverting to that source, also set `MAIL_MAILER=log` until its Resend SDK is present; that disables external mail delivery. Do not revert database/customer state or repeat analytics reset.

# Hosted coding implementation and deployment

Reviewed 30 September 2026. Application source has been implemented. **The hosted service has not been deployed or enabled.** This is the handover for `fly-cloud-workspaces-plan.md`; an approved source implementation does not establish live Fly, physical-phone or commercial acceptance.

## What was implemented

| Surface | Source delivery |
|---|---|
| Laravel control plane | Owner-scoped workspace, import, quote/start, access, stop, budget, actions, receipts, export, deletion and runtime APIs; durable states and reconciliation |
| Fly | REST adapter, per-workspace app and custom private network, encrypted 20 GiB volume, pinned runtime image, performance 2 CPU / 4 GiB Machine, no public services, no restart policy |
| Tokens | Existing membership-v2 wallet/grants and account lock; exact integer runtime reservations, separate AI reservations, combined workspace/account caps, global metered-spend admission, idempotent settlement and refund integration |
| Linux runtime | Outbound HTTPS bootstrap/polling, signed finite compute leases, independent expiry watchdog, unprivileged project worker, exact preapproved shell commands, private-network egress rules, bounded results, command journal and verified checkpoints |
| Phone | Separate “In the cloud” destination, existing approved-device possession proof plus fresh passkey, complete company/model picker, explicit quote/permissions, hosted conversation, runtime/AI totals, stop, budget increase and web preview link |
| Mac | Project menu entry, approved upload, native account-token transport, three-way file-content review, conflict preservation, original-file backup, separate complete cloud-copy export and per-account merge baseline |
| Storage | Independent private S3-compatible checkpoints, hashes, binary/executable files, five recent versions plus import base/current, final save, seven-day Fly-disk cleanup and 30-day archive expiry |
| Operations | Default-off rollout flags, pilot cohort/capacity controls, scheduler reconciliation, emergency stop, dedicated queue and container smoke workflow |

The first adapter uses Vibyra-funded project-tool inference through the existing Laravel AI engine. It does **not** run stock Codex/Claude CLI or copy a Mac's subscription login/keychain. The existing awake-Mac Noise relay remains its own execution path. Managed HTTPS passes source through Vibyra's control plane; it is not relay-blind end-to-end encryption.

One Vibyra token is 10,000 current ledger units. AI settlement continues to use confirmed provider costs and the existing uncertainty/reconciliation policy. Runtime uses the accepted versioned units/hour tariff, cumulative integer arithmetic and the signed execution window; billing begins only after readiness and stops at lease expiry. Boot failures return customer runtime holds. Runtime provider-cost columns are **estimates**, including the legacy-named `actual_micro_usd` on `cloud_reservations`; they are not Fly invoices. Rates/time/version are recorded on each reservation. Boot, storage, network, backups, tax and platform failure costs remain operator expenses to price and reconcile.

## Local verification and release gates

- Focused Laravel cloud, membership, funded-terminal, tool, account-deletion, provider-error and Vibes API tests pass; final run: 56 tests, 420 assertions, including immutable rate/time receipts, possession-proof retries, read-only commands, startup caps and provider audit.
- Temporary PostgreSQL process races pass for shared AI/runtime grant allocation, four simultaneous settlements and refund versus runtime. The runner verifies its isolated cluster path and has no production database target. The temporary server was stopped afterwards.
- Runtime Node tests pass for signed scopes/expiry, file quotas/checksums, binary/mode restore, symlink/traversal refusal, command deadlines, credential stripping and real worker edits/commands/checkpoints.
- Three Rust transfer/merge tests pass for original backups, preserved conflicts/deletions and changed-review rejection. Rust compilation, phone TypeScript and desktop production build pass.
- Phone browser fixture passes quote, funded conversation, usage, stop and sign-out cleanup. Mac browser fixture passes three-way file-content review, apply receipt, export and close. Screenshots: `output/cloud-workspaces/mobile.png` and `desktop.png`. These are fixture evidence, not live hosted tasks or native installation acceptance.
- `.github/workflows/cloud-workspaces.yml` adds real Linux-container supervisor tests for final save and independent expiry. **Not run here: Docker is not installed.** Run this workflow before a Fly pilot.
- Workspace-wide Rust formatting also reports existing changes outside this feature. New cloud Rust modules were formatted individually; unrelated source was preserved.
- **Outstanding external gates:** actual Fly API/network/firewall/image behavior; independent storage restore after real volume loss; actual AI-provider task/usage; deployed billing baseline and invoice reconciliation; signed desktop/native-phone releases; physical cellular closed-lid acceptance; commercial/security pilot approval.

Run `php artisan vibyra:cloud-provider-audit` before enabling starts and keep its minute scheduler active. Audits stop verified stale generations and fail closed on unknown resources, provider failures or evidence older than two minutes. The guest also requires OOM-score protection and enforces process/file-descriptor limits; verify these in the real container/Fly gate.

Keep starts/AI/preview unavailable until their gates pass. This code is a bounded pilot implementation, not general availability.

## Owner setup

1. Create a dedicated Fly organization for hosted coding and a private S3/R2-compatible bucket. Obtain scoped control-plane credentials; keep Fly, storage and AI keys on Laravel. Enable object encryption and deny public access. Store secrets through the deployment secret manager, not committed files.
2. Run the cloud runtime workflow. Build an image using a pinned supported Node base digest, scan the resulting image, publish it to a registry accessible to Fly, and put its **image digest** in `CLOUD_WORKSPACES_IMAGE`. Example build: `docker build --build-arg NODE_IMAGE=node:22-bookworm-slim@sha256:<verified-digest> -t <registry>/<runtime>:<release> cloud-runtime`. Provider preflight requires `@sha256:<64 hex>` for the deployed image.
3. Generate an Ed25519 signing key in a secure environment: `base64_encode(sodium_crypto_sign_secretkey(sodium_crypto_sign_keypair()))`. Store it as `CLOUD_WORKSPACES_LEASE_PRIVATE_KEY`; only its public key enters the Machine. Rotate by stopping old generations before switching keys.
4. Configure `backend/.env.example`'s cloud section: Fly organization/token/image, HTTPS API origin, lease key, bucket/endpoint/key/secret, region, named tariff, units/hour and provider estimate/hour, account/day/month limits, global capacity and metered daily limit. No production tariff is supplied by this change.
5. Review full membership redemption economics, actual currency conversion/tax/payment fees, boot and stopped-disk costs, archive storage/egress, AI refunds/uncertainty and abuse exposure. Set a separate conservative operator budget and provider billing alerts for **all infrastructure**, beyond the implemented AI/ready-runtime meter. Compare Fly invoices and storage bills to app/generation receipts daily during the pilot. Do not treat the daily metered cap as an all-inclusive invoice cap.
6. Deploy compatible Laravel source/migrations while cloud flags are false. Run `php artisan migrate --force`, then rebuild Laravel configuration/routes and restart workers. Use a shared database/Redis cache for provisioning locks. Keep the existing web/AI/relay services available.
7. Run the `cloud-workspaces` queue separately from interactive AI and deployments: `php artisan queue:work --queue=cloud-workspaces --tries=5 --timeout=80`. Keep the funded `vibes` worker and `php artisan schedule:work` alive. The default development/all-role worker list now includes cloud jobs; separate production processes avoid head-of-line blocking. Set the queue retry interval above job timeouts.
8. If enabling web preview, supply a separate account-free domain with wildcard DNS/TLS and route its requests to Laravel: `<40-character-ticket>.<preview-domain>`. The global preview middleware intercepts that entire origin before account routes/cookies. Do not use the passkey/account domain or bypass this middleware. Verify the proxy preserves Host and does not expose cookies or credentials.
9. Enable UI/hosted capability only for your pilot account using `CLOUD_WORKSPACES_PILOT_USERS=<user-id>`. Check membership-v2 migration, active Pro, verified email, AI-processing consent and funded-terminal flags first. Pair/approve the phone and enroll a passkey while the Mac is awake; existing device cryptographic proof works locally on the phone afterwards.
10. Install client builds containing this change. In the Mac project menu choose **In the cloud → Upload a cloud copy**. From the approved phone choose **In the cloud**, review the exact model, combined token/time cap, edit permission and command list, then start. Wait for **ready** before closing the Mac.

## Physical acceptance before launch

Use a Linux-compatible test project without credentials. Turn phone Wi-Fi off, keep it on cellular without tethering, close the Mac lid and confirm that it actually sleeps. Issue a **new** hosted task, observe a real file edit, run an approved test, view a private preview and inspect separate runtime/AI receipts. Stale output or a green icon does not establish this.

Then test phone backgrounding/reconnect, multiple devices, account switch/revocation, pending refund, insufficient balance, cap/deadline/idle stopping, boot failure, control-plane outage, ambiguous command result, storage outage, provider stop outage and duplicate callbacks. Delete a real stopped Fly volume, restore the independently saved checkpoint to a fresh generation and verify bytes/modes. Wake the Mac, create a local conflicting edit, review/apply cloud changes and verify the backup and conflict preservation.

Only after these checks and invoice/security review should the cohort expand. Commercial prices, sold allowances, privacy/retention terms and support ownership need explicit product approval; the implementation has not published or charged a new offer.

## Supported pilot boundaries

- One running workspace per account, three retained workspaces, ten globally running by default; one region and one performance shape. Linux tooling, Node, Python and Git are present; macOS/iOS builds and Apple keychain tooling are unavailable.
- Imports/checkpoints support 20 MiB of source, 2,000 files, 1 MiB per file and 8 KiB text edits. They exclude `.git`, `.env*`, credential/generated folders, refuse symlinks and case collisions. This bounded manifest transfer is not a resumable large-repository uploader; larger projects must be reduced before import. Dependencies can be installed using explicitly approved commands.
- Commands must exactly match the approved session list, use sanitized environment, have bounded output and at most a 120-second foreground deadline. Never replay an ambiguous execution automatically. Background services can outlive a shell command but are killed by the root supervisor when execution authority ends.
- AI attachments, connectors, own-provider login, full PTY terminal streaming and native desktop/app previews are not hosted pilot modes. Funded project-tool conversation is the supported coding mode.
- Web preview supports private GET/HEAD, local ports 1024–65535, resources up to 128 KiB, no redirects, WebSockets/HMR, login cookies or external network resources. Use a small static/build preview, not an arbitrary interactive production reverse proxy. Tickets last two minutes; reopen to renew. It remains separately disabled pending origin/isolation acceptance.
- Commands may alter several files while a periodic checkpoint is being captured. The UI conservatively warns about possible pending shell changes until final stop/save. A failed final save exports the last verified checkpoint and keeps the warning; it never promises that unseen edits are saved.
- Mac application checks reviewed hashes again and backs up before mutations; three panes show base/Mac/cloud file contents and conflicts require manual merging from the exported copy. It does not provide an editable diff tool, background bidirectional sync or atomic transaction across the entire Mac tree. An interrupted apply reports its backup and completed-file count.
- Seven-day disk cleanup and 30-day source expiry are pilot defaults. Show and approve these terms before enabling UI. Expiry removes source checkpoints, while metering/history records follow account retention rules. Checkpoint pruning keeps the import base and five recent versions/current checkpoint; take independent disaster-recovery backups and test restores.

## Operating and rollback

Disable `CLOUD_WORKSPACES_STARTS_ENABLED` first to stop new provisioning. Disable hosted AI separately if provider work must stop. `php artisan vibyra:cloud-workspaces --stop-all` requests bounded saves/stops without requiring customer funds. Leave reconciliation, stop, settlement, export and retention running; do not drop migrations or revoke the Fly token until resources are confirmed stopped/deleted. If the control plane is unavailable, the guest watchdog kills project processes when its signed lease expires; any remaining provider expense is an operator incident.

Monitor active states, oldest heartbeat/lease, unresolved reservations/AI generations, queued/running/unknown actions, final-save warnings, queue/controller health and retained volume/object bytes. Alert below operator budgets. A stuck `starting`/`stopping` or `deleting` state needs provider reconciliation, not a second untracked machine. Preserve backups before manual recovery. Keep provider invoices, immutable receipts and price versions for financial reconciliation; customer token balances are not a substitute for invoice totals.

Useful checks:

```sh
cd backend
php -d memory_limit=1G vendor/bin/phpunit tests/Feature/CloudWorkspaces tests/Feature/MembershipWalletTest.php tests/Feature/FundedTerminalsTest.php
php artisan vibyra:cloud-workspaces
# Isolated local cluster only; see the runner's guard and port 56387.
php tests/integration/cloud-concurrency.php
```

```sh
npm --prefix cloud-runtime test
cd mobile && npx tsc --noEmit && node scripts/verify-cloud-workspaces.mjs
node scripts/verify-cloud-desktop.mjs
cd ../desktop-tauri && npm run build
cargo test --manifest-path src-tauri/Cargo.toml --lib commands::cloud_merge::tests --locked
```

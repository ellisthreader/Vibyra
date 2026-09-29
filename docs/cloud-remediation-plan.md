# Vibyra Cloud remediation plan

Status: implementation authorized by the user and source work completed/in verification, 29 September 2026. Live rollout remains pending; see `docs/cloud/remediation-results-2026-09-29.md`. Covers every finding in
`docs/audits/cloud-preview-2026-09-29.md`.

## Outcome and boundaries

Make iPhone Cloud Preview faster under load, recover predictably from connection
loss, and enforce computer ownership and revocation. Preserve end-to-end Noise
encryption, exact project/device grants, separate typing/control permission,
existing terminal sessions and supported older clients where safe.

Use isolated branches/checkouts based on the actual production backend and a
captured relay source revision. Do not deploy the shared dirty checkout. Record
candidate hashes, installed Mac/phone versions and relay protocol capabilities.
Keep backend fixes in the maintained source as well as the production snapshot.

## 0. Establish baseline and release safety

- Reconfirm deployment SHAs, actual running source, disk headroom, worker count,
  secrets configuration presence (never values), healthcheck and region settings.
- Capture immutable rollback images/configuration and verify database backup
  restoration in isolation. Use additive schema changes throughout rollout.
- Build a synthetic site with small/large assets, forms, redirects and WebSocket
  updates. Measure cold/warm pages and native window frames while a terminal is
  active, on physical cellular and simulated slow/high-latency links.
- Record first visible content, throughput, p50/p95 latency, reconnect time,
  errors, memory, queue sizes and terminal response latency. Use identical
  fixtures/client builds for before/after comparisons; at least 30 runs per
  repeatable performance condition and a separate long-session soak.
- Run the existing relay suite and relevant backend tests as the baseline;
  record unrelated failures separately. Backend feature files run individually
  using the security skill's runner where the aggregate suite is unstable.

Exit: reproducible baseline, deployment provenance and recoverable backups.

## 1. Remove immediate storage risk

- Expand release storage first, after recording its contents and recurring cost.
  Target capacity for current files plus two complete release sets and 30% spare.
- Add 80% warning and 90% critical alerts, plus a pre-upload free-space check.
- Introduce configurable object-backed release storage behind the existing
  download/update contracts. Do not conflate desktop releases with community
  deployment artifacts; inspect the release controller/storage owner first.
- Copy retained artifacts, verify SHA-256 and full/range downloads, preserve
  signatures and update URLs, then switch reads with local fallback during the
  observation period. Define retention for active and rollback versions.
- Delete old copies only after verified migration and the retention decision.

Exit: releases can upload with headroom; public installers/update feeds still
resolve the same verified bytes. Rollback: restore old read configuration and
retain original files; capacity expansion itself need not be reversed.

## 2. Close ownership and revocation gaps

Owners: backend RemoteAccess/RelayTokens/RelayGateway/RemotePresence, migrations,
Host identity and account registration, relay authentication/session lifecycle.

**Ownership**

- Immediately reject cross-account registration transfers that have no verified
  computer proof; return an actionable response rather than moving the row.
- Design a reviewed proof-of-possession protocol for the existing
  `Noise_IK_25519_ChaChaPoly_BLAKE2s` identity. X25519 is not a signing key;
  reuse a vetted authenticated handshake/challenge construction, not custom
  signature conversion or a public-ID-as-secret check.
- Bind a short-lived, single-use challenge to account, host key, requested
  action and ownership generation. Complete it only over the intended trusted
  protocol. Persist challenge use and ownership transfer atomically.
- Require explicit Mac account-transfer intent. Concurrent registrations and
  delayed old-account presence must not reverse a completed transfer.
- New accounts cannot preclaim known public IDs without proof. Existing
  same-owner legacy registrations may use a narrowly bounded migration path;
  unsupported transfers fail closed with update guidance.

**Revocation**

- Add a monotonically increasing authorization generation and durable revocation
  outbox. Commit removal/generation change and the outbox entry together.
- Relay authenticates revocation messages, invalidates affected sockets/grants,
  records the generation and acknowledges idempotently. Retry with bounded
  backoff; expose “disconnect pending” when confirmation has not arrived.
- Validate generation against authoritative state on admission/renewal, including
  after relay restart. A signed but revoked unexpired token must be rejected.
- Use renewable relay-side authorization leases, distinct from membership expiry
  and admission-token expiry. Proposed starting point: 60-second renewal,
  180-second maximum lease; validate outage tolerance and load in staging.
  Batch validation through an authenticated private control path where possible.
- Failed authorization renewal eventually closes Cloud sockets within the lease
  bound. Never renew from stale positive cache past that bound. Local Mac work
  continues; users can reconnect once authorization recovers.

Tests: hostile account with known host ID, preclaim, replay/expired challenge,
parallel transfers, A→B→A, delayed presence, failed admin delivery, repeated
revocation, relay/API restart, stale grants, logout/device removal and membership
expiry. Separate account/device authorization from paid entitlement.

Exit: no unproved transfer; successful disconnect acknowledged promptly; failed
delivery ends authorization within the documented lease bound. Adversarially
review fixes. Rollback must retain transfer denial and revocation enforcement;
never restore vulnerable admission behavior to recover compatibility.

## 3. Ship relay reliability and performance improvements

- Port only reviewed candidate changes: old-host phone cleanup, separate bounded
  control/data budgets, membership lease checks and `previewPacingMs: 3` signal.
  Integrate phase 2 authorization leases separately from paid membership leases.
- Preserve 12 ms fallback on older relays and clients; advertise faster pacing
  only from a relay that supports the higher bounded data allowance.
- Separate Host socket writing from reading with a bounded queue. Pacing and a
  blocked write must not stop credits, pongs, revocation or cancellation reads.
- Give terminal/control traffic bounded priority and allocate fair data capacity
  across phones/streams. Keep Open before Credit and preserve per-stream ordering.
- Add clear typed errors for capacity, expired authorization and unavailable
  target. Reconnect with jitter and cancellation; never replay uncertain input
  or automatically restart commands as a connection recovery side effect.

Tests: >120-frame bursts, large assets plus terminal traffic, eight phones,
slow receiver, queue exhaustion, frame ordering, Mac sleep/wake, Wi-Fi/cellular
switch, account switch, cancellation and repeated Preview open/close. Re-run
relay tests, focused Host Rust and mobile queue/proxy tests, then signed native
Cloud fixtures and physical cellular acceptance.

Exit: no stuck old-host phone, no rate-limit disconnect within supported load,
bounded memory and measurable throughput improvement without terminal regression.
Rollback: disable faster pacing or restore the last secure relay image; clients
must negotiate down cleanly. A single-instance update will reconnect sockets;
do not promise uninterrupted Preview during replacement.

## 4. Strengthen monitoring, abuse controls and web defenses

- Configure the actual deployed relay healthcheck. Keep liveness independent of
  API outages; provide protected readiness/dependency diagnostics and synthetic
  authenticated connection checks through dedicated test accounts.
- Measure presence lag, lease failures, reconnects, rate/capacity refusals,
  event-loop delay, send buffers, active connections and per-account byte usage.
  Never log tokens, decrypted Preview content, full user URLs or terminal text.
- Add pre-upgrade connection-attempt limits, authentication timeouts, account
  bandwidth/concurrency budgets and fair queues. Verify Railway trusted proxy
  identity before using forwarded IPs; test spoofing and shared mobile NAT.
- Separate relay signing, admin and reporting credentials where practical, with
  key IDs and a bounded rotation overlap. Restrict admin/reporting networking
  while retaining explicit authentication; rehearse rotation without downtime.
- Reconcile existing header fixes against production. Add HSTS, nosniff,
  framing/referrer policies and remove PHP disclosure. Introduce CSP with a
  reporting/compatibility stage; preserve OAuth, native APIs, downloads and
  deliberately sandboxed hosted content. Retest anonymous endpoint denial.

Exit: useful alerts trigger on injected failures, resource limits reject abuse
without ejecting other accounts, and web/client compatibility checks pass.
Rollback: revert incompatible policy/config independently of core authorization.

## 5. Increase API capacity and make future scaling safe

- Separate web, queue and scheduler roles using the existing role-aware launcher.
  Ensure every named queue has a worker and only one logical scheduler executes.
  Revocation processing must not queue behind long AI/deployment jobs.
- Load-test a production web-server candidate with existing streaming endpoints,
  cancellation, uploads, headers and long requests before replacing `php -S`.
  Size web workers, DB connections and memory from measured concurrency.
- Reserve capacity for registration/grants/presence/lease validation. Verify
  control requests stay responsive during slow AI streams and queue backlog.
- Enforce a one-replica relay guard until routing exists. For growth, assign each
  host an explicit relay/shard endpoint and generation; return it with phone
  grants, route revocations to that owner and use fenced failover. Validate
  endpoint origins against a trusted allowlist. A shared database alone does
  not forward WebSocket traffic between replicas.
- Test two isolated replicas with deliberate split arrival, owner failure,
  stale routing and region loss. Only then enable additional replicas/regions.
  Choose region placement from user latency measurements and operating cost.

Exit: control API meets agreed p95 targets under defined load; no missed jobs or
duplicate scheduler effects; multi-instance routing works before scaling on.
Rollback: role/config rollback with drained workers; restore single-relay routing
and expire affected generations. Preserve migrations and jobs during rollback.

## 6. Evaluate advanced transport optimizations

- After phase 3 measurements, test negotiated receive windows above 64 KiB with
  strict per-stream, per-phone and aggregate memory caps and credit validation.
- Benchmark a versioned binary envelope against JSON/base64 for bytes, CPU,
  allocations and latency. Negotiate support and retain legacy framing.
- Ship either only if controlled before/after results show meaningful benefit
  without fairness, memory, battery or compatibility regressions. Otherwise
  close the investigation with evidence and retain the simpler implementation.
- Never add cloud caching that requires decrypting private Preview content.

## Release gates and completion

Each phase gets an independently reviewable change, focused regression tests,
staging acceptance, deploy artifact/config diff, rollback instructions and
post-deploy source/capability verification. Prepare deployment fully before
the separate live release action. Do not combine storage migration, web-server
replacement and protocol changes into one release.

Provisional targets to confirm against baseline: no unauthorized registration or
revoked admission; revocation bounded by the 180-second lease during outage;
no unexpected disconnects in a two-hour supported-load soak; at least 30% storage
headroom after planned uploads; improved large-asset median throughput with no
material (>10%) p95 terminal/control regression under identical conditions.
Tune numerical performance targets from baseline, never security invariants.

Map of audit coverage: storage→1; ownership/revocation→2; pacing/reconnect→3;
monitoring/abuse/headers→4; worker capacity/replica growth→5; writer separation→3;
window and binary overhead→6. Update audit statuses and the smallest Obsidian
notes after each verified release, distinguishing source, deployment and actual
iPhone acceptance. Physical-cellular and long-session gates remain incomplete
until performed; mocks cannot substitute for them.

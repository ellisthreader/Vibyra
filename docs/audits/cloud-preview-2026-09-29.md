# Vibyra Cloud audit — 29 September 2026

Scope: the production Railway relay and remote-access API behind iPhone Preview,
plus current Host/mobile transport source. Review and recommendations only; no
application changes, deployments, production mutations or load attacks.

## Evidence

- Railway production API: commit `e0f5e0fb143708b0125af2f120c2f5bd62c201e2`,
  `railway-production`, deployed 2026-09-29. Read that Git revision, not the
  substantially different working-tree backend.
- Relay deployment `f78e09d4-8d21-4c5c-a111-e71c04ea3a8b`, created September 14;
  no Git revision in deployment metadata. Read its actual `src/*.mjs` via SSH.
  Running Node 22.23.2, ws 8.21.3. One relay replica in europe-west4-drams3a;
  API and Postgres also have one replica in that region.
- Live relay code still has one 120-envelope/s allowance, no `previewPacingMs`
  ready field, no `accessUntil` enforcement, and old host-replacement behavior.
- Five sequential health GETs each: relay first byte 64–76 ms; API 55–80 ms.
  All returned 200. These are small requests from this Mac, not cellular page
  loading, throughput, concurrency or tail-latency measurements.
- Anonymous `/api/remote/hosts` and relay `/admin/presence` both returned 401.
- API `/up` and `/legal/privacy` lacked HSTS/CSP/frame/nosniff headers and
  exposed PHP/8.3.15. The anonymous session cookie was Secure/HttpOnly/SameSite=Lax.
- Live release mount: `df` reported 99% used, 65 MB available. Railway metadata
  reported 4896.5/5000 MB used (different accounting).
- API configured `VIBYRA_WEB_WORKERS=2`; process inspection showed a PHP web
  parent and two child workers, plus one queue worker and scheduler.
- Current local relay `npm test`: **7 passed, 0 failed**. Includes encrypted
  Preview forwarding beside terminal traffic, replacement and membership lease.
  This does not prove those fixes are deployed or physical iPhone performance.

## Prioritized findings

| Priority | Finding and consequence | Recommended action |
|---|---|---|
| High: availability | Release storage has only 65 MB free. New desktop artifacts can fail to upload; this volume is not the Preview payload path. | Increase capacity or move release artifacts to object storage, with retention and capacity alerts. Inventory before deleting anything. |
| High: security | Deployed `RemoteAccess::register` accepts a caller-supplied public host ID and transfers another account's existing row, disconnecting it, without proving possession of the computer key. An authenticated attacker who knows that ID can disrupt the victim's registration. No Noise decryption/control bypass established. | Require proof of the computer private key through an appropriate challenge protocol and an explicit, atomic account-transfer flow. Never treat the public ID as a secret. |
| High: revocation | `RemoteAccess::revoke` ignores a failed relay disconnect. Live relay checks token expiry only when connecting; existing sockets have no renewable authorization lease. Removing a computer may report success while an already authorized connection survives a failed admin call. | Durable retryable revocation, acknowledgment/status tracking, short renewable authorization leases and rejection of revoked outstanding grants. Membership expiry alone does not solve device revocation. |
| Medium: speed | Old relay caps all traffic at 120 envelopes/s. Compatible current Host/phone source falls back to 12 ms pacing; local relay supports separate bounded data allowance and advertises 3 ms. Preview and terminal share transport capacity. | Release the tested relay changes with rollback and compatible-client checks. This permits about four times the paced frame rate; it is **not** a promise of four times faster pages. Preserve data byte limits and control fairness. |
| Medium: reliability | Live `registerHost` closes an old host but leaves its phones referencing the old object. A Mac reconnect can leave a phone apparently connected with nowhere to send. | Ship the existing local replacement fix, then test Wi-Fi loss, Mac sleep/wake, account switching and reconnect during Preview. |
| Medium: capacity | Two PHP child workers serve account/control requests alongside potentially long API requests; queue and scheduler share the API service. Low-load health is good but does not establish saturation behavior. | Isolate web/queue/scheduler roles and control API capacity; use a production web-server setup validated for streaming. Measure before tuning worker counts and database connections. |
| Medium: monitoring | Actual relay deployment has no configured Railway healthcheck, although a local config file specifies `/health`. The endpoint returns process health even if presence reporting fails. | Configure deployment healthcheck; monitor presence lag, reconnect/error rates, send buffers, event-loop delay and synthetic authenticated sessions. Keep readiness and API-dependency diagnostics distinct. |
| Medium: protection | Relay has 512 global peers, 32 per socket IP, 8 phones/host, 10-second registration timeout and payload/buffer bounds. It does not enforce account-wide bandwidth budgets or a pre-upgrade attempt budget; IP identity behind Railway proxy needs verification. | Add trusted-proxy-aware edge connection limits, account byte budgets and fair queues. Verify real client IP behavior; never blindly trust forwarded headers. Test abuse only in isolation. |
| Medium: website hardening | Live sampled API pages lack defense-in-depth headers and disclose PHP version. Earlier security-fix branch notes are not proof of deployment. | Reconcile reviewed security fixes with the exact production branch; deploy headers compatible with native clients, OAuth, hosted content and downloads, then re-probe. |
| Medium: growth | Host/client matching is an in-process Map. Blindly increasing replicas can put the phone and Mac on different relay instances. | Add explicit host-to-relay routing or a cross-instance transport design before scaling replicas/regions. Retain one replica until routing supports more. |

Backend evidence locations at the deployed revision:
`backend/app/Http/Controllers/RemoteAccessController.php::registerHost`,
`backend/app/Services/Remote/RemoteAccess.php::register/revoke`,
`backend/app/Services/Remote/RelayGateway.php::disconnect`, and
`backend/scripts/start-production.sh`.

Relay evidence: live `src/relay.mjs::registerHost/connectClient/message`,
`src/registry.mjs::send`, `src/main.mjs::startRelay`. Candidate replacements
are in `host/relay/src/relay.mjs`; compare live code rather than inferring
deployment from local tests or dates.

## Further performance work after the relay update

- Benchmark cold/warm pages, 1/10 MB assets and native window frames alongside
  terminal interaction on actual cellular. Record p50/p95 time to first visible
  content, throughput, stalls, reconnect recovery and memory, by client build.
- Review `host/crates/server/src/relay.rs`: pacing sleeps and socket writes occur
  inside the selected receive branch, delaying reads while they await. Separate
  the writer with bounded queues so credits/pongs keep flowing under backpressure.
- The phone default receive credit is 64 KiB (`mobile/src/preview/frameCodec.ts`).
  Evaluate negotiated bounded windows against measured RTT and memory; do not
  simply remove limits. At 100 ms RTT, 64 KiB/RTT is roughly 0.625 MiB/s per
  stream as a simplified window ceiling, before other protocol costs.
- JSON/base64 relay envelopes add bandwidth and allocation overhead. A versioned
  binary envelope is a later optimization, requiring old-client compatibility,
  byte limits and comparative benchmarks. The cloud cannot cache decrypted
  Preview pages without changing the privacy architecture.

## What is solid

Noise-encrypted payload forwarding separates content from account/presence APIs.
Relay tokens are HMAC-verified using constant-time signature checks and bound to
role/host/account. Anonymous admin access is refused. Payload, buffer and peer
bounds exist, WebSocket compression is disabled, and client permission checks
remain separate from relay account authorization. Preserve these properties.

## Delivery order and acceptance

1. Capacity headroom and ownership/revocation security fixes.
2. Tested relay release: pacing, reconnect cleanup, lease support, healthcheck.
3. Cellular before/after measurements, control-API isolation, observability.
4. Adaptive windows and binary framing only if measurements justify them.

Use isolated fixtures for hostile-account registration, revoked-token replay,
failed disconnect retries, slow receivers, rate bursts and concurrent phones.
Never perform disruptive variants against the user's active production session.
No measured speedup, complete penetration-test certification, physical-cellular
acceptance or backup-restoration result is claimed by this review.

Railway's current documentation says replicas are randomly balanced and sticky
sessions are unsupported: https://docs.railway.com/deployments/scaling . This
supports the routing recommendation; a shared registry alone does not forward
traffic between sockets living on different instances.


## Remediation follow-up (same day)

The user authorized implementation after the audit and plan. Reviewed source now
covers ownership proof/explicit transfer, generations and renewable authorization,
relay budgets/pacing/diagnostics, Host writer separation, storage migration/capacity
checks, headers and optional isolated web workers. See
`docs/cloud/remediation-results-2026-09-29.md` for test counts and limitations.
These are candidate changes, not corrections to the production observations above:
no production deployment, volume expansion, key rotation, object migration or signed
Mac release occurred. Cellular and long-session gates remain open. Preserve this
source/live distinction when continuing the work.

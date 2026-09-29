# Vibyra Cloud implementation and verification — 29 September 2026

Status: implemented and locally tested; **not deployed**. Production storage,
client release, physical cellular acceptance and long-session acceptance remain open.

## Delivered source

| Area | Implemented behavior | Verification / limit |
|---|---|---|
| Computer ownership | Short-lived single-use sealed-box proof bound to account/session, host, action and generation; known public IDs cannot claim a computer. Transfers require a scoped Mac confirmation. | Cross-language PHP/Rust proof, replay/expiry/wrong-owner tests; native scope and browser consent fixture pass. Older Mac clients must update. |
| Revocation | Durable outbox, generation fencing, authoritative admission/renewal, 60-second renewal and a 180-second authorization lease during API failure (subject to timer scheduling). | Real PHP/SQLite-to-relay test rejects stale tokens and closes revoked sockets despite failed admin delivery. |
| Relay | Old-host client cleanup, bounded admission/account budgets, protected diagnostics, bounded credential-rotation overlap, single-replica guard and negotiated 3 ms pacing with legacy fallback. | 20 relay tests pass. Actual deployed healthcheck/configuration still needs rollout. |
| Host | Separate bounded socket reader/writer; encrypted frames remain FIFO to preserve Noise nonce order. | 27 Host tests pass, Desktop Rust/TypeScript checks pass. Saturated writer buffering can add latency; phone acceptance remains mandatory. |
| Release storage | Optional private object disk, checksum-verified streaming copy/readback, retained originals, range downloads, pinned disk selection, capacity checks and hourly warning/critical logs. | Storage/download tests pass. No bucket created, artifacts moved, files deleted or live volume expanded. |
| API defenses | Security headers and PHP disclosure removal; separate relay credentials with bounded signing rotation. | Focused header/key tests pass. Live secrets have not been rotated. |
| API capacity | Optional nginx/FPM with separate control and general pools, streaming responses and explicit non-root runtime checks. Existing launcher remains default. | Local real nginx/FPM tests; production Linux image and real application load still require staging. |

The final real API/relay rerun caught a mismatched default signing key ID after
rotation support was added. Matching the PHP default (`current`) fixed admission;
a dedicated regression and the persisted integration fixture now verify it.
Protected diagnostics also include RSS/heap and event-loop delay.

## Test evidence

Full backend comparison ran each feature/unit file independently against the exact
production baseline `e0f5e0fb143708b0125af2f120c2f5bd62c201e2` and the candidate:

- Baseline: **161 / 168 files passed**.
- Candidate: **166 / 172 files passed**; no new failing files. Six inherited failures remain.
- RemoteAccess after final coverage port: **5 tests / 88 assertions**, and
  RemoteCloudAuthorization: **9 tests / 43 assertions**, in both maintained source and candidate.
- Host all-target compilation and Preview tests: **13 passed** (4 library + 9 binary).
- Mobile queue/proxy compatibility: **22 passed**. Release uploader/capacity checks: **27 passed**.
- Header/rotation/storage/download final focused run: **16 tests / 89 assertions passed**.
- Optional web launcher/runtime/real nginx-FPM: **7 tests passed**, including root/static/private routes, uppercase PHP denial, forwarded headers, POST bodies and unbuffered streaming.
- Desktop existing phone source-contract suite: **6 / 8 passed**; two stale assertions
  refer to pre-refactor files, separate from the passing new consent fixture.

The six inherited backend failures are AuthThrottleSeparation, ConnectorOperations,
ProductionProcessTopology, VibesAutoGuardrails, VibesEntitlements and
VibyraProjectPreviewSecurityApi. See baseline/candidate logs beside this report.
This is not an all-green application suite.

Production-dependency scans at verification time: Composer locked/no-dev and
relay npm omit-dev audit both reported zero known advisories. This does not
replace application-level testing.

Paired/interleaved localhost benchmark, 30 samples per pacing setting, identical
512 KiB payloads and hash/order checks:

| Metric | 12 ms pacing | 3 ms pacing |
|---|---:|---:|
| Median transfer | 415.75 ms | 114.82 ms |
| p95 transfer | 424.53 ms | 124.60 ms |
| Synthetic marker p95 | 0.842 ms | 0.642 ms |

The median improved about 72%. This is synthetic loopback, without Noise or
cellular routing, and is **not** a claim of iPhone Preview speed. An earlier
unpaired run showed marker jitter/regression; the paired test corrected ordering
bias, but does not replace physical terminal-latency measurement.

A two-hour connection-churn soak is running separately. Until its final result is
recorded it is pending (last snapshot: at least 1,000 successful cycles, peak RSS 89.6 MB); repeated churn also does not establish persistent-session,
eight-phone, sleep/wake or network-switch acceptance. It began before the final
diagnostics/signing-default edits, so a final-artifact soak is still required. Binary framing was measured
only in a microbenchmark and was not shipped; larger receive windows and multi-relay
routing remain gated experiments, not completed features.

The physical iPhone remained `unavailable` to devicectl after the user offered to
connect it; no physical-device result is claimed.

Final read-only production smoke: API `/up` and relay `/health` returned 200;
anonymous remote-host and relay-admin requests returned 401. The API still
exposes PHP/8.3.15 and lacks HSTS, confirming source fixes are not live. These
Mac-origin probes are not cellular tests.

## Production work still required

1. Increase the release volume or provision verified object storage: the last
   production observation was 99% used, about 65 MB free. Alert log generation is
   implemented; an operator notification destination still needs wiring.
2. Restore a database backup in isolation and retain rollback artifacts/config.
3. Prepare a signed compatible Mac release. The installed app was 0.8.15 build 26;
   this dirty source checkout identifies as 0.7.9. Do not install it over the newer
   app or publish the entire shared checkout. No installed app was replaced.
4. Stage and coordinate API, relay and compatible clients. Fail-closed computer
   proof means an API-only release would block old Mac registration.
5. Validate the Linux FPM candidate before enabling it, configure deployed health
   checks, rotate credentials in bounded overlap, and test alerts.
6. Finish the soak and real cellular Preview/terminal checks on the physical iPhone.

The isolated candidate branch is `codex/cloud-remediation-20260929`. Backend changes
were also ported to maintained source, preserving its market-access middleware.
Host/Desktop changes are in the shared checkout; their manifest records exact
files but does not imply the unrelated dirty checkout is a release candidate.
See [rollout runbook](rollout-2026-09-29.md) for release order and rollback boundaries.

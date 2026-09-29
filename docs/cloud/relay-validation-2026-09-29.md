# Relay candidate validation — 29 September 2026

Source/local evidence only. No deployment, installed-app update, real-account
exercise, or production load test was performed. Tests ran from the shared
working tree; no immutable release artifact is established by this report.

## Relay regressions

From `host/relay`:

```sh
npm test
```

20 tests passed, zero failed/skipped. Coverage includes original forwarding,
account isolation, host replacement and membership expiry; authoritative
admission/restart denial; authorization-service outage and delayed renewal;
generation revocation/replay and old/new-host separation; trusted-header refusal;
bounded admin bodies; protected diagnostics; stale-account presence; and bounded
signing-key rotation. Loopback tests required sandbox escalation. An initial
sandbox run failed six listener tests with EPERM; the authorized rerun passed.

## Existing mobile and Host compatibility checks

From `mobile`:

```sh
./node_modules/.bin/tsx --test tests/previewFrames.test.ts tests/previewOutboundQueue.test.ts tests/httpProxyController.test.ts tests/previewNavigation.test.ts tests/previewTargetMatch.test.ts
```

22 passed, zero failed/skipped. Includes Open-before-Credit ordering, Cloud
pacing, native-write credit timing, malformed-frame isolation, duplex WebSocket
upgrade, 80 KiB form upload, 10 MiB bounded-window transfer, queue fairness,
cancellation and project/navigation scope. These are fixtures, not native iPhone
or physical-cellular acceptance.

From `host`:

```sh
cargo test -p vibyra-host --no-default-features preview -- --test-threads=1
```

4 passed, zero failed/ignored (23 filtered out). Includes real Noise-session
Preview/terminal coexistence against the Host relay-leg fixture and bounded,
origin-safe WebSocket upgrade metadata. Existing dead-code warnings occurred.
The fixture relay is simulated; this is separate from the real Node relay tests.

```sh
cargo test -p vibyra-host preview -- --test-threads=1
```

The first default-feature run caught a real candidate integration error:
`E0433` at `relay.rs:98`, missing `crate::relay_connection` in the binary root.
The writer-separation agent added both `relay_connection` and `relay_writer`
module declarations to `main.rs`; that agent then verified
`cargo check -p vibyra-host --all-targets` passed and the exact default Preview
command passed **4 library + 9 binary tests**, zero failures. Binary coverage
includes 10 MiB Preview alongside terminal replies, malformed frames,
cancellation/revocation, and old same-device cleanup isolation. The additional `cargo test -p vibyra-host --lib preview --
--test-threads=1` passed 4 tests, confirming the error was in binary integration,
not the tested library behavior.

## Real backend integration

The original disposable backend checkout was
`/private/tmp/vibyra-cloud-remediation`. The reproducible generator now lives at
`host/relay/scripts/api-integration-fixture.php`; the verifier accepts a fixture
JSON path. Its `init`, `serve` and `revoke` modes require an explicit disposable
backend under a system temporary root and an owned 0700 fixture directory.
Before `migrate:fresh`, it verifies testing environment, no cached configuration,
and the resolved SQLite connection path inside that directory. Symlinked
fixture/database/output paths are rejected. It creates synthetic credentials
inside 0600 files and never prints them.

Reproduction (from `host/relay`; use a new temporary directory for a new fixture):

```sh
php scripts/api-integration-fixture.php init /private/tmp/vibyra-cloud-remediation/backend /private/tmp/vibyra-relay-owned-fixture-0929 8948
php scripts/api-integration-fixture.php serve /private/tmp/vibyra-cloud-remediation/backend /private/tmp/vibyra-relay-owned-fixture-0929 8948
```

With the loopback server running, in another shell:

```sh
node scripts/verify-api-integration.mjs /private/tmp/vibyra-relay-owned-fixture-0929/fixture.json
```

Rerun `init` immediately before testing if the short-lived tokens have expired;
it resets only the guarded disposable SQLite database. The verifier invokes the
persisted generator's `revoke` mode, which uses real backend revocation but fakes
its outgoing relay-admin response as unavailable. The PHP server receives testing
configuration, array cache/session stores and synthetic matching credentials
from the generator. This is not a production deployment recipe.

The persisted generator passed `php -l` and `init` locally. Its live rerun was
handed to the root agent after the child approval request stalled; the results
below were already proven against the equivalent original temporary fixture
server on port 8947. Any subsequent persisted-fixture rerun is recorded by root.

Passed: real HTTP host/client authorization, actual relay socket forwarding,
real backend revocation with failed immediate admin delivery, renewal closing
both peers, and stale-token readmission denial. The authorization clock advances
60 seconds locally; this validates renewal behavior without waiting a real minute.
The first run used expired short-lived client credentials and was refused;
regenerating the disposable fixture made the complete scenario pass.

## Local benchmark

From `host/relay`:

```sh
node scripts/benchmark.mjs
```

30 samples per setting, paired/interleaved order, identical deterministic
512 KiB payloads, one synthetic terminal-size marker, frame-order and payload
SHA-256 checks. Both settings use the same real local Node relay. Fixtures
explicitly inject standalone authorization; there is no Noise handshake, real
terminal, mobile radio or remote-network delay.

The raw JSON tool output was preserved through
`/private/tmp/vibyra-relay-paired-benchmark-2026-09-29.jsonl` and copied to
[relay-paired-benchmark-2026-09-29.jsonl](relay-paired-benchmark-2026-09-29.jsonl).

| Metric | 12 ms pacing | 3 ms pacing |
| --- | ---: | ---: |
| Median transfer | 415.749 ms | 114.819 ms |
| p95 transfer | 424.532 ms | 124.597 ms |
| Marker minimum | 0.289 ms | 0.262 ms |
| Marker median | 0.506 ms | 0.455 ms |
| Marker p95 | 0.842 ms | 0.642 ms |
| Marker maximum | 0.896 ms | 0.791 ms |

Sampled send buffers remained zero; this does not establish behavior under
backpressure. The improved method shows a 72.4% median transfer reduction with
no marker regression locally. The initial unpaired run was noisier: transfer
medians 444.929→152.465 ms, but marker p95 3.589→8.012 ms. Retain this as evidence
of scheduling variability; do not extrapolate a guaranteed cellular speedup.

## Encoding investigation

```sh
node scripts/encoding-benchmark.mjs
```

10,000 synthetic 16 KiB encode/decode iterations: JSON/base64 envelope 21,924
bytes, hypothetical 40-byte-header binary envelope 16,424 bytes. Measured
encoding loops were 285.379 ms versus 30.991 ms. This deliberately small
microbenchmark excludes network, cryptography and production routing. No
binary protocol was implemented or shipped.

## Soak status

```sh
RUNS=1 SOAK_SECONDS=5 node scripts/benchmark.mjs
RUNS=1 SOAK_SECONDS=7200 node scripts/benchmark.mjs > /private/tmp/vibyra-relay-soak-2026-09-29.jsonl 2>&1
```

The five-second connection-churn path passed six cycles. The two-hour run is
**pending**, PID `89764`, tool process session `70507`. Last inspected progress:
250 cycles, peak RSS 82,821,120 bytes, no failure record. This continuously
creates local connections and verifies transfers; it does not hold one session
for two hours, simulate eight phones, renew live backend leases, or test
cellular handoffs. Keep those acceptance gates open.

## Independent backend review

Read-only adversarial review found two issues in the initial candidate:

- Presence looked up owner/generation before a later write, allowing a concurrent
  revoke/transfer race. Backend agent added transaction/row locking.
- Same-owner legacy registration bypassed device proof without a migration bound.
  Backend agent changed registration to require proof on every registration.

Root additionally identified old-host/new-grant generation mismatch; relay now
requires exact generation equality and rejects older host replacement. Generation
fences are bounded to 4,096 entries with expiry; authoritative admission remains
the durable restart/expiry security boundary. Focused regressions cover the
principal cases; this review is not an independent cryptographic audit.

## Open release gates

Physical cellular and signed native acceptance, real-network latency distributions,
persistent-session and eight-phone/backpressure soak, operational failover,
release/rollback provenance, deployment configuration, alerts and recovery drills
remain separate. `git diff --check -- host/relay` passed. No live service changed.


## Final root verification

The persisted fixture was rerun on loopback8948. It initially exposed the JS
verifier's missing default signing-key ID while PHP issued `kid=current`.
Root aligned the default and added a regression. The final real API/relay run
passed admission, forwarding, failed-admin renewal revocation and stale denial.
Protected diagnostics now include RSS, heap and event-loop p95/max delay; the
monitor is disabled on close and unauthorized diagnostics remain401.

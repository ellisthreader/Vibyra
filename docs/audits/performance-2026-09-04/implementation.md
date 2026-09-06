> Deployment and test update - 5 September 2026: 0.4.4 is published and installed locally. Signed packages passed isolated native workspace checks; cloud-save body bytes fell by 99.97% in the 40-history fixture. Phone, compositor and remaining security limits are recorded in `docs/audits/performance-release-0.4.4.md`. The remainder below describes the earlier audit-checkout stage.

# Vibyra performance implementation — 4–5 September 2026

The audit's measured persistence, cloud-transfer, watcher and resource-boundary improvements are implemented in the canonical `/home/ellis/Desktop/Vibyra` working tree. Corrupted assets are recovered and the Expo web export now succeeds. A production Nginx/PHP-FPM launcher is prepared and exercised locally. **Nothing was deployed, installed, committed or published.**

This follows the [original audit](report.md), whose audit-only status and baseline results remain historical. This report records the implementation and its limits; passing the available checks cannot establish 100% coverage, zero possible regressions, or maximum performance on every device. Existing unrelated desktop, marketing and repository-note work was preserved.

## Measured results

| Scenario | Before / reference | Implemented result | Interpretation |
| --- | ---: | ---: | --- |
| 100 synchronous local-state changes, 40 threads × 80 messages | 100 normalizations; 1,864.62 ms CPU | One normalization; 17.23 ms; final title retained | 99% fewer normalizations in this burst. This is Node CPU work, not a phone frame-rate measurement. |
| One changed message in the 40 × 80 cloud fixture | 6,846,380-byte request; 6,851,604-byte response | 4,495-byte request; 27-byte response | About 99.93% fewer request bytes. First synchronization still sends full state. |
| Warm Laravel save, same fixture, 20 changes per mode | Legacy full-save p50 438.43 ms / p95 551.88 ms | Delta p50 257.78 ms / p95 300.56 ms | About 41% lower median elapsed time in this local fixture; no production latency claim. |
| Initial full save with compact response | Full response above | 27-byte response; p50 286.67 ms | Compact acknowledgements also help before delta negotiation. |
| Watcher with 3,000 ignored generated directories | 3,003 kernel watches; approximately 67 ms registration | Two kernel watches; approximately 0.35 ms registration | Source events still arrived; ignored events did not. |
| PNG integrity / Expo export | 14 failures in the original 114-file scan; export failed | Broader 134-file scan passes; 18 assets repaired; export passes | Includes four damaged Remotion duplicates discovered during implementation. |

The local-save benchmark uses actual persistence normalization and the coalescer. The cloud benchmark runs through the Laravel HTTP kernel with synthetic accounts, warm in-memory SQLite and no real network/provider calls. Its legacy reference uses the legacy response path in the updated backend, including the new transaction. This is not a claim that the entire old deployment was replayed. All three cloud modes used four queries. The full JSON database row is still read and rewritten, and the harness peak was approximately 125 MiB; delta transfer does not remove that storage scaling limit.

Detailed data: [local persistence](implementation-evidence/persistence-bench.json), [cloud saves](implementation-evidence/sync-bench.json), [native watches](implementation-evidence/watcher-bench.json), [PNG integrity](implementation-evidence/assets-final.json).

## Behavior and safeguards

**Local state and credentials.** Replaceable snapshots coalesce before expensive normalization, with a fixed 200 ms window that continuous streaming cannot postpone indefinitely. The storage queue runs one operation at a time and coalesces adjacent pending snapshots. Credential barriers retain ordering and separate those groups. Identity changes cancel old pending closures; logout invalidates their generation before clearing storage. Lifecycle transitions flush the latest scheduled state. Verified secure-storage reads avoid rewriting identical credentials while recovering externally deleted values. Failed secret reads prevent overwriting public storage with an unsafe interpretation. Forced process termination can still prevent asynchronous persistence from finishing.

The simulated text-stream helper now appends each chunk once instead of repeatedly slicing and joining the accumulated history. Timing and cancellation behavior are retained. Mobile React rendering and virtualization were not speculatively redesigned.

**Cloud synchronization.** New clients negotiate `syncVersion: 1` using the existing full-save endpoint, then use `/api/session/state/delta`. Older clients retain the old response unless they request `responseMode: ack-v1`; new clients can fall back when an older server lacks the delta route. The existing 700 ms scheduling delay and 30-second retry cooldown remain. Pending histories are bounded to the latest queued snapshot.

Delta updates validate allowed roots and paths, compare previous values, guard array-object identities against remote reordering, apply atomically under a user-row lock, and acknowledge replays idempotently. A lost acknowledgement is replayed before a newer change. Conflicts return 409 and preserve remote data; they never trigger a full overwrite. The local copy is retained and a warning is logged. **Automatic conflict resolution is not implemented:** a conflicting edit needs reconciliation; repeatedly retrying the same preimage cannot resolve it. Authentication, permissions, pricing and credit authority remain server-owned. No schema migration is required.

Whitespace and empty strings remain exact for the versioned sync protocol so comparisons work. The middleware exception is limited to delta requests and `ack-v1` full saves; existing normalization remains on legacy saves and other routes. The delta endpoint limits operation count, path depth and aggregate state size (48 MiB). Same-length arrays can update individual elements; structural array changes remain atomic.

**Native desktop.** Watch registration prunes excluded subtrees instead of recursively subscribing and filtering afterward. New/renamed directories refresh registrations, symlink directories are not followed, ordinary file writes do not rescan the tree, and overflow triggers a root invalidation. Worker delivery is batched and bounded. Dropping the watcher stops its worker and releases watches.

PTY admission is capped at 4 MiB and 1,025 messages per session, including the write in progress. Reservations happen before allocation and sending; the original immediate channel handoff and synchronous IPC command preserve ordering without waiting for the child to read. Capacity rejection rejects a complete input event and tells the user to check the command before pressing Enter. That in-app warning remains visible when optional notifications are muted, stays separate from unrelated performance bursts, and replaces repeats for the same terminal. It remains silent and does not send OS notifications. The existing frontend rejection handler carries it, preserving direct IPC dispatch without an additional per-keystroke promise chain.

Voice capture owns and cleans up its recorder process and temporary file. A native 120-second recorder deadline and 3,840,000-byte read limit bound 16 kHz mono 16-bit audio independently of UI metering. Discard skips the read. Tests use synthetic audio and a controlled child process; no real microphone or paid transcription was used.

**Assets and build scope.** Repairs restore bytes removed by accidental CRLF normalization. They are checked against original chunk CRCs, exact inverse normalization or an exact valid duplicate, and complete pixel decoding. They are not substitute artwork. Binary Git attributes remain in place. Metro excludes the separate desktop/docs trees, and the mobile TypeScript scope excludes dated audit harnesses. Remotion typechecking and a real still render also passed.

## Production server preparation

Root and backend Railway/Nixpacks definitions use the same role-aware launcher. Web processes now start Nginx plus PHP-FPM; scheduler and queue-worker roles remain available. Only the public directory and its exact PHP front controller are served; hidden files and other PHP paths are denied. Authorization headers, POST bodies, static MIME types and streamed responses are preserved. Upload/post limits remain 8/48 MiB.

The default is four FPM workers. `VIBYRA_FPM_WORKERS` accepts 1–64 and must be sized against actual container memory and concurrent long requests. `VIBYRA_REQUEST_TIMEOUT` defaults to 2,100 seconds, preserving two existing 900-second Deep Research provider attempts plus bookkeeping. Streaming buffering is disabled. Process identity is inherited from the container; runtime configs and the Unix socket live in a private directory. Startup validates both server configs, and shutdown signals/reaps the owned servers and removes that directory. Immutable deployments disable opcode timestamp checks and require a process restart after code changes.

The isolated runtime fixture checks streaming alongside ordinary health responses, authentication-header forwarding, static files, blocked paths and cleanup. In the final run, the first streamed event arrived in 3.65 ms and all 12 health requests completed while the two-second stream remained open (maximum 6.21 ms). A second fixture exercises the actual Laravel API through Nginx/FPM with an isolated SQLite database: unauthenticated rejection, authenticated reads, compact saves, exact whitespace, delta replay and conflict preservation. These checks do not constitute a Railway image build, production concurrency test or a 35-minute provider run. Four simultaneous long requests can still occupy all four PHP workers.

For rollout, first build the deployment image and run those checks against a staging instance using its real database engine and proxy. Measure worker memory and latency with mixed streams, saves and health requests before choosing concurrency. Check the platform's own connection/drain limits as well as application timeouts. The prepared runtime rollback is `VIBYRA_WEB_SERVER=legacy` followed by restarting the service; the previous image is also an option. Backend rollback remains compatible with new clients through capability fallback. No production rollout was performed in this task.

Configuration references: [PHP-FPM settings](https://www.php.net/manual/en/install.fpm.configuration.php), [Nixpacks PHP provider](https://nixpacks.com/docs/providers/php), [Nixpacks configuration](https://nixpacks.com/docs/configuration/file), [Laravel input normalization](https://laravel.com/framework/docs/12.x/requests).

## Validation and follow-up

The implementation's suites passed: 154 mobile tests with type and source-size checks; 437 desktop frontend tests; and 390 Laravel tests with 2,455 assertions, three existing PHPUnit notices and one existing skipped bridge integration. Final desktop type, dead-code and source-size checks passed. The ignored native clipboard integration requires separate display/clipboard coverage. Production frontend builds passed for Expo web, desktop and the concurrent marketing tree. Website redesign gains are not attributed to this work.

Source fingerprints distinguish tested revisions. The final writer and timeout changed after the earlier saved test set and were revalidated. The final notification-policy refinement received a new desktop suite, static checks and production build. A host restart cleared temporary binaries, so the native comparison was reconstructed from the saved scripts.

The final Rust workspace passed **316 tests** (126 core, 188 desktop, two updater-signing), with one existing ignored clipboard test. Formatting and clippy across all targets passed with warnings denied. The native cases include real PTY ordering and a blocked reader, byte/message admission recovery, newly created and renamed source directories, watcher teardown, and bounded voice-file cleanup.

The final controlled comparison used frozen native sources and the same minified diagnostic frontend, changing only `writer.rs`. It ran baseline/bounded/bounded/baseline and reversed the phase order, with 100 markers in each of eight phases. Both executable hashes and the native admission-error implementation were verified before running. There were **zero dropped markers out of 800**.

| Writer / phase order | Focused p50 / p95 | All-visible p50 / p95 |
| --- | ---: | ---: |
| Baseline; all-visible first | 9 / 22 ms | 38 / 63 ms |
| Bounded; all-visible first | 9 / 16 ms | 40 / 64 ms |
| Bounded; focused first | 10 / 20 ms | 35 / 54 ms |
| Baseline; focused first | 9 / 16 ms | 33 / 48 ms |

These measure the next animation-frame callback following xterm parsing, not physical input-to-photon latency. The focused p95 ranges overlap; all-visible timings vary and are sometimes higher with the bounded writer. Other applications/builds remained active, with host load recorded per run. This supports retained input delivery and comparable focused behavior in this fixture, **not statistical equivalence or a guarantee of zero latency impact**. The shared frontend predates the final failure-only notification refinement, which has separate final tests and build evidence; the successful typing path is identical. See [raw comparison](implementation-evidence/native-controlled-comparison.json), [summary](implementation-evidence/native-comparison-summary.json) and [binary integrity](implementation-evidence/native-binary-integrity.json).

Further optimization should follow measurements from real release devices and staging: profile long chat lists and streamed rendering on iPhone/Android; measure packaged desktop startup and sustained multi-terminal sessions on Linux, Windows and macOS; test real microphone lifecycle and provider cancellation; inspect production database/worker telemetry; then assess history partitioning, pagination and UI work. These are remaining acceptance checks, not claimed completed work. Unmeasured UI rewrites and an unverified live deployment would not support the user's requirement to preserve behavior.

The normal canonical development binary was rebuilt after the comparison, without the diagnostic frontend override or custom-protocol feature. Audit-owned terminal/server processes were stopped and private web runtime directories removed. No installed application was replaced. See [cleanup record](implementation-evidence/cleanup.json), [evidence notes](implementation-evidence/README.md) and the [final check inventory](implementation-evidence/validation-summary.json).

> Deployment and test update - 5 September 2026: 0.4.4 is published and installed locally. Signed packages passed isolated native workspace checks; cloud-save body bytes fell by 99.97% in the 40-history fixture. Phone, compositor and remaining security limits are recorded in `docs/audits/performance-release-0.4.4.md`. The remainder below describes the earlier audit-checkout stage.

# Performance Implementation

Routes from [[Performance Audit Workflow]]. The dated implementation and raw
synthetic evidence live in `docs/audits/performance-2026-09-04/implementation.md`.

## App Persistence And Sync

- `latestPersistenceTask.ts` coalesces normalization into a fixed 200 ms window;
  `usePersistenceSchedule.ts` flushes background/pagehide/unmount and cancels
  across identities. Secret-clearing entrypoints invalidate pending generations
  before their ordered storage barrier, so an old render cannot restore tokens.
- `persistenceWriteQueue.ts` runs one operation at a time and coalesces adjacent
  pending saves. Credential barriers separate groups and never coalesce.
  Both local and cloud persistence use it.
- `persistenceSecretValues.ts` verifies storage on every credential decision;
  equal verified secrets avoid writes. Failed reads must block public overwrite.
  Never substitute a process cache for actual secure-storage verification.
- `cloudStateTransport.ts` first posts `/api/session/state` with
  `responseMode: ack-v1`. A `syncVersion: 1` acknowledgement enables
  `/api/session/state/delta`; older servers/clients retain full-state support.
- Deltas include prior values and existence, compare under a user-row lock,
  apply atomically and replay idempotently. Same-length message edits guard IDs;
  structural array changes remain atomic. Only app-state, onboarding and
  remembered-desktop fields are accepted; existing authority/credential filters
  still apply. There is no database schema migration.
- Replay an uncertain prior write before sending a newer snapshot. A 409
  preserves cloud state and leaves the local edit; never silently full-overwrite
  to resolve it. Only missing-route 404/405 responses trigger compatibility fallback.
- In `backend/bootstrap/app.php`, only the opted-in state protocol bypasses
  trimming and empty-string conversion. Exact preimages depend on this boundary;
  legacy saves and other endpoints retain their existing normalization.

## Native Resource Boundaries

- Watcher exclusions prune registration, including newly created and renamed
  directories. Changes coalesce into bounded batches; directory refresh/overflow
  invalidates the root. Keep traversal inside the selected tree without following
  directory symlinks. Drop stops delivery and releases registrations.
- PTY input admission is bounded per session by 4 MiB and 1,025 admitted messages,
  including any write in progress. Reject a complete input event when full;
  never block the synchronous IPC thread. The existing keyboard rejection handler
  displays an in-app notice even when optional notifications are muted. Keep
  it separate from generic performance bursts and replace repeated warnings.
  Preserve native FIFO and direct frontend IPC dispatch.
- Voice capture has an independent 120-second recorder deadline and bounded
  read; drop stops/reaps the child and removes its file. The meter is not the
  authority for stopping capture. Forced OS termination is a separate case.

## Production Runtime

- Root and backend Railway/Nixpacks configs share the role-aware launcher.
  The web child runs Nginx plus PHP-FPM; worker/scheduler roles remain separate.
- `production-config.php` generates private temporary configs; only `public/`
  and its index controller are served. Streaming buffering is off, auth headers
  survive, upload/post limits remain 8/48 MiB, and other PHP/hidden files are denied.
- `VIBYRA_FPM_WORKERS` defaults to 4; `VIBYRA_REQUEST_TIMEOUT` to 2,100 seconds
  to preserve two 900-second Deep Research attempts plus bookkeeping.
  Size workers against actual container memory and PHP's effective memory limit.
  Opcode timestamps are disabled for immutable deployments: restart on code changes.
- `VIBYRA_WEB_SERVER=legacy` restores the former web server in the same image.
  This is an operational rollback, not the desired production capacity setting.
- Test the actual Laravel API through the server with isolated SQLite/users;
  also test a slow SSE response alongside fast health requests and process cleanup.
  A local runtime check is not a Railway deployment or production load test.


---

> Merged 6 September 2026: the section below is the release-baseline note that lived on `release/0.4.4-performance`; the text above is the audit-checkout note from the main checkout.

## Performance implementation and release baseline

Performance changes are ported onto release/0.4.4-performance from the live
0.4.3 source. The original audit checkout remains on 0.2.8 and contains unrelated
work; never publish that checkout as a replacement for the current release.

- Cloud sync negotiates ack-v1 before sending bounded guarded deltas. A lost
  acknowledgement is replayed before newer edits; conflicts return 409 and
  preserve both clients rather than silently replacing remote state.
- Persistence coalesces snapshots before normalization and preserves credential
  barriers. Mobile, desktop and Remotion have separate typecheck boundaries.
- Native input admission bounds bytes and messages without blocking synchronous
  IPC ordering. Rejected input always has visible in-app feedback.
- Watcher event queues and batches are bounded. Source-directory changes trigger
  re-registration. Windows uses one recursive root handle so watched descendants
  cannot block a parent rename; generated events are filtered before queueing.
  Other platforms prune generated directories at registration. Pruning already shipped in
  0.4.3, so the old audit's watcher-count gain is not a new release improvement.
- Dictation owns its process and temporary recording and caps capture at 120 s.
- The production web launcher supports Nginx/PHP-FPM and a legacy rollback via
  VIBYRA_WEB_SERVER=legacy. Test the actual Nixpacks image, streamed responses,
  auth headers, static files, hidden/PHP denial and Laravel sync before cutover.
  Nginx defaults to two workers: auto saw 48 host CPUs in Railway despite an
  eight-CPU quota. VIBYRA_NGINX_WORKERS accepts 1-16; FPM defaults to four.
- Compare performance against the live release on the same hardware. Historic
  synthetic gains do not prove a whole-app or physical-phone percentage.

Published 0.4.4: signed desktop source/tag 7a00633/v0.4.4, Actions 33972227791;
backend cc8f57f, Railway 8af52660-07c6-48f2-a805-a3c56d2d1ab4. Public installer
hashes and updater feeds were verified; the stable local AppImage is updated.
Signed 0.4.3/0.4.4 packages completed fixture password sign-in, project opening,
exact typing/paste and a 5,000-line native terminal workload in Xephyr on the PC.
Private-keyring failure still permits a verified in-memory session. Idle CPU and
input injection timings do not establish a release speed-up. A cold paste followed
immediately by Enter remains an unresolved ordering edge case. Normal compositor,
multi-pane key-to-paint and phone delivery/performance remain unverified.
Actual mobile transport plus Laravel fixture measured 99.97% fewer HTTP body bytes
for one edit among 40 synthetic histories; this excludes initial sync, headers and
TLS, and is not a delivered phone result. Overall Security CI retains historical
scan/mobile dependency failures; backend checks pass.
Evidence and precise limits: docs/audits/performance-release-0.4.4.md.

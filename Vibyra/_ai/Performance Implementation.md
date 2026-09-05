# Performance implementation and release baseline

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

Release evidence and deployment status belong in docs/audits/performance-release-0.4.4.md.

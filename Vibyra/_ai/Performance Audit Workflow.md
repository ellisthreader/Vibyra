# Performance Audit Workflow

Use `.agents/skills/VibyraOptimse/SKILL.md` for broad performance audits and
`vibyra-expo-web-diagnostics` when an Expo image transform blocks the baseline.
Keep desktop Tauri, Expo phone/browser, Laravel API, and marketing evidence
separate; see [[Product Surfaces]].

## Evidence And Scope

- The canonical repo is `/home/ellis/Desktop/Vibyra`; the SaaS checkout is
  retired. Record HEAD and existing/concurrent dirty work before testing.
- Use isolated synthetic fixtures, scratch build output, and in-memory Laravel
  storage. Never describe a local kernel benchmark as production network time.
- Full available tests are not full runtime coverage. Explicitly list missing
  phone devices, operating systems, authenticated flows, production telemetry,
  and soak tests. Do not promise a 100% performance or no-regression guarantee.
- Native latency probes need isolated XDG settings and unavailable real
  keyring/account access. Reverse phase order. The `paint` metric measures the
  next requestAnimationFrame callback, not physical frame presentation.
- Shared Cargo output can contain a diagnostic binary after a custom-protocol
  build. Copy the probe to scratch and restore the default build output; never
  install it. Stop only audit-owned processes.
- Source can change while measurements run. Retain baseline bundle evidence,
  recheck changed surfaces, and flag a superseded website baseline explicitly.

## Source Boundaries Confirmed In September 2026

- Terminal input ordering lives in the synchronous Tauri `write_terminal`
  command and `vibyra-core/src/pty/writer.rs`. IPC enqueues immediately; blocking
  writes run on a per-PTY thread. Do not restore frontend await-per-key queues.
- Output batching, hidden-pane hibernation, renderer/font readiness, resync,
  session-save ordering, and server-owned permissions/billing are optimization
  constraints. See [[Desktop/Tauri Terminal Performance Overhaul]].
- `vibyra-core/src/fsx/watch.rs` registers a pruned source tree with bounded
  event delivery. Check kernel watch counts, new/renamed directories and drop;
  callback filtering alone does not establish that dependencies are unwatched.
- Expo local persistence is in `src/context/useAppStatePersistence.ts` and
  `src/utils/persistenceSecrets.ts`; cloud sync is in `useCloudSync.ts`.
  Both queues serialize writes and coalesce adjacent pending snapshots. Local
  credential barriers separate those groups. Normalization waits up to 200 ms;
  credential clears invalidate delayed work.
  Cloud sync negotiates compact acknowledgements and preimage-checked deltas.
  See [[Performance Implementation]] for compatibility and retry boundaries.
- `voice_recording.rs` owns recorder cleanup and caps reads at 120 seconds of
  16 kHz mono PCM; `arecord --duration` supplies the independent capture limit.
- `start-production.sh` delegates web serving to `start-production-web.sh`
  (Nginx/PHP-FPM, with an explicit legacy rollback). Inspect effective deployed
  workers before capacity claims; source does not establish live topology.
- An image filename and valid TypeScript are insufficient asset validation.
  Decode imported PNGs and run Expo export. A `desktop` Metro exclusion also
  does not cover the current `desktop-tauri` directory.
- Cargo's native executable is `debug/vibyra-desktop`; an old `debug/Vibyra`
  file may still exist. Use the current build artifact, checksum and probe
  completion marker to establish which binary ran.

## Audit Artifact

`docs/audits/performance-2026-09-04/report.md` contains the dated measurements,
test results, limits, and staged recommendations; its `evidence/` directory
holds synthetic data. Those figures are a baseline, not permanent product
performance guarantees. Repeat affected measurements after implementation.
The companion `implementation.md` records subsequent changes and validation.
